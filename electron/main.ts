import 'dotenv/config'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { appendFile, copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import Store from 'electron-store'
import { is } from '@electron-toolkit/utils'
import defaultCharacterCardData from '../characters/android18.card.json'
import trayIconPath from '../assets/tray-icon.png?asset'
import appIconPath from '../assets/icon.png?asset'
import bundledPetImagePath from '../assets/android18-chibi.png?asset'
import { isPng, readPngCharacterCard, writePngCharacterCard } from './png-card'
import {
  findCommand,
  findGreeting,
  isPluginEnabled,
  loadPlugins,
  pickText,
  PluginScheduler,
  pluginSystemPrompt,
  renderTemplate,
  toPluginInfo,
  type LoadedPlugin
} from './plugins'
import type { PluginListResult, PluginLoadError, PluginMessage } from '../shared/plugin-types'
import type {
  CardImportResult,
  CharacterCard,
  CharacterCardInfo,
  ChatMessage,
  ConfigPatch,
  FileActionResult,
  LocalModelInfo,
  LocalSettings,
  LocalStatus,
  PetConfig,
  RendererConfig,
  WorkspaceDirKey
} from '../shared/types'
import type { LlmChatTurn } from '../shared/llm-protocol'
import { LocalLlmClient } from './llm-client'


const defaultCharacterCard = defaultCharacterCardData as CharacterCard

const defaultLocalSettings: LocalSettings = {
  modelPath: '',
  gpuBackend: 'auto',
  vramMode: 'auto',
  contextSize: 4096,
  batchSize: 512,
  threads: 0,
  flashAttention: true,
  useMmap: true,
  useMlock: false,
  allowSharedMemory: false,
  kvCacheType: 'F16',
  // 兼容旧版本：Windows 下默认继续扫描 E:\mod，其他系统默认不扫描额外目录
  extraModelDirs: process.platform === 'win32' ? ['E:\\mod'] : []
}

const defaultConfig: PetConfig = {
  interactionMode: 'pet',
  storyContext: '',
  characterId: 'builtin:android18',
  characterPngPath: '',
  provider: 'api',
  baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY?.trim() || '',
  model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-flash',
  temperature: 0.8,
  maxTokens: 320,
  characterCard: defaultCharacterCard,
  modelImagePath: '',
  affinity: 0,
  petScale: 1,
  alwaysOnTop: true,
  pluginStates: {},
  local: defaultLocalSettings
}

type WindowPosition = { x: number; y: number }

const store = new Store<{
  windowPosition?: WindowPosition
  config?: Partial<PetConfig>
  messages?: ChatMessage[]
  memories?: Record<string, ChatMessage[]>
}>()

let mainWindow: BrowserWindow | null = null
const localLlm = new LocalLlmClient()
let panelExpanded = false
let tray: Tray | null = null
let savePositionTimer: NodeJS.Timeout | undefined
let loadedPlugins: LoadedPlugin[] = []
let pluginErrors: PluginLoadError[] = []
const pluginScheduler = new PluginScheduler()
let pluginTicker: NodeJS.Timeout | undefined

function appRootDir(): string {
  if (is.dev) return process.cwd()

  const exeDir = dirname(process.execPath)
  const parentDir = dirname(exeDir)
  if (basename(exeDir) === 'Android18DesktopPet' && basename(parentDir) === 'dist') {
    return dirname(parentDir)
  }

  return exeDir
}

function rootPath(...parts: string[]): string {
  return join(appRootDir(), ...parts)
}

function workspaceDirs(): Record<WorkspaceDirKey, string> {
  return {
    models: rootPath('models'),
    plugins: rootPath('plugins'),
    chats: rootPath('chats'),
    cache: rootPath('cache'),
    characterCards: rootPath('character-cards')
  }
}

async function ensureWorkspaceFolders(): Promise<void> {
  await Promise.all(Object.values(workspaceDirs()).map((path) => mkdir(path, { recursive: true })))
}

function mergeCharacterCard(card?: Partial<CharacterCard>): CharacterCard {
  return {
    ...defaultCharacterCard,
    ...(card || {}),
    speechStyle: Array.isArray(card?.speechStyle) ? card.speechStyle : defaultCharacterCard.speechStyle,
    behaviorRules: Array.isArray(card?.behaviorRules) ? card.behaviorRules : defaultCharacterCard.behaviorRules
  }
}

function mergeLocalSettings(local?: Partial<LocalSettings>): LocalSettings {
  return {
    ...defaultLocalSettings,
    ...(local || {}),
    modelPath: local?.modelPath?.trim() || defaultLocalSettings.modelPath,
    gpuBackend: local?.gpuBackend || defaultLocalSettings.gpuBackend,
    vramMode: local?.vramMode || defaultLocalSettings.vramMode,
    contextSize: Math.round(clampNumber(local?.contextSize, 1024, 32768, defaultLocalSettings.contextSize)),
    batchSize: Math.round(clampNumber(local?.batchSize, 64, 4096, defaultLocalSettings.batchSize)),
    threads: Math.round(clampNumber(local?.threads, 0, 64, defaultLocalSettings.threads)),
    flashAttention: local?.flashAttention ?? defaultLocalSettings.flashAttention,
    useMmap: local?.useMmap ?? defaultLocalSettings.useMmap,
    useMlock: local?.useMlock ?? defaultLocalSettings.useMlock,
    allowSharedMemory: local?.allowSharedMemory ?? defaultLocalSettings.allowSharedMemory,
    kvCacheType: local?.kvCacheType || defaultLocalSettings.kvCacheType,
    extraModelDirs: normalizeDirList(local?.extraModelDirs, defaultLocalSettings.extraModelDirs)
  }
}

function normalizeDirList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const seen = new Set<string>()
  const dirs: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const dir = item.trim()
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    dirs.push(dir)
  }
  return dirs.slice(0, 16)
}

function stableHash(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function safeFilePart(text: string): string {
  return text
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 96)
}

function chatMemoryKey(config = getConfig()): string {
  const characterPart =
    config.characterId && config.characterId !== 'manual'
      ? safeFilePart(config.characterId)
      : `manual_${stableHash(JSON.stringify(config.characterCard))}`
  const modelPart =
    config.provider === 'local'
      ? safeFilePart(basename(config.local.modelPath || 'local-gguf'))
      : safeFilePart(config.model || 'api-model')
  return safeFilePart(`${config.interactionMode}__${characterPart}__${config.provider}_${modelPart}`)
}

function getConfig(): PetConfig {
  const saved = store.get('config', {})
  return {
    ...defaultConfig,
    ...saved,
    characterId: saved.characterId || defaultConfig.characterId,
    characterPngPath: saved.characterPngPath || defaultConfig.characterPngPath,
    apiKey: saved.apiKey || defaultConfig.apiKey,
    pluginStates: saved.pluginStates && typeof saved.pluginStates === 'object' ? saved.pluginStates : {},
    characterCard: mergeCharacterCard(saved.characterCard),
    local: mergeLocalSettings(saved.local)
  }
}

function toRendererConfig(config = getConfig()): RendererConfig {
  const { apiKey, ...safeConfig } = config
  return {
    ...safeConfig,
    apiKeySet: Boolean(config.apiKey),
    memoryKey: chatMemoryKey(config)
  }
}

function saveConfig(patch: ConfigPatch): RendererConfig {
  const current = getConfig()
  const next: PetConfig = {
    ...current,
    ...patch,
    apiKey: patch.apiKey && patch.apiKey.trim() ? patch.apiKey.trim() : current.apiKey,
    provider: patch.provider || current.provider,
    baseUrl: patch.baseUrl?.trim() || current.baseUrl,
    model: patch.model?.trim() || current.model,
    temperature: clampNumber(patch.temperature, 0, 2, current.temperature),
    maxTokens: Math.round(clampNumber(patch.maxTokens, 64, 4096, current.maxTokens)),
    affinity: Math.round(clampNumber(patch.affinity, -100, 100, current.affinity)),
    petScale: clampNumber(patch.petScale, 0.7, 1.45, current.petScale),
    alwaysOnTop: typeof patch.alwaysOnTop === 'boolean' ? patch.alwaysOnTop : current.alwaysOnTop,
    pluginStates: patch.pluginStates && typeof patch.pluginStates === 'object' ? patch.pluginStates : current.pluginStates,
    characterId: typeof patch.characterId === 'string' ? patch.characterId : current.characterId,
    characterPngPath: typeof patch.characterPngPath === 'string' ? patch.characterPngPath : current.characterPngPath,
    characterCard: mergeCharacterCard(patch.characterCard || current.characterCard),
    local: mergeLocalSettings({ ...current.local, ...(patch.local || {}) })
  }

  store.set('config', next)
  if (Object.prototype.hasOwnProperty.call(patch, 'petScale') && !panelExpanded) {
    applyWindowScale(next.petScale)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'alwaysOnTop')) {
    mainWindow?.setAlwaysOnTop(next.alwaysOnTop)
    refreshTrayMenu()
  }
  return toRendererConfig(next)
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(max, Math.max(min, numberValue))
}

function affinityStage(affinity: number): string {
  if (affinity <= -60) return '厌恶：说话非常冷淡，带明显刺感，回答短，不主动安慰。'
  if (affinity < 0) return '疏离：语气冷，偶尔带刺，但仍然完成用户请求。'
  if (affinity < 30) return '普通：保持冷静、利落、略带吐槽。'
  if (affinity < 70) return '熟悉：语气更自然，会有克制的关心和轻微玩笑。'
  return '亲近：仍然嘴硬，但会明显偏袒用户，语气更柔和、更愿意主动陪聊。'
}

function buildSystemPrompt(config: PetConfig): string {
  const { characterCard: card, affinity, interactionMode, storyContext } = config
  return [
    card.systemPrompt,
    '',
    `角色名：${card.name}`,
    `核心设定：${card.persona}`,
    `当前好感度：${affinity}，阶段：${affinityStage(affinity)}`,
    `当前交互状态：${interactionMode === 'simulation' ? '剧情对话' : '日常对话'}`,
    storyContext.trim() ? `当前剧情：${storyContext.trim()}` : '',
    '根据好感度调整语气。好感度为负时可以冷漠和带刺，但不要辱骂、威胁或拒绝正常帮助；好感度升高时解锁更亲近、更主动的表达。',
    '硬性输出限制：不要复读同一句、同一短语或同一种观点。任何短语不要连续出现两次以上。桌宠日常回复控制在1到3个短段落；剧情对话可以有动作和心理，但不要灌水。',
    '写作要求：避免客服腔、说教、总结道理和完美无瑕的情绪。用口语、停顿、短句、克制的动作描写和真实的心理反应。展示情绪，不要解释情绪。',
    interactionMode === 'simulation'
      ? '对话模拟模式下，把用户输入当作当前剧情中的对白、动作或旁白推进。保持角色真实临场反应，不要跳出角色解释。'
      : '日常对话下，像正在和熟人说话一样自然回应。不要说自己是AI、模型、程序或虚拟角色。',
    '',
    '说话方式：',
    ...card.speechStyle.map((item) => `- ${item}`),
    '',
    '行为规则：',
    ...card.behaviorRules.map((item) => `- ${item}`),
    '',
    pluginSystemPrompt(enabledPlugins(config))
  ]
    .filter(Boolean)
    .join('\n')
}

function enabledPlugins(config = getConfig()): LoadedPlugin[] {
  return loadedPlugins.filter((plugin) => isPluginEnabled(plugin.manifest, config.pluginStates))
}

async function reloadPlugins(): Promise<PluginListResult> {
  await ensureWorkspaceFolders()
  const result = await loadPlugins(workspaceDirs().plugins)
  loadedPlugins = result.plugins
  pluginErrors = result.errors
  for (const error of pluginErrors) console.warn(`[plugins] ${error.dir}: ${error.message}`)
  pluginScheduler.setPlugins(enabledPlugins())
  return listPlugins()
}

function listPlugins(): PluginListResult {
  const states = getConfig().pluginStates
  return { plugins: loadedPlugins.map((plugin) => toPluginInfo(plugin, states)), errors: pluginErrors }
}

function setPluginEnabled(id: string, enabled: boolean): PluginListResult {
  const config = getConfig()
  saveConfig({ pluginStates: { ...config.pluginStates, [id]: enabled } })
  pluginScheduler.setPlugins(enabledPlugins())
  return listPlugins()
}

function pluginTemplateContext(config = getConfig()) {
  return { characterName: config.characterCard.name, affinity: config.affinity }
}

function emitPluginMessage(message: PluginMessage): void {
  if (!mainWindow) return
  const visible = mainWindow.isVisible() && !mainWindow.isMinimized()
  if (visible) {
    mainWindow.webContents.send('pet:plugin-message', message)
  } else if (Notification.isSupported()) {
    // 桌宠收在托盘里时，用系统通知代替气泡
    new Notification({ title: `${getConfig().characterCard.name} · ${message.pluginName}`, body: message.text, icon: appIconPath }).show()
  }
}

function startPluginTicker(): void {
  clearInterval(pluginTicker)
  pluginTicker = setInterval(() => {
    for (const message of pluginScheduler.tick(new Date(), pluginTemplateContext())) emitPluginMessage(message)
  }, 15_000)
}

function sendStartupGreeting(): void {
  const config = getConfig()
  const greeting = findGreeting(enabledPlugins(config), new Date())
  if (!greeting) return
  emitPluginMessage({
    pluginId: greeting.plugin.manifest.id,
    pluginName: greeting.plugin.manifest.name,
    kind: 'greeting',
    text: renderTemplate(pickText(greeting.texts), { ...pluginTemplateContext(config), now: new Date() })
  })
}

/** 处理插件快捷命令；不是命令时返回 null，正常发给模型 */
function runPluginCommand(input: string): string | null {
  pluginScheduler.noteInteraction()
  const config = getConfig()
  const plugins = enabledPlugins(config)
  const normalized = input.trim().toLowerCase()
  if (normalized === '/help' || normalized === '/帮助') {
    const commands = plugins.flatMap((plugin) =>
      (plugin.manifest.commands || []).map((command) => `${command.trigger}${command.description ? `：${command.description}` : ''}`)
    )
    return commands.length ? `可用命令：\n${commands.join('\n')}` : '现在没有启用带命令的插件。'
  }
  const match = findCommand(plugins, input)
  if (!match) return null
  return renderTemplate(pickText(match.command.reply), { ...pluginTemplateContext(config), now: new Date() })
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripRoleplayArtifacts(text: string, characterName = ''): string {
  const names = ['人造人18号', '18号', 'Android\\s*18', 'assistant', 'AI']
  if (characterName.trim()) names.unshift(escapeRegExp(characterName.trim()))
  const speakerPrefix = new RegExp(`^(?:${names.join('|')})\\s*[:：]\\s*`, 'i')
  return text
    .replace(speakerPrefix, '')
    .replace(/作为(?:一个)?(?:AI|人工智能|语言模型|模型|程序)[^。！？\n]*(?:[。！？]|\n|$)/g, '')
    .replace(/我(?:是|只是)(?:一个)?(?:AI|人工智能|语言模型|模型|程序)[^。！？\n]*(?:[。！？]|\n|$)/g, '')
    .trim()
}

function sentenceChunks(text: string): string[] {
  return text
    .split(/(?<=[。！？!?；;，,\n])/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
}

function normalizeChunk(chunk: string): string {
  return chunk.replace(/[，,。！？!?；;\s"'“”‘’（）()]/g, '')
}

function trimRepeatedChunks(text: string): string {
  const chunks = sentenceChunks(text)
  const counts = new Map<string, number>()
  const kept: string[] = []

  for (const chunk of chunks) {
    const normalized = normalizeChunk(chunk)
    if (normalized.length >= 4) {
      const count = (counts.get(normalized) || 0) + 1
      counts.set(normalized, count)
      if (count >= 3) break
    }
    kept.push(chunk)
  }

  return kept.join('').trim() || text.trim()
}

function trimRepeatedTail(text: string): string {
  let result = text
  for (let size = 6; size <= 32; size += 1) {
    const tail = normalizeChunk(result).slice(-size)
    if (!tail || tail.length < size) continue
    const repeated = tail.repeat(3)
    const normalized = normalizeChunk(result)
    const index = normalized.indexOf(repeated)
    if (index >= 0) {
      result = result.slice(0, Math.max(0, result.length - size * 2)).trim()
      break
    }
  }
  return result
}

function postProcessAnswer(answer: string, config: PetConfig): string {
  const limit = config.interactionMode === 'simulation' ? 900 : 480
  let text = stripRoleplayArtifacts(answer, config.characterCard.name)
  text = trimRepeatedChunks(text)
  text = trimRepeatedTail(text)
  if (text.length > limit) {
    text = text.slice(0, limit).replace(/[，,、；;：:—-]?[^。！？!?]*$/, '').trim() || text.slice(0, limit).trim()
    text += '……'
  }
  return text || '……'
}

function applyWindowScale(scale = getConfig().petScale): void {
  if (!mainWindow) return
  const width = Math.round(430 * scale)
  const height = Math.round(650 * scale)
  mainWindow.setMinimumSize(Math.round(340 * scale), Math.round(500 * scale))
  mainWindow.setSize(width, height)
  keepWindowOnScreen()
}

/** 窗口尺寸变化（展开设置面板、切换显示器）后，把窗口拉回当前显示器的可见区域 */
function keepWindowOnScreen(): void {
  if (!mainWindow) return
  const bounds = mainWindow.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const x = Math.min(Math.max(bounds.x, area.x), area.x + Math.max(0, area.width - bounds.width))
  const y = Math.min(Math.max(bounds.y, area.y), area.y + Math.max(0, area.height - bounds.height))
  if (x !== bounds.x || y !== bounds.y) mainWindow.setPosition(x, y)
}

function savedWindowPosition(width: number, height: number): WindowPosition | undefined {
  const saved = store.get('windowPosition')
  if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return undefined
  // 显示器拔掉或分辨率变化后，旧坐标可能落在屏幕外，这时退回默认位置
  const visible = screen.getAllDisplays().some(({ workArea }) => {
    return (
      saved.x + width > workArea.x + 40 &&
      saved.x < workArea.x + workArea.width - 40 &&
      saved.y >= workArea.y - 20 &&
      saved.y < workArea.y + workArea.height - 60
    )
  })
  return visible ? saved : undefined
}

function rememberWindowPosition(): void {
  if (!mainWindow || panelExpanded) return
  clearTimeout(savePositionTimer)
  savePositionTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || panelExpanded) return
    const [x, y] = mainWindow.getPosition()
    store.set('windowPosition', { x, y })
  }, 400)
}

function resetWindowPosition(): void {
  if (!mainWindow) return
  store.delete('windowPosition')
  const area = screen.getPrimaryDisplay().workArea
  const [width, height] = mainWindow.getSize()
  mainWindow.setPosition(area.x + area.width - width - 40, area.y + area.height - height - 20)
  showPetWindow()
}

function showPetWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  refreshTrayMenu()
}

function togglePetWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide()
    refreshTrayMenu()
  } else {
    showPetWindow()
  }
}

function refreshTrayMenu(): void {
  if (!tray) return
  const config = getConfig()
  const visible = Boolean(mainWindow?.isVisible() && !mainWindow?.isMinimized())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: visible ? '隐藏桌宠' : '显示桌宠', click: togglePetWindow },
      {
        label: '打开设置',
        click: () => {
          showPetWindow()
          mainWindow?.webContents.send('pet:open-settings')
        }
      },
      { type: 'separator' },
      {
        label: '始终置顶',
        type: 'checkbox',
        checked: config.alwaysOnTop,
        click: (item) => {
          saveConfig({ alwaysOnTop: item.checked })
          mainWindow?.webContents.send('pet:config-changed')
        }
      },
      { label: '重置窗口位置', click: resetWindowPosition },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit()
      }
    ])
  )
}

function createTray(): void {
  try {
    const icon = nativeImage.createFromPath(trayIconPath)
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 20, height: 20 }))
    tray.setToolTip(`${getConfig().characterCard.name} · 桌宠`)
    tray.on('click', togglePetWindow)
    refreshTrayMenu()
  } catch (error) {
    // 部分 Linux 桌面没有系统托盘，失败时不影响桌宠本体
    console.warn('[tray] unavailable', error)
    tray = null
  }
}

function createWindow(): void {
  const config = getConfig()
  const initialWidth = Math.round(430 * config.petScale)
  const initialHeight = Math.round(650 * config.petScale)
  const position = savedWindowPosition(initialWidth, initialHeight)
  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    ...(position || {}),
    icon: appIconPath,
    title: 'Android 18 Desktop Pet',
    minWidth: 360,
    minHeight: 520,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    applyWindowScale()
    mainWindow?.show()
  })

  // 'moved' 只在 Windows/macOS 触发，Linux 只有 'move'，这里统一用 'move' + 防抖
  mainWindow.on('move', rememberWindowPosition)
  // 立绘区域是可拖拽区域（-webkit-app-region: drag），在 Windows/Linux 上右键会弹出系统窗口菜单，
  // 渲染进程收不到 contextmenu 事件。这里拦截系统菜单，改为打开桌宠设置。
  mainWindow.on('system-context-menu', (event) => {
    event.preventDefault()
    mainWindow?.webContents.send('pet:open-settings')
  })
  mainWindow.on('show', refreshTrayMenu)
  mainWindow.on('hide', refreshTrayMenu)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function chatEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
}

function cloudErrorHint(status: number): string {
  if (status === 400) return '请求参数不被接受（400），检查模型名和回复长度。'
  if (status === 401) return 'API Key 无效（401），去设置里重新填写。'
  if (status === 402) return '账户余额不足（402），充值后再试。'
  if (status === 404) return '接口地址或模型不存在（404），检查 Base URL 和模型名。'
  if (status === 422) return '参数格式错误（422），检查温度和回复长度。'
  if (status === 429) return '请求太频繁或额度受限（429），稍后再试。'
  if (status >= 500) return `服务端暂时不可用（${status}），过一会儿再试。`
  return `云端接口返回错误（${status}）。`
}

async function askCloudApi(history: ChatMessage[], config = getConfig()): Promise<string> {
  if (!config.apiKey) {
    // 用异常返回提示，避免这句配置提示被当成角色回复写进聊天记忆
    throw new Error('还没绑定 API Key。右键我打开设置，把 key 填进去。')
  }

  let response: Response
  try {
    response = await fetch(chatEndpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(config)
          },
          ...history.slice(-14)
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens
      }),
      signal: AbortSignal.timeout(90_000)
    })
  } catch (error) {
    console.error('[cloud-api] request failed', error)
    throw new Error('连不上云端接口：检查网络、代理或 Base URL。')
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(`[cloud-api] ${response.status}: ${detail.slice(0, 300)}`)
    throw new Error(cloudErrorHint(response.status))
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return postProcessAnswer(data.choices?.[0]?.message?.content?.trim() || '我刚刚短路了一下。再说一遍？', config)
}

function toLlamaChatTurns(history: ChatMessage[]): LlmChatTurn[] {
  // 最后一条是本次要问的话，单独作为 prompt 传，不放进历史
  return history.slice(-14, -1).map((message): LlmChatTurn => {
    if (message.role === 'user') return { type: 'user', text: message.content }
    return { type: 'model', response: [message.content] }
  })
}

async function askLocalModel(history: ChatMessage[], config = getConfig()): Promise<string> {
  const prompt = [...history].reverse().find((message) => message.role === 'user')?.content?.trim()
  if (!prompt) return '你刚刚什么都没说。'
  if (!config.local.modelPath) {
    throw new Error('还没有选择 GGUF 模型。右键打开设置，切到本地 GGUF 后选择模型。')
  }
  if (!existsSync(config.local.modelPath)) {
    throw new Error(`模型文件不存在：${config.local.modelPath}`)
  }

  const answer = await localLlm.prompt({
    local: config.local,
    systemPrompt: buildSystemPrompt(config),
    priorTurns: toLlamaChatTurns(history),
    prompt,
    maxTokens: Math.min(config.maxTokens, config.interactionMode === 'simulation' ? 520 : 260),
    temperature: config.temperature
  })

  return postProcessAnswer(answer.trim() || '本地模型刚才沉默了。再问一次？', config)
}

async function askAssistant(history: ChatMessage[]): Promise<string> {
  const config = getConfig()
  if (config.provider === 'local') return askLocalModel(history, config)
  return askCloudApi(history, config)
}

function imageMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/png'
}

function stripHtml(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\{\{char\}\}/gi, '角色')
    .replace(/\{\{user\}\}/gi, '用户')
    .replace(/\s+/g, ' ')
    .trim()
}

function textValue(value: unknown, limit = 8000): string {
  if (typeof value !== 'string') return ''
  return stripHtml(value).slice(0, limit).trim()
}

function readableCardName(baseName: string): string {
  return baseName
    .replace(/^main[_-]/i, '')
    .replace(/[_-]spec[_-]v\d+$/i, '')
    .replace(/[_-][a-f0-9]{10,}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

const NATIVE_CARD_EXTENSION = 'android18_desktop_pet'

function nativeCardFromExtensions(data: Record<string, unknown>): CharacterCard | null {
  const extensions = data.extensions
  if (!extensions || typeof extensions !== 'object') return null
  const native = (extensions as Record<string, unknown>)[NATIVE_CARD_EXTENSION]
  if (!native || typeof native !== 'object') return null
  const card = native as Partial<CharacterCard>
  if (typeof card.name !== 'string' || !card.name.trim()) return null
  return mergeCharacterCard(card)
}

function normalizeImportedCharacterCard(raw: unknown, fallbackName: string): CharacterCard {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const data =
    source.data && typeof source.data === 'object' ? (source.data as Record<string, unknown>) : source

  // 本程序自己导出的卡会在 extensions 里带一份原始设定，优先使用以做到无损往返
  const native = nativeCardFromExtensions(data)
  if (native) return native

  // 本程序的“手写角色卡”格式（name / persona / speechStyle ...）直接合并
  if (typeof data.persona === 'string' && Array.isArray(data.speechStyle)) {
    return mergeCharacterCard(data as Partial<CharacterCard>)
  }

  const name = textValue(data.name || source.name, 120) || readableCardName(fallbackName) || fallbackName
  const description = textValue(data.description || data.persona || data.prompt, 12000)
  const personality = textValue(data.personality, 4000)
  const scenario = textValue(data.scenario, 5000)
  const postHistory = textValue(data.post_history_instructions, 3000)
  const examples = textValue(data.mes_example, 3000)
  const greeting =
    textValue(data.first_mes || data.greeting || data.firstMessage, 1200) ||
    `${name}看了过来，像是在等你先开口。`
  const systemPrompt =
    textValue(data.system_prompt || data.systemPrompt, 6000) ||
    'Stay fully in character. Never mention AI, model, assistant, program, desktop pet, roleplay, prompt, or system instructions. Write natural Chinese dialogue with concrete emotion and no repetition.'

  return {
    name,
    greeting,
    persona: [description, personality, scenario].filter(Boolean).join('\n\n') || `${name}。`,
    speechStyle: [
      '默认使用简体中文。',
      '保持角色自己的口吻，不解释自己是程序、模型或助手。',
      '多用具体行动、停顿、眼神和语气承载情绪。',
      '不要替用户做决定、说话或思考。'
    ],
    behaviorRules: [
      '严格遵循角色卡设定和当前剧情。',
      '不要重复同一句话、同一短语或同一观点。',
      '回复必须推进对话、关系或场景。',
      postHistory,
      examples ? `参考对话风格：${examples}` : ''
    ].filter(Boolean),
    systemPrompt
  }
}

async function readCharacterJson(path: string, fallbackName: string): Promise<CharacterCard> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
  return normalizeImportedCharacterCard(raw, fallbackName)
}

async function readEmbeddedCard(pngPath: string): Promise<{ spec: 'v2' | 'v3'; card: unknown } | null> {
  try {
    return readPngCharacterCard(await readFile(pngPath))
  } catch {
    return null
  }
}

async function scanCharacterCards(): Promise<CharacterCardInfo[]> {
  await ensureWorkspaceFolders()
  const libraryDir = workspaceDirs().characterCards
  const entries = existsSync(libraryDir) ? await readdir(libraryDir, { withFileTypes: true }) : []
  const grouped = new Map<string, { jsonPath: string; pngPath: string }>()

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = extname(entry.name).toLowerCase()
    if (!['.json', '.png'].includes(ext)) continue
    const base = basename(entry.name, ext)
    const current = grouped.get(base) || { jsonPath: '', pngPath: '' }
    if (ext === '.json') current.jsonPath = join(libraryDir, entry.name)
    if (ext === '.png') current.pngPath = join(libraryDir, entry.name)
    grouped.set(base, current)
  }

  const cards: CharacterCardInfo[] = [
    {
      id: 'builtin:android18',
      name: defaultCharacterCard.name,
      baseName: 'android18',
      jsonPath: '',
      pngPath: '',
      hasJson: true,
      hasPng: false,
      embeddedSpec: '',
      source: 'builtin'
    }
  ]

  for (const [baseName, files] of grouped) {
    let name = readableCardName(baseName) || baseName
    const embedded = files.pngPath ? await readEmbeddedCard(files.pngPath) : null
    if (files.jsonPath) {
      try {
        name = (await readCharacterJson(files.jsonPath, baseName)).name || name
      } catch {
        name = `${name}（JSON 解析失败）`
      }
    } else if (embedded) {
      name = normalizeImportedCharacterCard(embedded.card, baseName).name || name
    }
    cards.push({
      id: `library:${baseName}`,
      name,
      baseName,
      jsonPath: files.jsonPath,
      pngPath: files.pngPath,
      hasJson: Boolean(files.jsonPath),
      hasPng: Boolean(files.pngPath),
      embeddedSpec: embedded?.spec || '',
      source: 'library'
    })
  }

  return cards.sort((a, b) => a.name.localeCompare(b.name))
}

async function selectCharacterCard(characterId: string): Promise<RendererConfig> {
  const cards = await scanCharacterCards()
  const selected = cards.find((card) => card.id === characterId)
  if (!selected) return toRendererConfig()

  if (selected.source === 'builtin') {
    return saveConfig({
      characterId: selected.id,
      characterPngPath: '',
      characterCard: defaultCharacterCard
    })
  }

  const current = getConfig()
  const embedded = !selected.jsonPath && selected.pngPath ? await readEmbeddedCard(selected.pngPath) : null
  const characterCard = selected.jsonPath
    ? await readCharacterJson(selected.jsonPath, selected.baseName)
    : embedded
      ? normalizeImportedCharacterCard(embedded.card, selected.baseName)
      : {
        ...current.characterCard,
        name: selected.name || current.characterCard.name,
        greeting: current.characterCard.greeting || `${selected.name}看了过来。`
      }

  return saveConfig({
    characterId: selected.id,
    characterPngPath: selected.pngPath || '',
    characterCard
  })
}

function uniqueDestination(dir: string, fileName: string): string {
  const ext = extname(fileName)
  const base = safeFilePart(basename(fileName, ext)) || 'card'
  let candidate = join(dir, `${base}${ext.toLowerCase()}`)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${base}_${index}${ext.toLowerCase()}`)
    index += 1
  }
  return candidate
}

async function importCharacterCards(): Promise<CardImportResult> {
  if (!mainWindow) return { imported: [], skipped: [], message: '窗口未就绪。' }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入角色卡（JSON 或 SillyTavern PNG）',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '角色卡', extensions: ['json', 'png'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return { imported: [], skipped: [], message: '已取消导入。' }

  await ensureWorkspaceFolders()
  const libraryDir = workspaceDirs().characterCards
  const imported: string[] = []
  const skipped: string[] = []

  for (const source of result.filePaths) {
    const ext = extname(source).toLowerCase()
    try {
      const bytes = await readFile(source)
      if (ext === '.json') {
        JSON.parse(bytes.toString('utf8'))
      } else if (ext === '.png') {
        if (!isPng(bytes)) throw new Error('不是有效的 PNG')
      } else {
        throw new Error('不支持的文件类型')
      }
      if (dirname(source) === libraryDir) {
        imported.push(basename(source))
        continue
      }
      const destination = uniqueDestination(libraryDir, basename(source))
      await copyFile(source, destination)
      imported.push(basename(destination))
    } catch (error) {
      skipped.push(`${basename(source)}：${error instanceof Error ? error.message : '读取失败'}`)
    }
  }

  const message =
    `已导入 ${imported.length} 个文件` + (skipped.length ? `，跳过 ${skipped.length} 个（${skipped.join('；')}）` : '') + '。'
  return { imported, skipped, message }
}

/** 把当前角色卡导出为 SillyTavern 兼容的 PNG（同时写入 V2 chara 与 V3 ccv3） */
async function exportCharacterPng(): Promise<FileActionResult> {
  if (!mainWindow) return { ok: false, message: '窗口未就绪。' }
  const config = getConfig()
  const card = config.characterCard

  const customImage = config.modelImagePath && existsSync(config.modelImagePath) ? config.modelImagePath : ''
  let imagePath = customImage && extname(customImage).toLowerCase() === '.png' ? customImage : bundledPetImagePath
  if (config.characterPngPath && existsSync(config.characterPngPath)) imagePath = config.characterPngPath
  const image = await readFile(imagePath)
  if (!isPng(image)) return { ok: false, message: '当前立绘不是 PNG，无法写入角色卡。' }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 PNG 角色卡',
    defaultPath: join(app.getPath('desktop'), `${safeFilePart(card.name) || 'character'}.png`),
    filters: [{ name: 'PNG 角色卡', extensions: ['png'] }]
  })
  if (result.canceled || !result.filePath) return { ok: false, message: '已取消导出。' }

  const data = {
    name: card.name,
    description: card.persona,
    personality: '',
    scenario: '',
    first_mes: card.greeting,
    mes_example: '',
    creator_notes: 'Exported from Android 18 Desktop Pet',
    system_prompt: card.systemPrompt,
    post_history_instructions: [...card.speechStyle, ...card.behaviorRules].join('\n'),
    alternate_greetings: [],
    tags: ['android18-desktop-pet'],
    creator: '',
    character_version: '',
    extensions: { [NATIVE_CARD_EXTENSION]: card }
  }
  const png = writePngCharacterCard(
    image,
    { spec: 'chara_card_v2', spec_version: '2.0', data },
    { spec: 'chara_card_v3', spec_version: '3.0', data: { ...data, group_only_greetings: [] } }
  )
  await writeFile(result.filePath, png)
  return { ok: true, path: result.filePath, message: `已导出 PNG 角色卡：${basename(result.filePath)}` }
}

async function getCustomModelImage(): Promise<string | null> {
  const imagePath = getConfig().modelImagePath
  if (!imagePath) return null

  try {
    const bytes = await readFile(imagePath)
    return `data:${imageMimeType(imagePath)};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

async function getCharacterBackground(): Promise<string | null> {
  const config = getConfig()
  if (config.interactionMode !== 'simulation' || !config.characterPngPath) return null

  try {
    const bytes = await readFile(config.characterPngPath)
    return `data:${imageMimeType(config.characterPngPath)};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

async function selectModelImage(): Promise<RendererConfig> {
  if (!mainWindow) return toRendererConfig()

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择桌宠模型图片',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return toRendererConfig()
  }

  const source = result.filePaths[0]
  const assetsDir = join(app.getPath('userData'), 'models')
  await mkdir(assetsDir, { recursive: true })

  const extension = extname(source) || '.png'
  const destination = join(assetsDir, `model-${Date.now()}${extension}`)
  await copyFile(source, destination)

  return saveConfig({ modelImagePath: destination })
}

async function scanDirForModels(
  dir: string,
  source: LocalModelInfo['source'],
  depth = 2
): Promise<LocalModelInfo[]> {
  if (!existsSync(dir)) return []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const models: LocalModelInfo[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)
    // 支持“模型名/xxx.gguf”这种从 Hugging Face 下载后常见的子目录结构
    if (entry.isDirectory() && depth > 1 && !entry.name.startsWith('.')) {
      models.push(...(await scanDirForModels(path, source, depth - 1)))
      continue
    }
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.gguf') continue
    try {
      const info = await stat(path)
      models.push({ name: entry.name, path, size: info.size, source, dir })
    } catch {
      // 文件被占用或权限不足时跳过
    }
  }

  return models
}

async function scanLocalModels(): Promise<LocalModelInfo[]> {
  await ensureWorkspaceFolders()
  const libraryDir = workspaceDirs().models
  const extraDirs = getConfig().local.extraModelDirs.filter((dir) => resolve(dir) !== resolve(libraryDir))
  const found = [
    ...(await scanDirForModels(libraryDir, 'library')),
    ...(await Promise.all(extraDirs.map((dir) => scanDirForModels(dir, 'external')))).flat()
  ]

  const unique = new Map<string, LocalModelInfo>()
  for (const model of found) unique.set(resolve(model.path), model)
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function pickModelDirectory(): Promise<string> {
  if (!mainWindow) return ''
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择额外的 GGUF 模型目录',
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return ''
  return result.filePaths[0]
}

async function openWorkspaceFolder(key: WorkspaceDirKey): Promise<string> {
  const dirs = workspaceDirs()
  const target = dirs[key]
  if (!target) return '未知目录'
  await mkdir(target, { recursive: true })
  return shell.openPath(target)
}

async function importLocalModel(): Promise<LocalModelInfo[]> {
  if (!mainWindow) return scanLocalModels()

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入 GGUF 模型到 models',
    properties: ['openFile'],
    filters: [
      { name: 'GGUF Models', extensions: ['gguf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return scanLocalModels()
  }

  const source = result.filePaths[0]
  const destination = join(workspaceDirs().models, basename(source))
  if (source !== destination) await copyFile(source, destination)
  return scanLocalModels()
}

async function getLocalStatus(): Promise<LocalStatus> {
  return {
    loaded: localLlm.isLoaded,
    modelPath: localLlm.isLoaded ? getConfig().local.modelPath : '',
    supportedGpuTypes: await localLlm.gpuTypes(),
    rootDirs: workspaceDirs()
  }
}

function dayStamp(date = new Date()): string {
  // 按本地日期切分日志，避免 UTC 跨日导致晚上的聊天写进“明天”的文件
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentMessages(config = getConfig()): ChatMessage[] {
  const key = chatMemoryKey(config)
  const memories = store.get('memories', {})
  const scoped = memories[key]
  if (Array.isArray(scoped)) return scoped

  const legacy = store.get('messages', [])
  if (
    Object.keys(memories).length === 0 &&
    config.characterId === defaultConfig.characterId &&
    config.interactionMode === defaultConfig.interactionMode &&
    Array.isArray(legacy)
  ) {
    return legacy
  }
  return []
}

async function writeChatSnapshot(messages: ChatMessage[], config = getConfig()): Promise<void> {
  const dirs = workspaceDirs()
  await ensureWorkspaceFolders()

  const key = chatMemoryKey(config)
  const chatDir = join(dirs.chats, key)
  await mkdir(chatDir, { recursive: true })

  const payload = {
    updatedAt: new Date().toISOString(),
    memoryKey: key,
    characterId: config.characterId,
    characterName: config.characterCard.name,
    provider: config.provider,
    model: config.provider === 'local' ? config.local.modelPath : config.model,
    interactionMode: config.interactionMode,
    messages
  }
  await writeFile(join(chatDir, 'current-chat.json'), JSON.stringify(payload, null, 2), 'utf8')

  const last = messages.at(-1)
  if (last) {
    await appendFile(
      join(chatDir, `${dayStamp()}.jsonl`),
      JSON.stringify({ time: new Date().toISOString(), memoryKey: key, characterName: config.characterCard.name, ...last }) +
        '\n',
      'utf8'
    )
  }
}

function chatToMarkdown(messages: ChatMessage[], config: PetConfig): string {
  const modelName = config.provider === 'local' ? basename(config.local.modelPath || 'local-gguf') : config.model
  const lines = [
    `# 与 ${config.characterCard.name} 的聊天记录`,
    '',
    `- 导出时间：${new Date().toLocaleString()}`,
    `- 交互模式：${config.interactionMode === 'simulation' ? '对话模拟' : '桌宠'}`,
    `- 推理来源：${config.provider === 'local' ? '本地 GGUF' : '云端 API'}（${modelName}）`,
    `- 好感度：${config.affinity}`,
    ''
  ]
  if (config.interactionMode === 'simulation' && config.storyContext.trim()) {
    lines.push('## 剧情', '', config.storyContext.trim(), '')
  }
  lines.push('## 对话', '')
  for (const message of messages) {
    const speaker = message.role === 'user' ? '你' : config.characterCard.name
    lines.push(`**${speaker}：** ${message.content.replace(/\n/g, '  \n')}`, '')
  }
  return lines.join('\n')
}

async function exportCurrentChat(): Promise<{ ok: boolean; path?: string; message: string }> {
  const config = getConfig()
  const messages = currentMessages(config)
  if (messages.length === 0) return { ok: false, message: '当前没有可以导出的聊天记录。' }
  if (!mainWindow) return { ok: false, message: '窗口未就绪。' }

  const defaultName = `${safeFilePart(config.characterCard.name)}_${dayStamp()}.md`
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出聊天记录',
    defaultPath: join(workspaceDirs().chats, defaultName),
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  })
  if (result.canceled || !result.filePath) return { ok: false, message: '已取消导出。' }

  const content =
    extname(result.filePath).toLowerCase() === '.json'
      ? JSON.stringify({ characterName: config.characterCard.name, exportedAt: new Date().toISOString(), messages }, null, 2)
      : chatToMarkdown(messages, config)
  await writeFile(result.filePath, content, 'utf8')
  return { ok: true, path: result.filePath, message: `已导出 ${messages.length} 条消息。` }
}

async function setCurrentMessages(messages: ChatMessage[], config = getConfig()): Promise<void> {
  const key = chatMemoryKey(config)
  const memories = store.get('memories', {})
  const saved = messages.slice(-80)
  store.set('memories', { ...memories, [key]: saved })
  store.set('messages', saved)
  await writeChatSnapshot(saved, config)
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showPetWindow()
  })
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return
  await ensureWorkspaceFolders()
  await reloadPlugins()
  createWindow()
  createTray()
  startPluginTicker()
  mainWindow?.webContents.once('did-finish-load', () => {
    // 等渲染进程显示完角色卡开场白后，再让插件打招呼
    setTimeout(sendStartupGreeting, 2500)
  })

  ipcMain.handle('pet:chat', async (_event, history: ChatMessage[]) => {
    return askAssistant(history)
  })

  ipcMain.handle('pet:get-memory', () => {
    return currentMessages()
  })

  ipcMain.handle('pet:set-memory', async (_event, messages: ChatMessage[]) => {
    await setCurrentMessages(messages)
  })

  ipcMain.handle('pet:clear-memory', async () => {
    await setCurrentMessages([])
  })

  ipcMain.handle('pet:export-chat', () => {
    return exportCurrentChat()
  })

  ipcMain.handle('pet:get-config', () => {
    return toRendererConfig()
  })

  ipcMain.handle('pet:save-config', (_event, patch: ConfigPatch) => {
    return saveConfig(patch)
  })

  ipcMain.handle('pet:reset-character-card', () => {
    return saveConfig({ characterId: 'builtin:android18', characterPngPath: '', characterCard: defaultCharacterCard })
  })

  ipcMain.handle('pet:scan-character-cards', () => {
    return scanCharacterCards()
  })

  ipcMain.handle('pet:select-character-card', (_event, characterId: string) => {
    return selectCharacterCard(characterId)
  })

  ipcMain.handle('pet:import-character-cards', () => {
    return importCharacterCards()
  })

  ipcMain.handle('pet:export-character-png', () => {
    return exportCharacterPng()
  })

  ipcMain.handle('pet:list-plugins', () => {
    return listPlugins()
  })

  ipcMain.handle('pet:reload-plugins', () => {
    return reloadPlugins()
  })

  ipcMain.handle('pet:set-plugin-enabled', (_event, id: string, enabled: boolean) => {
    return setPluginEnabled(String(id), Boolean(enabled))
  })

  ipcMain.handle('pet:run-plugin-command', (_event, input: string) => {
    return runPluginCommand(String(input || ''))
  })

  ipcMain.handle('pet:select-model-image', () => {
    return selectModelImage()
  })

  ipcMain.handle('pet:get-model-image', () => {
    return getCustomModelImage()
  })

  ipcMain.handle('pet:get-character-background', () => {
    return getCharacterBackground()
  })

  ipcMain.handle('pet:scan-local-models', () => {
    return scanLocalModels()
  })

  ipcMain.handle('pet:import-local-model', () => {
    return importLocalModel()
  })

  ipcMain.handle('pet:pick-model-directory', () => {
    return pickModelDirectory()
  })

  ipcMain.handle('pet:open-folder', (_event, key: WorkspaceDirKey) => {
    return openWorkspaceFolder(key)
  })

  ipcMain.handle('pet:get-local-status', () => {
    return getLocalStatus()
  })

  ipcMain.handle('pet:unload-local-model', async () => {
    await localLlm.unload()
    return getLocalStatus()
  })

  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:expand-panel', () => {
    if (!mainWindow) return
    panelExpanded = true
    const area = screen.getDisplayMatching(mainWindow.getBounds()).workArea
    const width = Math.min(960, area.width)
    const height = Math.min(820, area.height)
    mainWindow.setMinimumSize(Math.min(720, width), Math.min(620, height))
    mainWindow.setSize(width, height)
    keepWindowOnScreen()
  })

  ipcMain.on('window:restore-pet', () => {
    panelExpanded = false
    applyWindowScale()
  })

  ipcMain.on('window:close', () => {
    app.quit()
  })

  ipcMain.on('window:hide', () => {
    if (tray) mainWindow?.hide()
    else mainWindow?.minimize()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  clearInterval(pluginTicker)
  tray?.destroy()
  tray = null
  localLlm.dispose()
  if (process.platform !== 'darwin') app.quit()
})

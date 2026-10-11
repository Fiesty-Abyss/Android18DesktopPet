import './style.css'
import bundledPetImage from '../assets/android18-chibi.png'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app')
}

app.innerHTML = `
  <main class="pet-window">
    <section class="pet-stage" id="pet-stage" aria-label="desktop pet">
      <div class="bubble" id="bubble"></div>
      <img class="pet-avatar" id="pet-avatar" src="${bundledPetImage}" alt="desktop pet" />
    </section>

    <button class="chat-handle" id="chat-handle" type="button">聊</button>

    <aside class="history-panel" id="history-panel" aria-label="聊天历史">
      <header class="panel-header">
        <strong>聊天历史</strong>
        <button class="secondary-button compact" id="clear-history" type="button">清空</button>
        <button class="icon-button" id="close-history" type="button" title="关闭历史" aria-label="关闭历史">X</button>
      </header>
      <div class="history-list" id="history-list"></div>
    </aside>

    <section class="chat-panel" id="chat-panel">
      <div class="toolbar">
        <button class="icon-button" id="open-history" title="聊天历史" aria-label="聊天历史">H</button>
        <button class="icon-button" id="zoom-out" title="缩小" aria-label="缩小">-</button>
        <button class="icon-button" id="zoom-in" title="放大" aria-label="放大">+</button>
        <button class="icon-button" id="open-sim" title="对话模拟" aria-label="对话模拟">M</button>
        <button class="icon-button" id="open-settings" title="设置" aria-label="设置">S</button>
        <button class="icon-button" id="toggle-panel" title="隐藏输入区" aria-label="隐藏输入区">_</button>
        <button class="icon-button" id="clear-memory" title="清空记忆" aria-label="清空记忆">C</button>
        <button class="icon-button danger" id="close-window" title="关闭" aria-label="关闭">X</button>
      </div>
      <form class="composer" id="composer">
        <input id="prompt" autocomplete="off" maxlength="300" placeholder="跟她说点什么..." />
        <button id="send" type="submit">发送</button>
      </form>
    </section>

    <dialog class="settings-modal" id="settings-modal">
      <form class="settings-form" id="settings-form" method="dialog">
        <header class="settings-header">
          <strong>桌宠设置</strong>
          <button class="icon-button" id="close-settings" type="button" title="关闭" aria-label="关闭">X</button>
        </header>

        <div class="settings-grid">
          <label>
            交互模式
            <select id="interaction-mode">
              <option value="pet">桌宠模式</option>
              <option value="simulation">对话模拟</option>
            </select>
          </label>

          <label>
            推理来源
            <select id="provider-select">
              <option value="api">云端 API</option>
              <option value="local">本地 GGUF</option>
            </select>
          </label>

          <label>
            回复长度
            <input id="max-tokens" type="number" min="64" max="4096" step="1" />
          </label>
        </div>

        <section class="settings-section character-source-section">
          <div class="model-picker">
            <label>
              角色卡来源
              <select id="character-source-select"></select>
            </label>
            <button class="secondary-button" id="refresh-character-cards" type="button">刷新角色库</button>
          </div>
          <p class="hint-text" id="character-card-hint"></p>
        </section>

        <section class="settings-section" id="api-section">
          <div class="settings-grid">
            <label>
              API Key
              <input id="api-key" type="password" autocomplete="off" placeholder="留空则保留已保存 key" />
            </label>

            <label>
              Base URL
              <input id="base-url" type="url" spellcheck="false" />
            </label>

            <label>
              云端模型
              <select id="model-select">
                <option value="deepseek-v4-flash">deepseek-v4-flash</option>
                <option value="deepseek-v4-pro">deepseek-v4-pro</option>
                <option value="deepseek-chat">deepseek-chat</option>
                <option value="deepseek-reasoner">deepseek-reasoner</option>
                <option value="custom">自定义</option>
              </select>
            </label>

            <label>
              自定义模型
              <input id="model-custom" spellcheck="false" placeholder="例如 deepseek-v4-pro" />
            </label>
          </div>
        </section>

        <section class="settings-section" id="local-section">
          <div class="model-picker">
            <label>
              本地模型
              <select id="local-model-select"></select>
            </label>
            <button class="secondary-button" id="refresh-local-models" type="button">刷新</button>
            <button class="secondary-button" id="import-local-model" type="button">导入GGUF</button>
          </div>

          <div class="settings-grid">
            <label>
              生成引擎
              <select id="local-gpu-backend">
                <option value="auto">自动</option>
                <option value="cuda">CUDA GPU</option>
                <option value="vulkan">Vulkan GPU</option>
                <option value="cpu">CPU</option>
              </select>
            </label>

            <label>
              显存优化
              <select id="local-vram-mode">
                <option value="auto">自动适配</option>
                <option value="high">高显存优先</option>
                <option value="medium">8GB 平衡</option>
                <option value="low">低显存/CPU层</option>
              </select>
            </label>

            <label>
              上下文
              <input id="local-context-size" type="number" min="1024" max="32768" step="256" />
            </label>

            <label>
              批处理
              <input id="local-batch-size" type="number" min="64" max="4096" step="64" />
            </label>

            <label>
              CPU线程
              <input id="local-threads" type="number" min="0" max="64" step="1" />
            </label>

            <label>
              KV缓存
              <select id="local-kv-cache">
                <option value="F16">F16 稳定</option>
                <option value="Q8_0">Q8_0 省显存</option>
                <option value="Q4_0">Q4_0 更省显存</option>
              </select>
            </label>
          </div>

          <div class="toggle-grid">
            <label><input id="local-flash-attention" type="checkbox" /> Flash Attention</label>
            <label><input id="local-use-mmap" type="checkbox" /> mmap 加载</label>
            <label><input id="local-use-mlock" type="checkbox" /> 锁定内存</label>
            <label><input id="local-shared-memory" type="checkbox" /> 允许共享显存</label>
          </div>

          <div class="model-row">
            <span class="status-text" id="local-status">本地运行时未加载</span>
            <button class="secondary-button" id="unload-local-model" type="button">卸载本地模型</button>
          </div>
        </section>

        <div class="settings-grid">
          <label>
            温度
            <input id="temperature" type="number" min="0" max="2" step="0.1" />
          </label>
        </div>

        <label class="range-row">
          <span>整体缩放 <b id="scale-value">100%</b></span>
          <input id="pet-scale" type="range" min="0.7" max="1.45" step="0.05" />
        </label>

        <div class="model-row">
          <img class="model-preview" id="model-preview" src="${bundledPetImage}" alt="model preview" />
          <button class="secondary-button" id="choose-model" type="button">更换模型图片</button>
          <span class="affinity-chip" id="settings-affinity">好感度 0</span>
        </div>

        <label class="card-editor">
          角色卡 JSON
          <textarea id="character-card" spellcheck="false"></textarea>
        </label>

        <footer class="settings-actions">
          <span class="status-text" id="settings-status"></span>
          <button class="secondary-button" id="reset-card" type="button">恢复默认角色卡</button>
          <button class="primary-button" id="save-settings" type="submit">保存</button>
        </footer>
      </form>
    </dialog>

    <dialog class="dev-modal" id="dev-modal">
      <form class="settings-form" id="dev-form" method="dialog">
        <header class="settings-header">
          <strong>开发者模式</strong>
          <button class="icon-button" id="close-dev" type="button" title="关闭" aria-label="关闭">X</button>
        </header>
        <label class="range-row">
          <span>好感度 <b id="dev-affinity-value">0</b></span>
          <input id="dev-affinity" type="range" min="-100" max="100" step="1" />
        </label>
        <input id="dev-affinity-number" class="number-field" type="number" min="-100" max="100" step="1" />
        <footer class="settings-actions">
          <span class="status-text">四连点角色进入这里。</span>
          <button class="primary-button" id="save-dev" type="submit">应用</button>
        </footer>
      </form>
    </dialog>

    <dialog class="sim-modal" id="sim-modal">
      <form class="sim-form" id="sim-form" method="dialog">
        <header class="settings-header">
          <strong>对话模拟</strong>
          <button class="icon-button" id="close-sim" type="button" title="关闭" aria-label="关闭">X</button>
        </header>

        <label class="card-editor">
          剧情
          <textarea id="story-context" spellcheck="false" placeholder="写当前场景、关系、冲突、时间地点。也可以让她生成。"></textarea>
        </label>

        <div class="sim-actions">
          <button class="secondary-button" id="generate-story" type="button">生成剧情</button>
          <button class="secondary-button" id="save-story" type="button">保存剧情</button>
          <button class="secondary-button" id="add-user-line" type="button">加用户句</button>
          <button class="secondary-button" id="add-assistant-line" type="button">加角色句</button>
          <button class="secondary-button" id="undo-line" type="button">撤回末句</button>
        </div>

        <div class="sim-list" id="sim-list"></div>

        <footer class="sim-composer">
          <input id="sim-prompt" autocomplete="off" maxlength="500" placeholder="继续这一幕..." />
          <button class="primary-button" id="sim-send" type="submit">发送</button>
        </footer>
      </form>
    </dialog>
  </main>
`

const bubble = document.querySelector<HTMLDivElement>('#bubble')!
const avatar = document.querySelector<HTMLImageElement>('#pet-avatar')!
const petStage = document.querySelector<HTMLElement>('#pet-stage')!
const chatHandle = document.querySelector<HTMLButtonElement>('#chat-handle')!
const panel = document.querySelector<HTMLElement>('#chat-panel')!
const composer = document.querySelector<HTMLFormElement>('#composer')!
const promptInput = document.querySelector<HTMLInputElement>('#prompt')!
const sendButton = document.querySelector<HTMLButtonElement>('#send')!
const openHistory = document.querySelector<HTMLButtonElement>('#open-history')!
const clearHistory = document.querySelector<HTMLButtonElement>('#clear-history')!
const closeHistory = document.querySelector<HTMLButtonElement>('#close-history')!
const historyPanel = document.querySelector<HTMLElement>('#history-panel')!
const historyList = document.querySelector<HTMLDivElement>('#history-list')!
const zoomOut = document.querySelector<HTMLButtonElement>('#zoom-out')!
const zoomIn = document.querySelector<HTMLButtonElement>('#zoom-in')!
const openSimButton = document.querySelector<HTMLButtonElement>('#open-sim')!
const openSettingsButton = document.querySelector<HTMLButtonElement>('#open-settings')!
const togglePanel = document.querySelector<HTMLButtonElement>('#toggle-panel')!
const clearMemory = document.querySelector<HTMLButtonElement>('#clear-memory')!
const closeWindow = document.querySelector<HTMLButtonElement>('#close-window')!
const settingsModal = document.querySelector<HTMLDialogElement>('#settings-modal')!
const settingsForm = document.querySelector<HTMLFormElement>('#settings-form')!
const closeSettings = document.querySelector<HTMLButtonElement>('#close-settings')!
const interactionMode = document.querySelector<HTMLSelectElement>('#interaction-mode')!
const providerSelect = document.querySelector<HTMLSelectElement>('#provider-select')!
const characterSourceSelect = document.querySelector<HTMLSelectElement>('#character-source-select')!
const refreshCharacterCardsButton = document.querySelector<HTMLButtonElement>('#refresh-character-cards')!
const characterCardHint = document.querySelector<HTMLElement>('#character-card-hint')!
const apiSection = document.querySelector<HTMLElement>('#api-section')!
const localSection = document.querySelector<HTMLElement>('#local-section')!
const apiKeyInput = document.querySelector<HTMLInputElement>('#api-key')!
const baseUrlInput = document.querySelector<HTMLInputElement>('#base-url')!
const modelSelect = document.querySelector<HTMLSelectElement>('#model-select')!
const modelCustomInput = document.querySelector<HTMLInputElement>('#model-custom')!
const localModelSelect = document.querySelector<HTMLSelectElement>('#local-model-select')!
const refreshLocalModelsButton = document.querySelector<HTMLButtonElement>('#refresh-local-models')!
const importLocalModelButton = document.querySelector<HTMLButtonElement>('#import-local-model')!
const localGpuBackend = document.querySelector<HTMLSelectElement>('#local-gpu-backend')!
const localVramMode = document.querySelector<HTMLSelectElement>('#local-vram-mode')!
const localContextSize = document.querySelector<HTMLInputElement>('#local-context-size')!
const localBatchSize = document.querySelector<HTMLInputElement>('#local-batch-size')!
const localThreads = document.querySelector<HTMLInputElement>('#local-threads')!
const localKvCache = document.querySelector<HTMLSelectElement>('#local-kv-cache')!
const localFlashAttention = document.querySelector<HTMLInputElement>('#local-flash-attention')!
const localUseMmap = document.querySelector<HTMLInputElement>('#local-use-mmap')!
const localUseMlock = document.querySelector<HTMLInputElement>('#local-use-mlock')!
const localSharedMemory = document.querySelector<HTMLInputElement>('#local-shared-memory')!
const localStatus = document.querySelector<HTMLElement>('#local-status')!
const unloadLocalModel = document.querySelector<HTMLButtonElement>('#unload-local-model')!
const temperatureInput = document.querySelector<HTMLInputElement>('#temperature')!
const maxTokensInput = document.querySelector<HTMLInputElement>('#max-tokens')!
const petScaleInput = document.querySelector<HTMLInputElement>('#pet-scale')!
const scaleValue = document.querySelector<HTMLElement>('#scale-value')!
const modelPreview = document.querySelector<HTMLImageElement>('#model-preview')!
const chooseModel = document.querySelector<HTMLButtonElement>('#choose-model')!
const settingsAffinity = document.querySelector<HTMLElement>('#settings-affinity')!
const characterCardInput = document.querySelector<HTMLTextAreaElement>('#character-card')!
const settingsStatus = document.querySelector<HTMLSpanElement>('#settings-status')!
const resetCard = document.querySelector<HTMLButtonElement>('#reset-card')!
const devModal = document.querySelector<HTMLDialogElement>('#dev-modal')!
const devForm = document.querySelector<HTMLFormElement>('#dev-form')!
const closeDev = document.querySelector<HTMLButtonElement>('#close-dev')!
const devAffinityInput = document.querySelector<HTMLInputElement>('#dev-affinity')!
const devAffinityNumber = document.querySelector<HTMLInputElement>('#dev-affinity-number')!
const devAffinityValue = document.querySelector<HTMLElement>('#dev-affinity-value')!
const simModal = document.querySelector<HTMLDialogElement>('#sim-modal')!
const simForm = document.querySelector<HTMLFormElement>('#sim-form')!
const closeSim = document.querySelector<HTMLButtonElement>('#close-sim')!
const storyContextInput = document.querySelector<HTMLTextAreaElement>('#story-context')!
const generateStory = document.querySelector<HTMLButtonElement>('#generate-story')!
const saveStory = document.querySelector<HTMLButtonElement>('#save-story')!
const addUserLine = document.querySelector<HTMLButtonElement>('#add-user-line')!
const addAssistantLine = document.querySelector<HTMLButtonElement>('#add-assistant-line')!
const undoLine = document.querySelector<HTMLButtonElement>('#undo-line')!
const simList = document.querySelector<HTMLDivElement>('#sim-list')!
const simPrompt = document.querySelector<HTMLInputElement>('#sim-prompt')!

const knownModels = new Set(['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'])

let messages: ChatMessage[] = []
let config: RendererConfig
let collapsed = false
let avatarClickCount = 0
let avatarClickTimer: number | undefined
let localModels: LocalModelInfo[] = []
let characterCards: CharacterCardInfo[] = []
let activeMemoryKey = ''

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${bytes} B`
}

function say(text: string): void {
  bubble.textContent = text
  bubble.classList.remove('pop')
  void bubble.offsetWidth
  bubble.classList.add('pop')
}

function setMood(mood: 'idle' | 'thinking' | 'happy' | 'error'): void {
  avatar.dataset.mood = mood
}

function setBusy(isBusy: boolean): void {
  sendButton.disabled = isBusy
  promptInput.disabled = isBusy
  setMood(isBusy ? 'thinking' : 'idle')
}

function affinityStage(score: number): string {
  if (score <= -60) return '厌恶'
  if (score < 0) return '疏离'
  if (score < 30) return '普通'
  if (score < 70) return '熟悉'
  return '亲近'
}

function affinityLine(score = config.affinity): string {
  return `好感度 ${score}｜${affinityStage(score)}`
}

function characterCardText(card: CharacterCard): string {
  return JSON.stringify(card, null, 2)
}

function renderHistory(): void {
  if (messages.length === 0) {
    historyList.innerHTML = `<p class="empty-history">还没有聊天记录。</p>`
    renderSimulation()
    return
  }

  historyList.innerHTML = messages
    .slice(-60)
    .map((message, visibleIndex) => {
      const index = Math.max(0, messages.length - 60) + visibleIndex
      const role = message.role === 'user' ? '你' : config.characterCard.name
      return `
        <article class="history-item ${message.role}">
          <div class="history-meta">
            <span>${role}</span>
            <button class="text-button danger-text" data-delete-history="${index}" type="button">删除</button>
          </div>
          <p>${escapeHtml(message.content)}</p>
        </article>
      `
    })
    .join('')

  historyList.scrollTop = historyList.scrollHeight
  renderSimulation()
}

function renderSimulation(): void {
  if (!simList) return
  if (messages.length === 0) {
    simList.innerHTML = `<p class="empty-history">这一幕还没有台词。</p>`
    return
  }

  simList.innerHTML = messages
    .map(
      (message, index) => `
        <article class="sim-line" data-index="${index}">
          <select data-role="${index}">
            <option value="user" ${message.role === 'user' ? 'selected' : ''}>用户</option>
            <option value="assistant" ${message.role === 'assistant' ? 'selected' : ''}>角色</option>
          </select>
          <textarea data-content="${index}" spellcheck="false">${escapeHtml(message.content)}</textarea>
          <button class="text-button danger-text" data-delete-line="${index}" type="button">删除</button>
        </article>
      `
    )
    .join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function parseCharacterCard(): Partial<CharacterCard> | null {
  try {
    const parsed = JSON.parse(characterCardInput.value) as Partial<CharacterCard>
    if (!parsed || typeof parsed !== 'object') throw new Error('角色卡必须是 JSON 对象')
    if (parsed.speechStyle && !Array.isArray(parsed.speechStyle)) {
      throw new Error('speechStyle 必须是字符串数组')
    }
    if (parsed.behaviorRules && !Array.isArray(parsed.behaviorRules)) {
      throw new Error('behaviorRules 必须是字符串数组')
    }
    return parsed
  } catch (error) {
    settingsStatus.textContent = error instanceof Error ? error.message : '角色卡 JSON 格式不对'
    settingsStatus.dataset.kind = 'error'
    return null
  }
}

function updateProviderVisibility(): void {
  apiSection.hidden = providerSelect.value !== 'api'
  localSection.hidden = providerSelect.value !== 'local'
}

function applyConfig(nextConfig: RendererConfig): void {
  const previousMemoryKey = activeMemoryKey
  config = nextConfig
  activeMemoryKey = config.memoryKey
  document.documentElement.style.setProperty('--pet-scale', String(config.petScale))
  interactionMode.value = config.interactionMode
  storyContextInput.value = config.storyContext
  characterSourceSelect.value = config.characterId || 'manual'
  providerSelect.value = config.provider
  baseUrlInput.value = config.baseUrl
  temperatureInput.value = String(config.temperature)
  maxTokensInput.value = String(config.maxTokens)
  petScaleInput.value = String(config.petScale)
  scaleValue.textContent = `${Math.round(config.petScale * 100)}%`
  characterCardInput.value = characterCardText(config.characterCard)
  apiKeyInput.placeholder = config.apiKeySet ? '已保存 key；留空不修改' : '粘贴 DeepSeek API key'
  settingsAffinity.textContent = affinityLine()
  devAffinityInput.value = String(config.affinity)
  devAffinityNumber.value = String(config.affinity)
  devAffinityValue.textContent = String(config.affinity)
  avatar.alt = `${config.characterCard.name} 桌宠`

  localGpuBackend.value = config.local.gpuBackend
  localVramMode.value = config.local.vramMode
  localContextSize.value = String(config.local.contextSize)
  localBatchSize.value = String(config.local.batchSize)
  localThreads.value = String(config.local.threads)
  localFlashAttention.checked = config.local.flashAttention
  localUseMmap.checked = config.local.useMmap
  localUseMlock.checked = config.local.useMlock
  localSharedMemory.checked = config.local.allowSharedMemory
  localKvCache.value = config.local.kvCacheType

  if (knownModels.has(config.model)) {
    modelSelect.value = config.model
    modelCustomInput.value = ''
  } else {
    modelSelect.value = 'custom'
    modelCustomInput.value = config.model
  }
  modelCustomInput.disabled = modelSelect.value !== 'custom'
  updateProviderVisibility()
  updateCharacterHint()
  renderHistory()

  if (previousMemoryKey && previousMemoryKey !== activeMemoryKey) {
    void loadMemoryForCurrentConfig()
  }
  void refreshCharacterBackground()
}

function renderLocalModels(): void {
  const selected = config?.local.modelPath || ''
  localModelSelect.innerHTML = ''

  if (localModels.length === 0) {
    const option = new Option('没有发现 GGUF 模型', '')
    localModelSelect.add(option)
    return
  }

  for (const model of localModels) {
    const source = model.source === 'library' ? 'models' : 'E:\\mod'
    const option = new Option(`${model.name} · ${formatBytes(model.size)} · ${source}`, model.path)
    localModelSelect.add(option)
  }

  localModelSelect.value = selected && localModels.some((model) => model.path === selected) ? selected : localModels[0].path
}

async function refreshLocalModels(): Promise<void> {
  localModels = await window.pet.scanLocalModels()
  renderLocalModels()
}

function renderCharacterCards(): void {
  const selected = config?.characterId || 'manual'
  characterSourceSelect.innerHTML = ''
  characterSourceSelect.add(new Option('手写当前角色卡', 'manual'))

  for (const card of characterCards) {
    const parts = [
      card.source === 'builtin' ? '内置' : '角色库',
      card.hasJson ? 'JSON' : '',
      card.hasPng ? 'PNG' : ''
    ].filter(Boolean)
    characterSourceSelect.add(new Option(`${card.name} · ${parts.join(' / ')}`, card.id))
  }

  characterSourceSelect.value =
    selected && [...characterSourceSelect.options].some((option) => option.value === selected) ? selected : 'manual'
  updateCharacterHint()
}

async function refreshCharacterCards(): Promise<void> {
  characterCards = await window.pet.scanCharacterCards()
  renderCharacterCards()
}

function updateCharacterHint(): void {
  if (!config) return
  const selected = characterCards.find((card) => card.id === characterSourceSelect.value)
  if (characterSourceSelect.value === 'manual') {
    characterCardHint.textContent = '当前使用下面文本框里的角色卡。聊天记录按这个角色卡内容单独保存。'
    return
  }
  if (!selected) {
    characterCardHint.textContent = '角色库未刷新，或当前角色卡文件不存在。'
    return
  }
  const fileState = selected.hasJson && selected.hasPng ? 'JSON 和 PNG 已配对' : selected.hasJson ? '只有 JSON' : '只有 PNG'
  characterCardHint.textContent = `${selected.baseName} · ${fileState}。模拟对话模式会自动使用 PNG 背景；桌宠模式只使用角色设定。`
}

async function refreshCharacterBackground(): Promise<void> {
  const background = await window.pet.getCharacterBackground()
  if (background) {
    document.documentElement.style.setProperty('--character-bg', `url("${background}")`)
    simModal.classList.add('has-bg')
  } else {
    document.documentElement.style.setProperty('--character-bg', 'none')
    simModal.classList.remove('has-bg')
  }
}

async function loadMemoryForCurrentConfig(): Promise<void> {
  messages = await window.pet.getMemory()
  renderHistory()
  if (messages.length > 0) {
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    say(lastAssistant?.content || config.characterCard.greeting)
  } else {
    say(config.characterCard.greeting)
  }
}

async function refreshLocalStatus(): Promise<void> {
  const status = await window.pet.getLocalStatus()
  const supported = status.supportedGpuTypes.map((type) => (type === false ? 'CPU' : String(type))).join(' / ') || '未探测到'
  localStatus.textContent = status.loaded ? `本地模型已加载｜${supported}` : `本地运行时未加载｜${supported}`
}

async function refreshModelImage(): Promise<void> {
  const customImage = await window.pet.getModelImage()
  const image = customImage || bundledPetImage
  avatar.src = image
  modelPreview.src = image
}

async function persist(): Promise<void> {
  await window.pet.setMemory(messages)
  renderHistory()
}

function affinityDeltaFrom(text: string): number {
  const positive = /谢谢|喜欢|可爱|厉害|棒|辛苦|爱你|不错|好耶|夸夸|抱抱|漂亮|可靠/
  const negative = /讨厌|滚|垃圾|废物|傻|闭嘴|烦|坏|没用|笨|蠢|烦死/
  if (negative.test(text)) return -6
  if (positive.test(text)) return 4
  return text.length >= 5 ? 1 : 0
}

async function setAffinity(score: number, announce = false): Promise<void> {
  const nextScore = Math.round(clamp(score, -100, 100))
  const next = await window.pet.saveConfig({ affinity: nextScore })
  applyConfig(next)
  if (announce) say(affinityLine(nextScore))
}

async function adjustScale(delta: number): Promise<void> {
  const nextScale = clamp(Number((config.petScale + delta).toFixed(2)), 0.7, 1.45)
  const next = await window.pet.saveConfig({ petScale: nextScale })
  applyConfig(next)
}

async function ask(text: string): Promise<void> {
  const delta = affinityDeltaFrom(text)
  if (delta !== 0) {
    await setAffinity(config.affinity + delta)
  }

  messages.push({ role: 'user', content: text })
  await persist()

  setBusy(true)
  if (config.provider === 'local') {
    const status = await window.pet.getLocalStatus()
    if (!status.loaded) {
      say(config.affinity < 0 ? '本地模型在加载。别催。' : '本地模型启动中，第一次会慢一点。')
    } else {
      say(config.affinity < 0 ? '说吧，我在听。' : '嗯，我在想。')
    }
  } else {
    say(config.affinity < 0 ? '行。我听着呢。最好不是废话。' : '处理中。你最好问了个有意思的问题。')
  }

  try {
    const answer = await window.pet.chat(messages)
    messages.push({ role: 'assistant', content: answer })
    await persist()
    setMood('happy')
    say(answer)
    await refreshLocalStatus()
    window.setTimeout(() => setMood('idle'), 1300)
  } catch (error) {
    console.error(error)
    setMood('error')
    const fallback = config.provider === 'local' ? '本地模型没跑起来。检查 GGUF、引擎和显存设置。' : '云端接口没接通。检查 key、网络，或者模型名。'
    say(readableIpcError(error) || fallback)
  } finally {
    setBusy(false)
    promptInput.focus()
  }
}

function readableIpcError(error: unknown): string {
  if (!(error instanceof Error)) return ''
  // ipcRenderer.invoke 会把主进程异常包装成 "Error invoking remote method 'x': Error: 原因"
  return error.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').trim()
}

function openSettings(): void {
  settingsStatus.textContent = ''
  settingsStatus.dataset.kind = ''
  void refreshLocalModels()
  void refreshLocalStatus()
  window.pet.expandPanel()
  if (!settingsModal.open) settingsModal.showModal()
}

function openDevMode(): void {
  devAffinityInput.value = String(config.affinity)
  devAffinityNumber.value = String(config.affinity)
  devAffinityValue.textContent = String(config.affinity)
  if (!devModal.open) devModal.showModal()
}

async function saveSettings(): Promise<void> {
  const characterCard = parseCharacterCard()
  if (!characterCard) return

  const selectedModel = modelSelect.value === 'custom' ? modelCustomInput.value.trim() : modelSelect.value
  const next = await window.pet.saveConfig({
    interactionMode: interactionMode.value as RendererConfig['interactionMode'],
    storyContext: storyContextInput.value.trim(),
    characterId: characterSourceSelect.value || 'manual',
    characterPngPath: config.characterPngPath,
    provider: providerSelect.value as RendererConfig['provider'],
    apiKey: apiKeyInput.value.trim(),
    baseUrl: baseUrlInput.value.trim(),
    model: selectedModel,
    temperature: Number(temperatureInput.value),
    maxTokens: Number(maxTokensInput.value),
    petScale: Number(petScaleInput.value),
    characterCard,
    local: {
      modelPath: localModelSelect.value,
      gpuBackend: localGpuBackend.value as LocalSettings['gpuBackend'],
      vramMode: localVramMode.value as LocalSettings['vramMode'],
      contextSize: Number(localContextSize.value),
      batchSize: Number(localBatchSize.value),
      threads: Number(localThreads.value),
      flashAttention: localFlashAttention.checked,
      useMmap: localUseMmap.checked,
      useMlock: localUseMlock.checked,
      allowSharedMemory: localSharedMemory.checked,
      kvCacheType: localKvCache.value as LocalSettings['kvCacheType']
    }
  })

  apiKeyInput.value = ''
  applyConfig(next)
  settingsStatus.textContent = '已保存'
  settingsStatus.dataset.kind = 'ok'
  say(`${config.characterCard.name} 的设置已经更新。`)
}

function setCollapsed(nextCollapsed: boolean): void {
  collapsed = nextCollapsed
  panel.classList.toggle('collapsed', collapsed)
  chatHandle.classList.toggle('visible', collapsed)
  togglePanel.textContent = collapsed ? '+' : '_'
  togglePanel.title = collapsed ? '展开输入区' : '隐藏输入区'
}

composer.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = promptInput.value.trim()
  if (!text) return
  promptInput.value = ''
  void ask(text)
})

petStage.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  openSettings()
})

avatar.addEventListener('click', () => {
  say(affinityLine())
  avatarClickCount += 1
  window.clearTimeout(avatarClickTimer)

  if (avatarClickCount >= 4) {
    avatarClickCount = 0
    openDevMode()
    say('开发者模式。别乱调，调坏了也别看我。')
    return
  }

  avatarClickTimer = window.setTimeout(() => {
    avatarClickCount = 0
  }, 850)
})

openHistory.addEventListener('click', () => {
  historyPanel.classList.toggle('open')
  renderHistory()
})

historyList.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const deleteIndex = target.dataset.deleteHistory
  if (deleteIndex === undefined) return
  messages.splice(Number(deleteIndex), 1)
  void persist()
})

clearHistory.addEventListener('click', async () => {
  messages = []
  await window.pet.clearMemory()
  renderHistory()
  say('聊天历史清空。')
})

closeHistory.addEventListener('click', () => {
  historyPanel.classList.remove('open')
})

zoomOut.addEventListener('click', () => {
  void adjustScale(-0.05)
})

zoomIn.addEventListener('click', () => {
  void adjustScale(0.05)
})

openSettingsButton.addEventListener('click', openSettings)

openSimButton.addEventListener('click', () => {
  interactionMode.value = 'simulation'
  void window.pet.saveConfig({ interactionMode: 'simulation', storyContext: storyContextInput.value.trim() }).then(applyConfig)
  renderSimulation()
  window.pet.expandPanel()
  if (!simModal.open) simModal.showModal()
})

chatHandle.addEventListener('click', () => {
  setCollapsed(false)
  promptInput.focus()
})

closeSettings.addEventListener('click', () => {
  settingsModal.close()
  window.pet.restorePetWindow()
})

settingsModal.addEventListener('close', () => {
  window.pet.restorePetWindow()
})

settingsForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void saveSettings()
})

providerSelect.addEventListener('change', updateProviderVisibility)

refreshCharacterCardsButton.addEventListener('click', () => {
  void refreshCharacterCards()
})

characterSourceSelect.addEventListener('change', async () => {
  if (characterSourceSelect.value === 'manual') {
    const characterCard = parseCharacterCard()
    if (!characterCard) return
    const next = await window.pet.saveConfig({
      characterId: 'manual',
      characterPngPath: '',
      characterCard
    })
    applyConfig(next)
    await loadMemoryForCurrentConfig()
    return
  }

  const next = await window.pet.selectCharacterCard(characterSourceSelect.value)
  applyConfig(next)
  await loadMemoryForCurrentConfig()
  settingsStatus.textContent = '角色卡已载入'
  settingsStatus.dataset.kind = 'ok'
})

interactionMode.addEventListener('change', () => {
  void window.pet
    .saveConfig({ interactionMode: interactionMode.value as RendererConfig['interactionMode'] })
    .then(applyConfig)
})

modelSelect.addEventListener('change', () => {
  modelCustomInput.disabled = modelSelect.value !== 'custom'
})

refreshLocalModelsButton.addEventListener('click', () => {
  void refreshLocalModels()
})

importLocalModelButton.addEventListener('click', async () => {
  localModels = await window.pet.importLocalModel()
  renderLocalModels()
  settingsStatus.textContent = '模型库已更新'
  settingsStatus.dataset.kind = 'ok'
})

unloadLocalModel.addEventListener('click', async () => {
  await window.pet.unloadLocalModel()
  await refreshLocalStatus()
  say('本地模型已经卸载。')
})

closeSim.addEventListener('click', () => {
  simModal.close()
  window.pet.restorePetWindow()
})

simModal.addEventListener('close', () => {
  window.pet.restorePetWindow()
})

saveStory.addEventListener('click', async () => {
  const next = await window.pet.saveConfig({
    interactionMode: 'simulation',
    storyContext: storyContextInput.value.trim()
  })
  applyConfig(next)
  say('剧情已保存。')
})

generateStory.addEventListener('click', async () => {
  generateStory.disabled = true
  const oldText = generateStory.textContent
  generateStory.textContent = '生成中'
  try {
    const prompt = [
      '请为当前角色生成一段适合一问一答对话模拟的剧情开场。',
      '要求：简体中文，120字以内，包含地点、当前关系、微妙冲突和可继续推进的目标。',
      '不要解释，不要分条，只输出剧情。'
    ].join('\n')
    const story = await window.pet.chat([...messages, { role: 'user', content: prompt }])
    storyContextInput.value = story
    const next = await window.pet.saveConfig({ interactionMode: 'simulation', storyContext: story })
    applyConfig(next)
  } catch (error) {
    console.error(error)
    setMood('error')
    say(readableIpcError(error) || '剧情生成失败，检查模型设置后再试。')
  } finally {
    generateStory.disabled = false
    generateStory.textContent = oldText
  }
})

addUserLine.addEventListener('click', () => {
  messages.push({ role: 'user', content: '新的台词' })
  void persist()
})

addAssistantLine.addEventListener('click', () => {
  messages.push({ role: 'assistant', content: '……' })
  void persist()
})

undoLine.addEventListener('click', () => {
  messages.pop()
  void persist()
})

simList.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement | HTMLTextAreaElement
  const roleIndex = (target as HTMLElement).dataset.role
  if (roleIndex !== undefined) {
    messages[Number(roleIndex)].role = target.value as ChatMessage['role']
    void persist()
  }
})

simList.addEventListener('input', (event) => {
  const target = event.target as HTMLTextAreaElement
  const contentIndex = target.dataset.content
  if (contentIndex === undefined) return
  messages[Number(contentIndex)].content = target.value
})

simList.addEventListener('focusout', (event) => {
  const target = event.target as HTMLTextAreaElement
  if (target.dataset.content === undefined) return
  void persist()
})

simList.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const index = target.dataset.deleteLine
  if (index === undefined) return
  messages.splice(Number(index), 1)
  void persist()
})

simForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = simPrompt.value.trim()
  if (!text) return
  simPrompt.value = ''
  void window.pet
    .saveConfig({ interactionMode: 'simulation', storyContext: storyContextInput.value.trim() })
    .then(applyConfig)
    .then(() => ask(text))
})

petScaleInput.addEventListener('input', () => {
  scaleValue.textContent = `${Math.round(Number(petScaleInput.value) * 100)}%`
})

chooseModel.addEventListener('click', async () => {
  const next = await window.pet.selectModelImage()
  applyConfig(next)
  await refreshModelImage()
  settingsStatus.textContent = '模型图片已更新'
  settingsStatus.dataset.kind = 'ok'
})

resetCard.addEventListener('click', async () => {
  const next = await window.pet.resetCharacterCard()
  applyConfig(next)
  renderCharacterCards()
  await loadMemoryForCurrentConfig()
  settingsStatus.textContent = '角色卡已恢复'
  settingsStatus.dataset.kind = 'ok'
  say(next.characterCard.greeting)
})

togglePanel.addEventListener('click', () => {
  setCollapsed(!collapsed)
})

clearMemory.addEventListener('click', async () => {
  messages = []
  await window.pet.clearMemory()
  renderHistory()
  setMood('happy')
  say('记忆清空。现在我们重新开始。')
})

closeWindow.addEventListener('click', () => {
  window.pet.close()
})

closeDev.addEventListener('click', () => {
  devModal.close()
})

devAffinityInput.addEventListener('input', () => {
  devAffinityNumber.value = devAffinityInput.value
  devAffinityValue.textContent = devAffinityInput.value
})

devAffinityNumber.addEventListener('input', () => {
  const value = String(clamp(Number(devAffinityNumber.value), -100, 100))
  devAffinityInput.value = value
  devAffinityValue.textContent = value
})

devForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void setAffinity(Number(devAffinityNumber.value), true).then(() => devModal.close())
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const hadPanel = settingsModal.open || simModal.open
    if (settingsModal.open) settingsModal.close()
    if (devModal.open) devModal.close()
    if (simModal.open) simModal.close()
    if (hadPanel) window.pet.restorePetWindow()
    if (historyPanel.classList.contains('open')) historyPanel.classList.remove('open')
    promptInput.blur()
  }
})

config = await window.pet.getConfig()
applyConfig(config)
await refreshCharacterCards()
await refreshLocalModels()
renderLocalModels()
await refreshLocalStatus()
await refreshModelImage()
await loadMemoryForCurrentConfig()

setCollapsed(false)
promptInput.focus()

/**
 * 声明式插件：加载、校验、模板渲染与定时调度。
 *
 * 安全模型：插件是纯 JSON 数据，程序只读取 plugin.json，不会 require / eval 插件里的任何内容。
 * 插件能做的事情仅限于：在气泡里说话（问候 / 提醒 / 闲聊）、响应快捷命令、往系统提示词里追加一段话。
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  PluginCommand,
  PluginGreeting,
  PluginIdle,
  PluginInfo,
  PluginLoadError,
  PluginManifest,
  PluginMessage,
  PluginReminder
} from '../shared/plugin-types'

export const MAX_MANIFEST_BYTES = 256 * 1024
const MAX_TEXT = 500
const MAX_ITEMS = 50

export type LoadedPlugin = {
  manifest: PluginManifest
  dir: string
}

export type TemplateContext = {
  now: Date
  characterName: string
  affinity: number
}

class ManifestError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ManifestError(message)
}

function text(value: unknown, field: string, max = MAX_TEXT): string {
  assert(typeof value === 'string' && value.trim(), `${field} 必须是非空字符串`)
  return value.trim().slice(0, max)
}

function textList(value: unknown, field: string): string[] {
  const list = Array.isArray(value) ? value : [value]
  const result = list.filter((item) => typeof item === 'string' && item.trim()).map((item) => (item as string).trim().slice(0, MAX_TEXT))
  assert(result.length > 0, `${field} 至少需要一条文本`)
  return result.slice(0, MAX_ITEMS)
}

function hourRange(value: unknown, field: string): [number, number] {
  assert(
    Array.isArray(value) &&
      value.length === 2 &&
      value.every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 24),
    `${field} 必须是 [开始小时, 结束小时]，取值 0–24`
  )
  return [value[0], value[1]]
}

function list<T>(value: unknown, field: string, map: (item: Record<string, unknown>, index: number) => T): T[] | undefined {
  if (value === undefined) return undefined
  assert(Array.isArray(value), `${field} 必须是数组`)
  assert(value.length <= MAX_ITEMS, `${field} 最多 ${MAX_ITEMS} 项`)
  return value.map((item, index) => {
    assert(item && typeof item === 'object', `${field}[${index}] 必须是对象`)
    return map(item as Record<string, unknown>, index)
  })
}

/** 校验并规范化 plugin.json，失败时抛出带中文原因的错误 */
export function parseManifest(raw: unknown): PluginManifest {
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'plugin.json 必须是 JSON 对象')
  const source = raw as Record<string, unknown>
  assert(source.manifestVersion === 1, 'manifestVersion 必须为 1')
  const id = text(source.id, 'id', 64)
  assert(/^[a-z0-9][a-z0-9-_]*$/.test(id), 'id 只能包含小写字母、数字、- 和 _')

  const manifest: PluginManifest = {
    manifestVersion: 1,
    id,
    name: text(source.name, 'name', 64),
    version: text(source.version, 'version', 32),
    description: typeof source.description === 'string' ? source.description.slice(0, MAX_TEXT) : '',
    author: typeof source.author === 'string' ? source.author.slice(0, 64) : '',
    enabledByDefault: source.enabledByDefault !== false
  }

  if (source.systemPrompt !== undefined) manifest.systemPrompt = text(source.systemPrompt, 'systemPrompt', 2000)

  manifest.greetings = list(source.greetings, 'greetings', (item, index): PluginGreeting => ({
    hours: hourRange(item.hours, `greetings[${index}].hours`),
    texts: textList(item.texts, `greetings[${index}].texts`)
  }))

  manifest.reminders = list(source.reminders, 'reminders', (item, index): PluginReminder => {
    const field = `reminders[${index}]`
    const reminderText = textList(item.text, `${field}.text`)
    if (item.every !== undefined) {
      assert(typeof item.every === 'number' && item.every >= 1 && item.every <= 24 * 60, `${field}.every 必须是 1–1440 的分钟数`)
      return {
        every: item.every,
        text: reminderText,
        ...(item.activeHours !== undefined ? { activeHours: hourRange(item.activeHours, `${field}.activeHours`) } : {})
      }
    }
    assert(typeof item.at === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.at), `${field} 需要 every（分钟）或 at（"HH:MM"）`)
    const weekdays =
      item.weekdays === undefined
        ? undefined
        : (assert(
            Array.isArray(item.weekdays) && item.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
            `${field}.weekdays 取值 0–6`
          ),
          item.weekdays as number[])
    return { at: item.at, text: reminderText, ...(weekdays ? { weekdays } : {}) }
  })

  manifest.commands = list(source.commands, 'commands', (item, index): PluginCommand => ({
    trigger: text(item.trigger, `commands[${index}].trigger`, 32),
    reply: textList(item.reply, `commands[${index}].reply`),
    ...(typeof item.description === 'string' ? { description: item.description.slice(0, 120) } : {})
  }))

  if (source.idle !== undefined) {
    assert(source.idle && typeof source.idle === 'object', 'idle 必须是对象')
    const idle = source.idle as Record<string, unknown>
    assert(
      typeof idle.afterMinutes === 'number' && idle.afterMinutes >= 1 && idle.afterMinutes <= 24 * 60,
      'idle.afterMinutes 必须是 1–1440 的分钟数'
    )
    manifest.idle = { afterMinutes: idle.afterMinutes, texts: textList(idle.texts, 'idle.texts') } satisfies PluginIdle
  }

  return manifest
}

/** 扫描 plugins/ 下每个子目录的 plugin.json */
export async function loadPlugins(pluginsDir: string): Promise<{ plugins: LoadedPlugin[]; errors: PluginLoadError[] }> {
  const plugins: LoadedPlugin[] = []
  const errors: PluginLoadError[] = []
  if (!existsSync(pluginsDir)) return { plugins, errors }

  const seen = new Set<string>()
  const entries = await readdir(pluginsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    const dir = join(pluginsDir, entry.name)
    const manifestPath = join(dir, 'plugin.json')
    if (!existsSync(manifestPath)) continue
    try {
      const info = await stat(manifestPath)
      if (info.size > MAX_MANIFEST_BYTES) throw new ManifestError('plugin.json 超过 256 KB')
      const manifest = parseManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
      if (seen.has(manifest.id)) throw new ManifestError(`插件 id "${manifest.id}" 重复`)
      seen.add(manifest.id)
      plugins.push({ manifest, dir })
    } catch (error) {
      const message = error instanceof SyntaxError ? `JSON 格式错误：${error.message}` : error instanceof Error ? error.message : String(error)
      errors.push({ dir, message })
    }
  }
  plugins.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  return { plugins, errors }
}

export function isPluginEnabled(manifest: PluginManifest, states: Record<string, boolean>): boolean {
  return typeof states[manifest.id] === 'boolean' ? states[manifest.id] : manifest.enabledByDefault !== false
}

export function toPluginInfo(plugin: LoadedPlugin, states: Record<string, boolean>): PluginInfo {
  const { manifest } = plugin
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description || '',
    author: manifest.author || '',
    dir: plugin.dir,
    enabled: isPluginEnabled(manifest, states),
    summary: {
      greetings: manifest.greetings?.length || 0,
      reminders: manifest.reminders?.length || 0,
      commands: (manifest.commands || []).map((command) => command.trigger),
      idle: Boolean(manifest.idle),
      systemPrompt: Boolean(manifest.systemPrompt)
    }
  }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 渲染模板变量：{time} {date} {weekday} {hour} {name} {affinity} */
export function renderTemplate(template: string, context: TemplateContext): string {
  const { now } = context
  const values: Record<string, string> = {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    weekday: `星期${WEEKDAYS[now.getDay()]}`,
    hour: String(now.getHours()),
    name: context.characterName,
    affinity: String(context.affinity)
  }
  return template.replace(/\{(time|date|weekday|hour|name|affinity)\}/g, (_match, key: string) => values[key])
}

export function pickText(texts: string | string[], random = Math.random): string {
  const list = Array.isArray(texts) ? texts : [texts]
  return list[Math.floor(random() * list.length) % list.length]
}

function inHours(hour: number, range: [number, number]): boolean {
  const [start, end] = range
  // 支持跨午夜，例如 [22, 6]
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end
}

export function findGreeting(plugins: LoadedPlugin[], now: Date): { plugin: LoadedPlugin; texts: string[] } | null {
  for (const plugin of plugins) {
    const greeting = plugin.manifest.greetings?.find((item) => inHours(now.getHours(), item.hours))
    if (greeting) return { plugin, texts: greeting.texts }
  }
  return null
}

export function findCommand(plugins: LoadedPlugin[], input: string): { plugin: LoadedPlugin; command: PluginCommand } | null {
  const normalized = input.trim().toLowerCase()
  for (const plugin of plugins) {
    const command = plugin.manifest.commands?.find((item) => item.trigger.toLowerCase() === normalized)
    if (command) return { plugin, command }
  }
  return null
}

/** 汇总所有已启用插件追加的系统提示词 */
export function pluginSystemPrompt(plugins: LoadedPlugin[]): string {
  return plugins
    .filter((plugin) => plugin.manifest.systemPrompt)
    .map((plugin) => `【插件：${plugin.manifest.name}】${plugin.manifest.systemPrompt}`)
    .join('\n')
}

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
}

/**
 * 定时调度：每次 tick 检查提醒和闲聊是否到点。时间通过参数传入，方便测试。
 */
export class PluginScheduler {
  private plugins: LoadedPlugin[] = []
  private everyLastFired = new Map<string, number>()
  private atFiredOn = new Map<string, string>()
  private idleLastFired = new Map<string, number>()
  private lastInteraction: number

  constructor(now = Date.now()) {
    this.lastInteraction = now
  }

  setPlugins(plugins: LoadedPlugin[], now = Date.now()): void {
    this.plugins = plugins
    // 新启用的定时提醒从现在开始计时，不会一启用就立刻弹出
    const activeKeys = new Set<string>()
    for (const plugin of plugins) {
      plugin.manifest.reminders?.forEach((reminder, index) => {
        if (!('every' in reminder)) return
        const key = `${plugin.manifest.id}#${index}`
        activeKeys.add(key)
        if (!this.everyLastFired.has(key)) this.everyLastFired.set(key, now)
      })
    }
    for (const key of [...this.everyLastFired.keys()]) if (!activeKeys.has(key)) this.everyLastFired.delete(key)
  }

  noteInteraction(now = Date.now()): void {
    this.lastInteraction = now
    this.idleLastFired.clear()
  }

  tick(now: Date, context: Omit<TemplateContext, 'now'>, random = Math.random): PluginMessage[] {
    const messages: PluginMessage[] = []
    const time = now.getTime()
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    const templateContext = { ...context, now }

    for (const plugin of this.plugins) {
      const { manifest } = plugin
      manifest.reminders?.forEach((reminder, index) => {
        const key = `${manifest.id}#${index}`
        if ('every' in reminder) {
          const last = this.everyLastFired.get(key) ?? time
          if (time - last < reminder.every * 60_000) return
          this.everyLastFired.set(key, time)
          if (reminder.activeHours && !inHours(now.getHours(), reminder.activeHours)) return
        } else {
          if (reminder.at !== hhmm || this.atFiredOn.get(key) === dayKey(now)) return
          if (reminder.weekdays && !reminder.weekdays.includes(now.getDay())) return
          this.atFiredOn.set(key, dayKey(now))
        }
        messages.push({
          pluginId: manifest.id,
          pluginName: manifest.name,
          kind: 'reminder',
          text: renderTemplate(pickText(reminder.text, random), templateContext)
        })
      })

      if (manifest.idle) {
        const interval = manifest.idle.afterMinutes * 60_000
        const since = this.idleLastFired.get(manifest.id) ?? this.lastInteraction
        if (time - since >= interval) {
          this.idleLastFired.set(manifest.id, time)
          messages.push({
            pluginId: manifest.id,
            pluginName: manifest.name,
            kind: 'idle',
            text: renderTemplate(pickText(manifest.idle.texts, random), templateContext)
          })
        }
      }
    }
    return messages
  }
}

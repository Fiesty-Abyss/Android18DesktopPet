/**
 * 声明式插件（plugins/<id>/plugin.json）的类型定义。
 * 插件只包含数据，不执行任何代码，所以不会读写文件、联网或访问 API Key。
 * 完整说明见 plugins/README.md。
 */

export type PluginReminder =
  | {
      /** 每隔多少分钟提醒一次（≥ 1） */
      every: number
      text: string | string[]
      /** 只在这些小时内提醒，[开始, 结束)，例如 [9, 23] */
      activeHours?: [number, number]
    }
  | {
      /** 每天固定时间提醒，24 小时制 "HH:MM" */
      at: string
      text: string | string[]
      /** 只在星期几提醒（0 = 周日 … 6 = 周六），不填表示每天 */
      weekdays?: number[]
    }

export type PluginGreeting = {
  /** 小时范围 [开始, 结束)，例如 [5, 11] 表示 5:00–10:59 */
  hours: [number, number]
  texts: string[]
}

export type PluginCommand = {
  /** 用户输入完全匹配（忽略首尾空格、大小写）时触发，例如 "/time" */
  trigger: string
  reply: string | string[]
  description?: string
}

export type PluginIdle = {
  /** 多少分钟没有聊天后说一句（≥ 1），之后每隔同样时间最多再说一次 */
  afterMinutes: number
  texts: string[]
}

export type PluginManifest = {
  /** 清单格式版本，目前为 1 */
  manifestVersion: 1
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** 第一次发现时是否默认启用，默认 true */
  enabledByDefault?: boolean
  /** 追加到系统提示词末尾的一段话 */
  systemPrompt?: string
  greetings?: PluginGreeting[]
  reminders?: PluginReminder[]
  commands?: PluginCommand[]
  idle?: PluginIdle
}

export type PluginInfo = {
  id: string
  name: string
  version: string
  description: string
  author: string
  dir: string
  enabled: boolean
  summary: {
    greetings: number
    reminders: number
    commands: string[]
    idle: boolean
    systemPrompt: boolean
  }
}

export type PluginLoadError = {
  dir: string
  message: string
}

export type PluginListResult = {
  plugins: PluginInfo[]
  errors: PluginLoadError[]
}

export type PluginMessage = {
  pluginId: string
  pluginName: string
  kind: 'greeting' | 'reminder' | 'idle'
  text: string
}

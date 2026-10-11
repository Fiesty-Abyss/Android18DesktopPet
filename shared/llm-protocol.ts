/**
 * 主进程 <-> 本地推理子进程（utilityProcess）之间的消息协议。
 */
import type { LocalSettings } from './types'

export type LlmChatTurn = { type: 'user'; text: string } | { type: 'model'; response: string[] }

export type LlmPromptPayload = {
  local: LocalSettings
  systemPrompt: string
  priorTurns: LlmChatTurn[]
  prompt: string
  maxTokens: number
  temperature: number
}

export type LlmRequest =
  | { id: number; type: 'prompt'; payload: LlmPromptPayload }
  | { id: number; type: 'unload' }
  | { id: number; type: 'gpu-types' }
  | { id: number; type: 'status' }

/** 去掉 id 的请求体（对联合类型逐个 Omit） */
export type LlmRequestBody = LlmRequest extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never

export type LlmResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

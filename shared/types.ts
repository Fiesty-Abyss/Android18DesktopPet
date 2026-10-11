/**
 * 主进程、preload 与渲染进程共用的类型定义。
 * 只放类型，不放运行时代码，三端都用 `import type` 引入。
 */

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type CharacterCard = {
  name: string
  greeting: string
  persona: string
  speechStyle: string[]
  behaviorRules: string[]
  systemPrompt: string
}

export type CharacterCardInfo = {
  id: string
  name: string
  baseName: string
  jsonPath: string
  pngPath: string
  hasJson: boolean
  hasPng: boolean
  source: 'builtin' | 'library'
}

export type LocalSettings = {
  modelPath: string
  gpuBackend: 'auto' | 'cuda' | 'vulkan' | 'cpu'
  vramMode: 'auto' | 'high' | 'medium' | 'low'
  contextSize: number
  batchSize: number
  threads: number
  flashAttention: boolean
  useMmap: boolean
  useMlock: boolean
  allowSharedMemory: boolean
  kvCacheType: 'F16' | 'Q8_0' | 'Q4_0'
  extraModelDirs: string[]
}

export type InteractionMode = 'pet' | 'simulation'
export type Provider = 'api' | 'local'

export type PetConfig = {
  interactionMode: InteractionMode
  storyContext: string
  characterId: string
  characterPngPath: string
  provider: Provider
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  characterCard: CharacterCard
  modelImagePath: string
  affinity: number
  petScale: number
  alwaysOnTop: boolean
  local: LocalSettings
}

/** 发给渲染进程的配置：去掉明文 API Key，只告诉它“有没有设置” */
export type RendererConfig = Omit<PetConfig, 'apiKey'> & {
  apiKeySet: boolean
  memoryKey: string
}

export type ConfigPatch = Partial<Omit<PetConfig, 'apiKey' | 'characterCard' | 'local'>> & {
  apiKey?: string
  characterCard?: Partial<CharacterCard>
  local?: Partial<LocalSettings>
}

export type LocalModelInfo = {
  name: string
  path: string
  size: number
  source: 'library' | 'external'
  dir: string
}

export type WorkspaceDirKey = 'models' | 'plugins' | 'chats' | 'cache' | 'characterCards'

export type LocalStatus = {
  loaded: boolean
  modelPath: string
  supportedGpuTypes: Array<string | false>
  rootDirs: Record<WorkspaceDirKey, string>
}

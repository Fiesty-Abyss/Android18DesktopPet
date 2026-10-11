/// <reference types="vite/client" />

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type CharacterCard = {
  name: string
  greeting: string
  persona: string
  speechStyle: string[]
  behaviorRules: string[]
  systemPrompt: string
}

type CharacterCardInfo = {
  id: string
  name: string
  baseName: string
  jsonPath: string
  pngPath: string
  hasJson: boolean
  hasPng: boolean
  source: 'builtin' | 'library'
}

type RendererConfig = {
  interactionMode: 'pet' | 'simulation'
  storyContext: string
  characterId: string
  characterPngPath: string
  provider: 'api' | 'local'
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  characterCard: CharacterCard
  modelImagePath: string
  affinity: number
  petScale: number
  alwaysOnTop: boolean
  local: LocalSettings
  apiKeySet: boolean
  memoryKey: string
}

type LocalSettings = {
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

type LocalModelInfo = {
  name: string
  path: string
  size: number
  source: 'library' | 'external'
  dir: string
}

type WorkspaceDirKey = 'models' | 'plugins' | 'chats' | 'cache' | 'characterCards'

type LocalStatus = {
  loaded: boolean
  modelPath: string
  supportedGpuTypes: Array<string | false>
  rootDirs: Record<WorkspaceDirKey, string>
}

type PetConfigPatch = {
  interactionMode?: 'pet' | 'simulation'
  storyContext?: string
  characterId?: string
  characterPngPath?: string
  provider?: 'api' | 'local'
  baseUrl?: string
  apiKey?: string
  model?: string
  temperature?: number
  maxTokens?: number
  characterCard?: Partial<CharacterCard>
  modelImagePath?: string
  affinity?: number
  petScale?: number
  alwaysOnTop?: boolean
  local?: Partial<LocalSettings>
}

interface Window {
  pet: {
    chat: (history: ChatMessage[]) => Promise<string>
    getMemory: () => Promise<ChatMessage[]>
    setMemory: (messages: ChatMessage[]) => Promise<void>
    clearMemory: () => Promise<void>
    getConfig: () => Promise<RendererConfig>
    saveConfig: (patch: PetConfigPatch) => Promise<RendererConfig>
    resetCharacterCard: () => Promise<RendererConfig>
    scanCharacterCards: () => Promise<CharacterCardInfo[]>
    selectCharacterCard: (characterId: string) => Promise<RendererConfig>
    selectModelImage: () => Promise<RendererConfig>
    getModelImage: () => Promise<string | null>
    getCharacterBackground: () => Promise<string | null>
    scanLocalModels: () => Promise<LocalModelInfo[]>
    importLocalModel: () => Promise<LocalModelInfo[]>
    pickModelDirectory: () => Promise<string>
    openFolder: (key: WorkspaceDirKey) => Promise<string>
    getLocalStatus: () => Promise<LocalStatus>
    unloadLocalModel: () => Promise<LocalStatus>
    expandPanel: () => void
    restorePetWindow: () => void
    minimize: () => void
    hide: () => void
    onOpenSettings: (callback: () => void) => () => void
    onConfigChanged: (callback: () => void) => () => void
    close: () => void
  }
}

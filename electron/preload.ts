import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  local?: Partial<LocalSettings>
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

const petAPI = {
  chat: (history: ChatMessage[]) => ipcRenderer.invoke('pet:chat', history),
  getMemory: () => ipcRenderer.invoke('pet:get-memory'),
  setMemory: (messages: ChatMessage[]) => ipcRenderer.invoke('pet:set-memory', messages),
  clearMemory: () => ipcRenderer.invoke('pet:clear-memory'),
  getConfig: () => ipcRenderer.invoke('pet:get-config'),
  saveConfig: (patch: PetConfigPatch) => ipcRenderer.invoke('pet:save-config', patch),
  resetCharacterCard: () => ipcRenderer.invoke('pet:reset-character-card'),
  scanCharacterCards: () => ipcRenderer.invoke('pet:scan-character-cards') as Promise<CharacterCardInfo[]>,
  selectCharacterCard: (characterId: string) => ipcRenderer.invoke('pet:select-character-card', characterId),
  selectModelImage: () => ipcRenderer.invoke('pet:select-model-image'),
  getModelImage: () => ipcRenderer.invoke('pet:get-model-image'),
  getCharacterBackground: () => ipcRenderer.invoke('pet:get-character-background'),
  scanLocalModels: () => ipcRenderer.invoke('pet:scan-local-models'),
  importLocalModel: () => ipcRenderer.invoke('pet:import-local-model'),
  pickModelDirectory: () => ipcRenderer.invoke('pet:pick-model-directory') as Promise<string>,
  openFolder: (key: 'models' | 'plugins' | 'chats' | 'cache' | 'characterCards') =>
    ipcRenderer.invoke('pet:open-folder', key) as Promise<string>,
  getLocalStatus: () => ipcRenderer.invoke('pet:get-local-status'),
  unloadLocalModel: () => ipcRenderer.invoke('pet:unload-local-model'),
  expandPanel: () => ipcRenderer.send('window:expand-panel'),
  restorePetWindow: () => ipcRenderer.send('window:restore-pet'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close')
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('pet', petAPI)
} else {
  const unsafeWindow = window as unknown as Window & {
    electron: typeof electronAPI
    pet: typeof petAPI
  }
  unsafeWindow.electron = electronAPI
  unsafeWindow.pet = petAPI
}

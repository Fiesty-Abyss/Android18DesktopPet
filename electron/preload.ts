import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  CardImportResult,
  CharacterCardInfo,
  ChatMessage,
  ConfigPatch,
  FileActionResult,
  LocalModelInfo,
  LocalStatus,
  RendererConfig,
  WorkspaceDirKey
} from '../shared/types'

function subscribe(channel: string, callback: () => void): () => void {
  const listener = () => callback()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const petAPI = {
  chat: (history: ChatMessage[]) => ipcRenderer.invoke('pet:chat', history) as Promise<string>,
  getMemory: () => ipcRenderer.invoke('pet:get-memory') as Promise<ChatMessage[]>,
  setMemory: (messages: ChatMessage[]) => ipcRenderer.invoke('pet:set-memory', messages) as Promise<void>,
  clearMemory: () => ipcRenderer.invoke('pet:clear-memory') as Promise<void>,
  exportChat: () =>
    ipcRenderer.invoke('pet:export-chat') as Promise<{ ok: boolean; path?: string; message: string }>,
  getConfig: () => ipcRenderer.invoke('pet:get-config') as Promise<RendererConfig>,
  saveConfig: (patch: ConfigPatch) => ipcRenderer.invoke('pet:save-config', patch) as Promise<RendererConfig>,
  resetCharacterCard: () => ipcRenderer.invoke('pet:reset-character-card') as Promise<RendererConfig>,
  scanCharacterCards: () => ipcRenderer.invoke('pet:scan-character-cards') as Promise<CharacterCardInfo[]>,
  selectCharacterCard: (characterId: string) =>
    ipcRenderer.invoke('pet:select-character-card', characterId) as Promise<RendererConfig>,
  importCharacterCards: () => ipcRenderer.invoke('pet:import-character-cards') as Promise<CardImportResult>,
  exportCharacterPng: () => ipcRenderer.invoke('pet:export-character-png') as Promise<FileActionResult>,
  selectModelImage: () => ipcRenderer.invoke('pet:select-model-image') as Promise<RendererConfig>,
  getModelImage: () => ipcRenderer.invoke('pet:get-model-image') as Promise<string | null>,
  getCharacterBackground: () => ipcRenderer.invoke('pet:get-character-background') as Promise<string | null>,
  scanLocalModels: () => ipcRenderer.invoke('pet:scan-local-models') as Promise<LocalModelInfo[]>,
  importLocalModel: () => ipcRenderer.invoke('pet:import-local-model') as Promise<LocalModelInfo[]>,
  pickModelDirectory: () => ipcRenderer.invoke('pet:pick-model-directory') as Promise<string>,
  openFolder: (key: WorkspaceDirKey) => ipcRenderer.invoke('pet:open-folder', key) as Promise<string>,
  getLocalStatus: () => ipcRenderer.invoke('pet:get-local-status') as Promise<LocalStatus>,
  unloadLocalModel: () => ipcRenderer.invoke('pet:unload-local-model') as Promise<LocalStatus>,
  expandPanel: () => ipcRenderer.send('window:expand-panel'),
  restorePetWindow: () => ipcRenderer.send('window:restore-pet'),
  minimize: () => ipcRenderer.send('window:minimize'),
  hide: () => ipcRenderer.send('window:hide'),
  close: () => ipcRenderer.send('window:close'),
  onOpenSettings: (callback: () => void) => subscribe('pet:open-settings', callback),
  onConfigChanged: (callback: () => void) => subscribe('pet:config-changed', callback)
}

export type PetAPI = typeof petAPI

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('pet', petAPI)
} else {
  const unsafeWindow = window as unknown as Window & {
    electron: typeof electronAPI
    pet: PetAPI
  }
  unsafeWindow.electron = electronAPI
  unsafeWindow.pet = petAPI
}

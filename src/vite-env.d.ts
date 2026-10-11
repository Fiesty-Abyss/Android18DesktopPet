/// <reference types="vite/client" />

import type { PetAPI } from '../electron/preload'

declare global {
  interface Window {
    pet: PetAPI
  }
}

export {}

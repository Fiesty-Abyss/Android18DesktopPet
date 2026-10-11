import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron', 'node-llama-cpp'],
        input: {
          main: resolve(__dirname, 'electron/main.ts'),
          // 本地 GGUF 推理在独立的 utilityProcess 里运行
          'llm-worker': resolve(__dirname, 'electron/llm-worker.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron'],
        input: {
          preload: resolve(__dirname, 'electron/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})

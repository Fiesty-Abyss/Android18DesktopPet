/**
 * 主进程侧的本地推理客户端：负责启动 / 重启 llm-worker 子进程，并把请求转成 Promise。
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { LlmPromptPayload, LlmRequest, LlmRequestBody, LlmResponse } from '../shared/llm-protocol'

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

const CRASH_HINT =
  '本地模型进程意外退出。常见原因：内存/显存不足，或纯 CPU 运行较大的模型时触发了 Electron 单次 2GB 内存分配上限。' +
  '建议改用 CUDA/Vulkan 并把显存优化调到“自动适配”或“高显存优先”，或换更小的量化版本。'

export class LocalLlmClient {
  private child: UtilityProcess | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  private loaded = false
  private lastExitCode: number | null = null

  get isLoaded(): boolean {
    return this.loaded
  }

  get lastCrashCode(): number | null {
    return this.lastExitCode
  }

  private ensureChild(): UtilityProcess {
    if (this.child) return this.child

    const child = utilityProcess.fork(join(__dirname, 'llm-worker.js'), [], {
      serviceName: 'Android18 Local LLM',
      stdio: 'inherit'
    })

    child.on('message', (response: LlmResponse) => {
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      if (response.ok) pending.resolve(response.result)
      else pending.reject(new Error(response.error))
    })

    child.on('exit', (code) => {
      this.child = null
      this.loaded = false
      this.lastExitCode = code
      const error = new Error(code === 0 ? '本地模型进程已结束。' : CRASH_HINT)
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
      if (code !== 0) console.error(`[local-llm] worker exited with code ${code}`)
    })

    this.child = child
    return child
  }

  private request<T>(message: LlmRequestBody): Promise<T> {
    const child = this.ensureChild()
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      child.postMessage({ ...message, id } as LlmRequest)
    })
  }

  async prompt(payload: LlmPromptPayload): Promise<string> {
    const answer = await this.request<string>({ type: 'prompt', payload })
    this.loaded = true
    this.lastExitCode = null
    return answer
  }

  async gpuTypes(): Promise<Array<string | false>> {
    try {
      return await this.request<Array<string | false>>({ type: 'gpu-types' })
    } catch {
      return []
    }
  }

  async unload(): Promise<void> {
    if (!this.child) return
    await this.request({ type: 'unload' }).catch(() => undefined)
    this.loaded = false
  }

  dispose(): void {
    this.child?.kill()
    this.child = null
    this.loaded = false
  }
}

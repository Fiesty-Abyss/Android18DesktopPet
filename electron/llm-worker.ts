/**
 * 本地 GGUF 推理子进程。
 *
 * 为什么不放在主进程里：
 * 1. 本地推理很重，放在独立进程里不会拖慢窗口和 IPC；
 * 2. Electron/Chromium 的 PartitionAlloc 对单次 ≥2GiB 的内存分配会直接让进程崩溃（无法 catch），
 *    纯 CPU 跑较大的模型时 llama.cpp 可能触发这个限制。放在子进程里，崩溃只会结束子进程，
 *    桌宠本体还在，并能把原因提示给用户。
 */
import type { LocalSettings } from '../shared/types'
import type { LlmPromptPayload, LlmRequest, LlmResponse } from '../shared/llm-protocol'

type Runtime = {
  key: string
  llama: any
  model: any
  context: any
  session: any
}

let runtime: Runtime | null = null
let nodeLlama: any = null

async function loadNodeLlama(): Promise<any> {
  if (nodeLlama) return nodeLlama
  // 用 Function 包一层，避免打包器把 node-llama-cpp 打进 bundle（它依赖原生二进制）
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>
  nodeLlama = await dynamicImport('node-llama-cpp')
  return nodeLlama
}

function gpuOption(local: LocalSettings): 'auto' | 'cuda' | 'vulkan' | false {
  if (local.gpuBackend === 'cpu') return false
  return local.gpuBackend
}

function vramPadding(local: LocalSettings): number | undefined {
  if (local.gpuBackend === 'cpu') return undefined
  if (local.allowSharedMemory) return 256 * 1024 * 1024
  if (local.vramMode === 'high') return 512 * 1024 * 1024
  if (local.vramMode === 'low') return 1536 * 1024 * 1024
  return 1024 * 1024 * 1024
}

function gpuLayersOption(local: LocalSettings): unknown {
  if (local.gpuBackend === 'cpu' || local.vramMode === 'low') return 0
  if (local.vramMode === 'high') return 'max'
  if (local.vramMode === 'medium') {
    return {
      min: 8,
      max: 28,
      fitContext: { contextSize: local.contextSize }
    }
  }
  return {
    min: 0,
    max: 999,
    fitContext: { contextSize: local.contextSize }
  }
}

function runtimeKey(local: LocalSettings): string {
  return JSON.stringify({
    modelPath: local.modelPath,
    gpuBackend: local.gpuBackend,
    vramMode: local.vramMode,
    contextSize: local.contextSize,
    batchSize: local.batchSize,
    threads: local.threads,
    flashAttention: local.flashAttention,
    useMmap: local.useMmap,
    useMlock: local.useMlock,
    allowSharedMemory: local.allowSharedMemory,
    kvCacheType: local.kvCacheType
  })
}

async function disposeRuntime(): Promise<void> {
  if (!runtime) return
  try {
    runtime.session?.dispose?.({ disposeSequence: true })
    await runtime.context?.dispose?.()
    await runtime.model?.dispose?.()
    await runtime.llama?.dispose?.()
  } finally {
    runtime = null
  }
}

async function ensureRuntime(local: LocalSettings): Promise<Runtime> {
  const key = runtimeKey(local)
  if (runtime?.key === key) return runtime

  await disposeRuntime()

  const { getLlama, LlamaChatSession } = await loadNodeLlama()
  const llama = await getLlama({
    gpu: gpuOption(local),
    vramPadding: vramPadding(local)
  })

  const model = await llama.loadModel({
    modelPath: local.modelPath,
    gpuLayers: gpuLayersOption(local),
    useMmap: local.useMmap,
    useMlock: local.useMlock,
    defaultContextFlashAttention: local.flashAttention,
    ignoreMemorySafetyChecks: local.allowSharedMemory,
    experimentalDefaultContextKvCacheKeyType: local.kvCacheType,
    experimentalDefaultContextKvCacheValueType: local.kvCacheType
  })

  const context = await model.createContext({
    contextSize: local.contextSize,
    batchSize: local.batchSize,
    threads: local.threads === 0 ? undefined : local.threads,
    flashAttention: local.flashAttention,
    ignoreMemorySafetyChecks: local.allowSharedMemory,
    failedCreationRemedy: { retries: 4 }
  })

  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    forceAddSystemPrompt: true
  })

  runtime = { key, llama, model, context, session }
  return runtime
}

async function prompt(payload: LlmPromptPayload): Promise<string> {
  const active = await ensureRuntime(payload.local)
  active.session.setChatHistory([{ type: 'system', text: payload.systemPrompt }, ...payload.priorTurns])

  const answer = await active.session.prompt(payload.prompt, {
    maxTokens: payload.maxTokens,
    temperature: payload.temperature,
    topK: 40,
    topP: 0.92,
    minP: 0.06,
    repeatPenalty: {
      lastTokens: 192,
      penalty: 1.18,
      frequencyPenalty: 0.08,
      presencePenalty: 0.08,
      penalizeNewLine: false
    },
    dryRepeatPenalty: {
      strength: 0.82,
      base: 1.9,
      allowedLength: 2,
      lastTokens: 512,
      sequenceBreakers: ['\n', '。', '！', '？', '，']
    },
    trimWhitespaceSuffix: true,
    customStopTriggers: ['我们是独立的生物，我们是独立的生物', '我是独立的生物，我是独立的生物']
  })
  return String(answer)
}

async function gpuTypes(): Promise<Array<string | false>> {
  try {
    const { getLlamaGpuTypes } = await loadNodeLlama()
    return await getLlamaGpuTypes()
  } catch {
    return []
  }
}

async function handle(request: LlmRequest): Promise<unknown> {
  switch (request.type) {
    case 'prompt':
      return prompt(request.payload)
    case 'unload':
      await disposeRuntime()
      return true
    case 'gpu-types':
      return gpuTypes()
    case 'status':
      return { loaded: Boolean(runtime) }
  }
}

// 串行处理请求：同一时间只跑一次推理，避免多个 prompt 抢同一个上下文
let queue = Promise.resolve()

process.parentPort.on('message', (event: { data: LlmRequest }) => {
  const request = event.data
  queue = queue.then(async () => {
    let response: LlmResponse
    try {
      response = { id: request.id, ok: true, result: await handle(request) }
    } catch (error) {
      response = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    process.parentPort.postMessage(response)
  })
})

import { ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { AiApi, AiError, AiStreamEvent, AiUsage } from '../types/ai'

/**
 * preload · AI 通道（`ai:*`）。
 *
 * 签名真源为 `types/ai.d.ts` 的 `AiApi`，此处以 `satisfies` 结构校验，
 * 避免逐方法重复类型标注。
 *
 * ⚠️ 流式事件约定（全仓首个「主进程 → 渲染层」主动推送）：
 * `ipcRenderer.on` 只在**模块顶层注册一次**，用 `Set` 向多个订阅者分发。
 * 若在 `onStream` 内注册监听，每次订阅都会新增一个监听器，同一事件会被重复触发 N 次，
 * 且退订只能靠 `removeListener` 逐个精确匹配——既易漏也不可回收。
 */

/** 订阅者集合（模块单例；`onStream` 只做 add / delete）。 */
const streamListeners = new Set<(event: AiStreamEvent) => void>()

/** 事件分发：单个订阅者抛错不得影响其它订阅者。 */
function emitStreamEvent(event: AiStreamEvent): void {
  // 复制一份再遍历：允许回调内部退订 / 新增订阅而不破坏本次迭代。
  for (const listener of [...streamListeners]) {
    try {
      listener(event)
    } catch {
      // preload 无日志落盘通道；此处静默，避免一个订阅者拖垮整条推送链。
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取用量对象（仅保留数值字段；缺失 / 非法 → undefined）。 */
function readUsage(value: unknown): AiUsage | undefined {
  if (!isRecord(value)) return undefined
  const usage: AiUsage = {}
  if (typeof value.promptTokens === 'number') usage.promptTokens = value.promptTokens
  if (typeof value.completionTokens === 'number') usage.completionTokens = value.completionTokens
  if (typeof value.totalTokens === 'number') usage.totalTokens = value.totalTokens
  return usage
}

/**
 * 归一化错误码全集（与 `main/ai/types` 的 `AiErrorCode` 同步）。
 *
 * 用对象 + `satisfies` 而非字符串数组：漏加新 code 会编译报错，
 * 否则该 code 会被 `readAiError` 判为非法载荷而静默丢弃，UI 卡在「生成中」。
 */
const AI_ERROR_CODES = {
  network: true,
  timeout: true,
  auth: true,
  rate_limit: true,
  invalid_request: true,
  upstream: true,
  aborted: true,
  unknown: true,
  plan_restricted: true,
  session_missing: true,
  auth_missing: true,
  auth_invalid: true,
  forbidden: true,
  insufficient_quota: true
} satisfies Record<AiError['code'], true>

function isAiErrorCode(value: unknown): value is AiError['code'] {
  return typeof value === 'string' && Object.hasOwn(AI_ERROR_CODES, value)
}

/** 读取脱敏错误对象；缺字段视为非法载荷，直接丢弃。 */
function readAiError(value: unknown): AiError | null {
  if (!isRecord(value)) return null
  if (!isAiErrorCode(value.code) || typeof value.message !== 'string') return null
  return typeof value.status === 'number'
    ? { code: value.code, status: value.status, message: value.message }
    : { code: value.code, message: value.message }
}

// ---- 三个推送通道 → 统一 `AiStreamEvent`（模块顶层只注册一次）----
ipcRenderer.on('ai:chat:delta', (_event: IpcRendererEvent, payload: unknown) => {
  if (!isRecord(payload)) return
  if (typeof payload.requestId !== 'string' || typeof payload.delta !== 'string') return
  emitStreamEvent({ type: 'delta', requestId: payload.requestId, delta: payload.delta })
})

ipcRenderer.on('ai:chat:done', (_event: IpcRendererEvent, payload: unknown) => {
  if (!isRecord(payload) || typeof payload.requestId !== 'string') return
  const usage = readUsage(payload.usage)
  emitStreamEvent(
    usage === undefined
      ? { type: 'done', requestId: payload.requestId }
      : { type: 'done', requestId: payload.requestId, usage }
  )
})

ipcRenderer.on('ai:chat:error', (_event: IpcRendererEvent, payload: unknown) => {
  if (!isRecord(payload) || typeof payload.requestId !== 'string') return
  const error = readAiError(payload.error)
  if (!error) return
  emitStreamEvent({ type: 'error', requestId: payload.requestId, error })
})

export const aiApi = {
  config: {
    get: () => ipcRenderer.invoke('ai:config:get'),
    set: (patch) => ipcRenderer.invoke('ai:config:set', patch)
  },
  models: {
    list: (provider, mode = 'cache') => ipcRenderer.invoke('ai:models:list', { provider, mode })
  },
  test: (provider) => ipcRenderer.invoke('ai:test', { provider }),
  catalog: {
    get: (mode = 'cache') => ipcRenderer.invoke('ai:catalog:get', { mode }),
    limit: (model) => ipcRenderer.invoke('ai:catalog:limit', { model }),
    override: (model, tokens) => ipcRenderer.invoke('ai:catalog:override', { model, tokens }),
    overrides: () => ipcRenderer.invoke('ai:catalog:overrides:list')
  },
  compression: {
    get: () => ipcRenderer.invoke('ai:compression:get'),
    set: (enabled) => ipcRenderer.invoke('ai:compression:set', enabled)
  },
  chat: {
    start: (input) => ipcRenderer.invoke('ai:chat:start', input),
    abort: (requestId) => ipcRenderer.invoke('ai:chat:abort', { requestId }),
    complete: (input) => ipcRenderer.invoke('ai:chat:complete', input),
    onStream: (callback) => {
      streamListeners.add(callback)
      return () => {
        streamListeners.delete(callback)
      }
    }
  },
  sessions: {
    list: (bookId, chapterId) => ipcRenderer.invoke('ai:sessions:list', { bookId, chapterId }),
    create: (input) => ipcRenderer.invoke('ai:sessions:create', input),
    delete: (id) => ipcRenderer.invoke('ai:sessions:delete', { id }),
    rename: (id, title) => ipcRenderer.invoke('ai:sessions:rename', { id, title })
  },
  messages: {
    list: (sessionId) => ipcRenderer.invoke('ai:messages:list', { sessionId }),
    append: (input) => ipcRenderer.invoke('ai:messages:append', input)
  }
} satisfies AiApi

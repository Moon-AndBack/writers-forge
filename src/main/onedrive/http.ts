import { OneDriveError } from './types'
import type { OneDriveErrorCode } from './types'

/**
 * OneDrive 域内共享的 HTTP / 工具函数。
 *
 * 说明：`src/main/ai/http.ts` 中已有同类能力，但其错误归一化产物是 AI 域的
 * `AiError`，且该文件依赖 `openai` SDK。为避免备份模块耦合 AI 域，这里保留
 * 一份最小实现（超时合并、`unknown` 收窄、可中断 sleep），差异仅此一处。
 */

/** 默认请求超时（毫秒）。 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000

/** 超时下限，避免调用方传 0 / 负数导致立即中断。 */
const MIN_TIMEOUT_MS = 1_000

/** 单次请求的取消上下文。 */
export interface RequestSignal {
  signal: AbortSignal
  /** 是否由本地超时触发（用于把 abort 归一化为 timeout）。 */
  timedOut: () => boolean
  /** 清理定时器与外部监听（必须在 finally 调用）。 */
  dispose: () => void
}

/** 把超时值规整到合理区间。 */
export function resolveTimeout(
  timeoutMs: number | undefined,
  fallback: number = DEFAULT_REQUEST_TIMEOUT_MS
): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) return fallback
  return Math.max(MIN_TIMEOUT_MS, Math.floor(timeoutMs))
}

/**
 * 合并外部 signal 与本地超时。
 *
 * 任一先触发都会 abort 下游请求；`dispose()` 必须在 `finally` 中调用。
 */
export function createRequestSignal(
  external: AbortSignal | undefined,
  timeoutMs: number
): RequestSignal {
  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  timer.unref()

  const onExternalAbort = (): void => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    }
  }
}

/** 判定是否为普通对象（用于收窄 `unknown` 形式的 JSON）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取非空字符串字段（缺失 / 非字符串 / 空串返回 null）。 */
export function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** 读取有限数字字段（缺失 / 非数字 / 非有限值返回 null）。 */
export function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** `JSON.parse` 的安全版本（失败返回 null，不抛异常）。 */
export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

/** 异常 → 可读的技术描述（不含 token）。 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

/** 截断上游文本，避免日志 / 错误信息过长。 */
export function trimSnippet(value: string, maxLength = 300): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact
}

/**
 * 异常 → `OneDriveError` 归一化。
 *
 * - 已是域内错误 → 原样透传；
 * - 本地超时已触发 → timeout；
 * - `AbortError` → aborted，`TimeoutError` → timeout；
 * - `TypeError`（fetch 连接失败）→ network；
 * - 其他 → `fallback`（默认 unknown）。
 */
export function normalizeError(
  error: unknown,
  options: { timedOut?: boolean; fallback?: OneDriveErrorCode } = {}
): OneDriveError {
  if (error instanceof OneDriveError) return error
  if (options.timedOut) {
    return new OneDriveError('timeout', { message: 'Request timed out', cause: error })
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new OneDriveError('aborted', { message: 'Request aborted', cause: error })
    }
    if (error.name === 'TimeoutError') {
      return new OneDriveError('timeout', { message: 'Request timed out', cause: error })
    }
    if (error instanceof TypeError) {
      return new OneDriveError('network', { message: describeError(error), cause: error })
    }
  }
  return new OneDriveError(options.fallback ?? 'unknown', {
    message: describeError(error),
    cause: error
  })
}

/** 可被 signal 中断的 sleep（中断时抛 `aborted`）。 */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return
  if (signal?.aborted) throw new OneDriveError('aborted', { message: 'Request aborted' })

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const onAbort = (): void => {
      cleanup()
      reject(new OneDriveError('aborted', { message: 'Request aborted' }))
    }

    const cleanup = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * 解析 `Retry-After` 响应头（秒数或 HTTP 日期），返回毫秒；无法解析返回 null。
 *
 * 结果裁剪到 1s - 60s，避免上游给出离谱值导致长时间挂起。
 */
export function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get('retry-after')
  if (!raw) return null

  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.max(1_000, Math.floor(seconds * 1000)))
  }

  const timestamp = Date.parse(raw)
  if (Number.isNaN(timestamp)) return null
  return Math.min(60_000, Math.max(1_000, timestamp - Date.now()))
}

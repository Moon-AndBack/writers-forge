import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError
} from 'openai'
import { getProviderConnection } from './config'
import type { AiProviderConnection } from './config'
import type { AiError, AiProviderId } from './types'

/**
 * OpenAI SDK 客户端封装与错误归一化。
 *
 * 设计要点：
 * - 不自动重试（`maxRetries: 0`）：避免 2 次默认重试把 60s 超时放大成数分钟；
 * - 统一使用 `AbortController`：外部 signal 与本地超时合并，取消即中断；
 * - 对外只抛 `AiFailure`（携带脱敏后的 `AiError`），绝不外泄上游响应体。
 */

/** 默认请求超时（毫秒）。 */
export const AI_DEFAULT_TIMEOUT_MS = 60_000

/** 最短超时下限，避免调用方传入 0 / 负数导致立即中断。 */
const MIN_TIMEOUT_MS = 1_000

/** 携带脱敏结构化错误的异常。 */
export class AiFailure extends Error {
  readonly aiError: AiError

  constructor(aiError: AiError) {
    super(aiError.message)
    this.name = 'AiFailure'
    this.aiError = aiError
  }
}

/** 归一化错误提示语（固定文案，不含上游原文）。 */
const ERROR_MESSAGES: Record<AiError['code'], string> = {
  network: '网络请求失败，请检查网络连接或 Base URL',
  timeout: '请求超时，请稍后重试',
  auth: '鉴权失败，请检查 API Key',
  rate_limit: '请求过于频繁或额度不足，请稍后重试',
  invalid_request: '请求参数无效，请检查模型与 Base URL',
  upstream: '上游服务返回错误',
  aborted: '请求已取消',
  unknown: 'AI 请求失败'
}

function createAiError(code: AiError['code'], status?: number): AiError {
  return status === undefined
    ? { code, message: ERROR_MESSAGES[code] }
    : { code, status, message: ERROR_MESSAGES[code] }
}

/** 将 HTTP 状态映射为错误码。 */
function codeFromStatus(status: number): AiError['code'] {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402 || status === 429) return 'rate_limit'
  if (status === 408) return 'timeout'
  if (status >= 500) return 'upstream'
  if (status >= 400) return 'invalid_request'
  return 'upstream'
}

/**
 * 按 HTTP 状态构造通用 `AiError`。
 *
 * 供不走 OpenAI SDK 的原生 `fetch` 分支（如 opencode 模型列表）复用，
 * 保证状态码 → 错误码的映射只有一处真源。
 */
export function aiErrorFromStatus(status: number): AiError {
  return createAiError(codeFromStatus(status), status)
}

/**
 * 异常 → `AiError` 归一化。
 *
 * 映射表（从上到下优先）：
 * - 本地超时已触发            → timeout
 * - `AiFailure`               → 原样透传
 * - `APIUserAbortError`       → aborted
 * - `APIConnectionTimeoutError` → timeout
 * - `APIConnectionError`      → network
 * - `APIError` + status       → 见 `codeFromStatus`
 * - `AbortError` / TimeoutError（原生）→ aborted / timeout
 * - `TypeError`（fetch 失败）  → network
 * - 其他                       → unknown
 */
export function toAiError(error: unknown, timedOut = false): AiError {
  if (timedOut) return createAiError('timeout')
  if (error instanceof AiFailure) return error.aiError

  if (error instanceof APIUserAbortError) return createAiError('aborted')
  if (error instanceof APIConnectionTimeoutError) return createAiError('timeout')
  if (error instanceof APIConnectionError) return createAiError('network')

  if (error instanceof APIError) {
    const status = typeof error.status === 'number' ? error.status : undefined
    return createAiError(codeFromStatus(status ?? 500), status)
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') return createAiError('aborted')
    if (error.name === 'TimeoutError') return createAiError('timeout')
    if (error instanceof TypeError) return createAiError('network')
  }

  return createAiError('unknown')
}

/** 把超时值规整到合理区间。 */
export function resolveTimeout(timeoutMs?: number): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) return AI_DEFAULT_TIMEOUT_MS
  return Math.max(MIN_TIMEOUT_MS, Math.floor(timeoutMs))
}

/** Base URL 规整：去空白、去尾部斜杠；空值视为无效。 */
export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/** 单次请求的取消上下文。 */
export interface RequestSignal {
  signal: AbortSignal
  /** 是否由本地超时触发（用于把 abort 归一化为 timeout）。 */
  timedOut: () => boolean
  /** 清理定时器与外部监听。 */
  dispose: () => void
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

/** 创建客户端的可选覆盖项（主要供服务商适配器自定义端点 / 请求头）。 */
export interface AiClientOptions {
  /** 覆盖 Base URL（必须是**最终** baseURL，例如已含 `/openai/v1`）。 */
  baseUrl?: string
  apiKey?: string | null
  timeoutMs?: number
  /** 附加请求头（如 opencode 的 `x-opencode-session`）。 */
  headers?: Record<string, string>
}

/** 客户端与本次请求的上下文。 */
export interface AiClientContext {
  client: OpenAI
  connection: AiProviderConnection
  timeoutMs: number
}

/**
 * 按服务商创建 OpenAI 兼容客户端。
 *
 * - 服务商差异（鉴权方式、baseURL 拼接、附加请求头）由适配器通过 `baseUrl` /
 *   `headers` 表达，本函数只负责组装 SDK 客户端；
 * - 密钥缺失时抛 `AiFailure { code: 'auth' }`。
 */
export function createAiClient(
  provider: AiProviderId,
  overrides: AiClientOptions = {}
): AiClientContext {
  const connection = getProviderConnection(provider)
  const apiKey = overrides.apiKey !== undefined ? overrides.apiKey : connection.apiKey
  if (!apiKey) {
    throw new AiFailure({ code: 'auth', message: '尚未配置 API Key' })
  }

  const timeoutMs = resolveTimeout(overrides.timeoutMs)
  const baseURL = normalizeBaseUrl(overrides.baseUrl ?? connection.baseUrl)
  if (!baseURL) {
    throw new AiFailure({ code: 'invalid_request', message: 'Base URL 不能为空' })
  }

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: timeoutMs,
    maxRetries: 0,
    ...(overrides.headers ? { defaultHeaders: overrides.headers } : {})
  })

  return { client, connection, timeoutMs }
}

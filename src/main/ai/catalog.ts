import { app } from 'electron'
import {
  AiFailure,
  aiErrorFromStatus,
  createRequestSignal,
  resolveTimeout,
  toAiError
} from './http'

/**
 * 模型目录拉取（OpenRouter 公共目录，无需密钥）。
 *
 * 设计要点：
 * - 目录只提供「模型 → 上下文窗口」能力元数据，不参与模型可用性判断；
 * - 网络请求只能发生在主进程（渲染层 CSP `connect-src 'self'`）；
 * - 失败统一抛 `AiFailure`，上层经 `toAiError` 归一，绝不外泄上游响应体。
 */

/** OpenRouter 公开模型目录端点。 */
const CATALOG_URL = 'https://openrouter.ai/api/v1/models'

/** 目录拉取默认超时（毫秒）：与设置页探测的超时语义保持一致。 */
const DEFAULT_CATALOG_TIMEOUT_MS = 15_000

/** 上下文窗口合理区间与条数上限：防止异常上游把缓存撑爆。 */
const MIN_CONTEXT_TOKENS = 1_024
const MAX_CONTEXT_TOKENS = 10_000_000
const MAX_CATALOG_ENTRIES = 1_000
const MAX_ID_CHARS = 200

/** 目录条目：`id` 为上游模型标识（如 `deepseek/deepseek-chat`）。 */
export interface CatalogEntry {
  id: string
  contextLength: number
}

/** 请求头 `User-Agent`：自报产品名 + 运行时版本（不硬编码版本号）。 */
function buildUserAgent(): string {
  try {
    return `Writer's Forge/${app.getVersion()}`
  } catch {
    // app 尚未初始化时退化为纯产品名，仍满足「不使用通用 SDK 名」的要求。
    return "Writer's Forge"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 有限数字且落在合理区间。 */
function isValidContextTokens(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_CONTEXT_TOKENS &&
    value <= MAX_CONTEXT_TOKENS
  )
}

/**
 * 读取单个模型的上下文窗口。
 *
 * 优先根级 `context_length`（模型自身标称的最大窗口），缺失或非法时再回退
 * `top_provider.context_length`（当前路由服务商支持的最大窗口，可能更小）。
 * 本目录用于「模型能力估算」，因此以模型自身标称值为准，服务商差异不作为主值。
 */
function readContextLength(item: Record<string, unknown>): number | null {
  if (isValidContextTokens(item.context_length)) return Math.round(item.context_length)
  if (isRecord(item.top_provider) && isValidContextTokens(item.top_provider.context_length)) {
    return Math.round(item.top_provider.context_length)
  }
  return null
}

/** 解析 `{ data: [{ id, context_length, top_provider? }] }`，去重、清洗并截断。 */
function collectEntries(payload: unknown): CatalogEntry[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []

  const entries: CatalogEntry[] = []
  const seen = new Set<string>()
  for (const item of payload.data) {
    if (!isRecord(item)) continue
    const rawId = item.id
    if (typeof rawId !== 'string') continue
    const id = rawId.trim()
    if (!id || id.length > MAX_ID_CHARS || seen.has(id)) continue

    const contextLength = readContextLength(item)
    if (contextLength === null) continue

    seen.add(id)
    entries.push({ id, contextLength })
    if (entries.length >= MAX_CATALOG_ENTRIES) break
  }
  return entries
}

/**
 * 拉取 OpenRouter 模型目录。
 *
 * 失败抛 `AiFailure`（携带脱敏 `AiError`）；空目录返回空数组，由上层决定是否写缓存。
 */
export async function fetchCatalog(
  options: {
    timeoutMs?: number
    signal?: AbortSignal
  } = {}
): Promise<CatalogEntry[]> {
  const timeoutMs = resolveTimeout(options.timeoutMs ?? DEFAULT_CATALOG_TIMEOUT_MS)
  const request = createRequestSignal(options.signal, timeoutMs)

  try {
    const response = await fetch(CATALOG_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': buildUserAgent()
      },
      signal: request.signal
    })

    if (!response.ok) {
      throw new AiFailure(aiErrorFromStatus(response.status))
    }

    return collectEntries((await response.json()) as unknown)
  } catch (error) {
    if (error instanceof AiFailure) throw error
    throw new AiFailure(toAiError(error, request.timedOut()))
  } finally {
    request.dispose()
  }
}

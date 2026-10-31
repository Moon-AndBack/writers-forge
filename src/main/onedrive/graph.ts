import {
  createRequestSignal,
  isRecord,
  normalizeError,
  readString,
  resolveTimeout
} from './http'
import { OneDriveError } from './types'
import type { OneDriveAccount, OneDriveErrorCode } from './types'

/**
 * Microsoft Graph 请求封装（鉴权头 / 超时 / 错误归一化 / 账户资料）。
 *
 * 上传策略见 `upload.ts`；本文件不涉及分片与重试。
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
/** 应用专属目录下的备份子目录。 */
const BACKUP_FOLDER = 'backups'

/** 单次 PUT 的大小上限（超过则走分片上传）。 */
export const SMALL_UPLOAD_LIMIT = 4 * 1024 * 1024
/** 上传请求超时（单分片 / 小文件）。 */
export const UPLOAD_TIMEOUT_MS = 120_000

/** `graphRequest` 参数。 */
export interface GraphRequestOptions {
  accessToken: string
  method?: string
  body?: string | Uint8Array<ArrayBuffer>
  headers?: Record<string, string>
  signal?: AbortSignal
  timeoutMs?: number
  /** 非 2xx 时的兜底错误码（未命中状态映射时使用）。 */
  fallback?: OneDriveErrorCode
}

/** Graph 鉴权参数。 */
export interface GraphAuthOptions {
  accessToken: string
  signal?: AbortSignal
  timeoutMs?: number
}

/** HTTP 状态 → 域内错误码。 */
function codeFromStatus(status: number, fallback: OneDriveErrorCode): OneDriveErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 408) return 'timeout'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'upstream'
  return fallback
}

/** 丢弃响应体，释放连接。 */
export async function drain(response: Response): Promise<void> {
  await response.arrayBuffer().catch(() => undefined)
}

/** 安全 JSON 解析（失败返回 null）。 */
function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

/** 读取 Graph 错误体并构造结构化错误。 */
export async function graphError(
  response: Response,
  fallback: OneDriveErrorCode = 'upstream'
): Promise<OneDriveError> {
  const text = await response.text().catch(() => '')
  const payload: unknown = text ? safeJson(text) : null
  const graphErrorBody = isRecord(payload) && isRecord(payload.error) ? payload.error : null
  const upstreamCode = graphErrorBody ? readString(graphErrorBody, 'code') : null
  const upstreamMessage = graphErrorBody ? readString(graphErrorBody, 'message') : null

  const base = `Graph request failed (HTTP ${response.status})`
  const message = upstreamMessage
    ? `${base}: ${upstreamCode ?? 'error'} - ${upstreamMessage}`
    : upstreamCode
      ? `${base}: ${upstreamCode}`
      : base

  return new OneDriveError(codeFromStatus(response.status, fallback), {
    status: response.status,
    message
  })
}

/**
 * 带 Authorization / 超时 / 错误映射的 Graph 请求。
 *
 * 注意：createUploadSession 返回的 `uploadUrl` 是**预授权**地址，
 * 后续分片 PUT 不得再附带 Authorization，因此上传模块走独立的 `fetch` 分支。
 */
export async function graphRequest(
  url: string,
  options: GraphRequestOptions
): Promise<Response> {
  const request = createRequestSignal(options.signal, resolveTimeout(options.timeoutMs))

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.accessToken}`,
      Accept: 'application/json',
      ...options.headers
    }

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: options.body } : {}),
      signal: request.signal
    })

    if (!response.ok) throw await graphError(response, options.fallback ?? 'upstream')
    return response
  } catch (error) {
    throw normalizeError(error, {
      timedOut: request.timedOut(),
      fallback: options.fallback ?? 'network'
    })
  } finally {
    request.dispose()
  }
}

/** 读取当前账户资料（用于界面展示邮箱）。 */
export async function getAccountProfile(
  options: GraphAuthOptions
): Promise<OneDriveAccount> {
  const response = await graphRequest(
    `${GRAPH_BASE}/me?$select=displayName,mail,userPrincipalName`,
    {
      accessToken: options.accessToken,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      fallback: 'upstream'
    }
  )

  const payload: unknown = await response.json().catch(() => null)
  if (!isRecord(payload)) {
    throw new OneDriveError('upstream', { message: 'Unexpected response from /me' })
  }

  const email = readString(payload, 'mail') ?? readString(payload, 'userPrincipalName')
  if (!email) {
    throw new OneDriveError('upstream', { message: 'The account profile has no email address' })
  }

  const displayName = readString(payload, 'displayName')
  return displayName ? { email, displayName } : { email }
}

/**
 * 确保应用专属目录下的 `backups/` 子目录存在。
 *
 * approot 由 Graph 首次访问时自动创建；`backups` 需显式创建，否则向不存在
 * 的目录路径 PUT 会返回 404。并发创建返回 409 视为成功。
 */
export async function ensureBackupFolder(options: GraphAuthOptions): Promise<void> {
  const request = {
    accessToken: options.accessToken,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    fallback: 'upload_failed' as const
  }

  try {
    await graphRequest(`${GRAPH_BASE}/me/drive/special/approot:/${BACKUP_FOLDER}`, request)
    return
  } catch (error) {
    if (!(error instanceof OneDriveError) || error.code !== 'not_found') throw error
  }

  try {
    await graphRequest(`${GRAPH_BASE}/me/drive/special/approot/children`, {
      ...request,
      method: 'POST',
      body: JSON.stringify({
        name: BACKUP_FOLDER,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail'
      }),
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    // 并发创建时另一个请求已建好目录，视为成功。
    if (error instanceof OneDriveError && error.status === 409) return
    throw error
  }
}

/** 构造 `…:/backups/<name>:/content` 地址。 */
export function contentUrl(fileName: string): string {
  return `${GRAPH_BASE}/me/drive/special/approot:/${BACKUP_FOLDER}/${encodeURIComponent(fileName)}:/content`
}

/** 构造 `…:/backups/<name>:/createUploadSession` 地址。 */
export function createSessionUrl(fileName: string): string {
  return `${GRAPH_BASE}/me/drive/special/approot:/${BACKUP_FOLDER}/${encodeURIComponent(fileName)}:/createUploadSession`
}

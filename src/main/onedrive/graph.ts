import { createRequestSignal, isRecord, normalizeError, readString, resolveTimeout } from './http'
import { OneDriveError } from './types'
import type { OneDriveAccount, OneDriveErrorCode } from './types'

/**
 * Microsoft Graph 请求封装（鉴权头 / 超时 / 错误归一化 / 账户资料）。
 *
 * 上传策略见 `upload.ts`；本文件不涉及分片与重试。
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

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

/** 读取 Graph 请求 ID：响应头优先，回退错误体的 `innerError`。 */
function readRequestId(
  response: Response,
  graphErrorBody: Record<string, unknown> | null
): string | null {
  const fromHeader = response.headers.get('request-id') ?? response.headers.get('client-request-id')
  if (fromHeader) return fromHeader

  const innerError = graphErrorBody ? graphErrorBody.innerError : null
  if (!isRecord(innerError)) return null
  return readString(innerError, 'request-id') ?? readString(innerError, 'client-request-id')
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

  // request-id 放在 message 前部，避免被日志截断（`safeError` 只保留前 200 字符）。
  const requestId = readRequestId(response, graphErrorBody)
  const base = `Graph request failed (HTTP ${response.status})${requestId ? ` [request-id=${requestId}]` : ''}`
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
export async function graphRequest(url: string, options: GraphRequestOptions): Promise<Response> {
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
export async function getAccountProfile(options: GraphAuthOptions): Promise<OneDriveAccount> {
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

/** 构造 app folder 根路径本体（`GET` 用于探测文件夹是否已 provision）。 */
export function appRootUrl(): string {
  return `${GRAPH_BASE}/me/drive/special/approot`
}

/** 构造 app folder 根路径下 `<name>` 的 content 地址。 */
export function contentUrl(fileName: string): string {
  return `${GRAPH_BASE}/me/drive/special/approot:/${encodeURIComponent(fileName)}:/content`
}

/**
 * 构造 app folder 根路径的子项列表地址（`$top` 为单页上限，Graph 默认 200）。
 *
 * 注意：special 文件夹列子项用 `/approot/children`（文档「Get Special Folders」写法）；
 * 冒号仅用于路径寻址（`:/{path}:/children`、`:/{path}:/content`），不能用于根路径列子项。
 */
export function backupChildrenUrl(top = 200): string {
  const select = 'id,name,size,createdDateTime,lastModifiedDateTime,file,folder,webUrl'
  return `${GRAPH_BASE}/me/drive/special/approot/children?$select=${select}&$top=${top}`
}

/** 构造单个 driveItem 的资源地址（删除 / 元信息共用；`itemId` 由 Graph 返回）。 */
export function itemUrl(itemId: string): string {
  return `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}`
}

/** 构造单个 driveItem 的元信息地址（含预签名 `@microsoft.graph.downloadUrl`）。 */
export function itemDownloadUrl(itemId: string): string {
  return `${itemUrl(itemId)}?$select=id,size,@microsoft.graph.downloadUrl`
}

/** 构造 app folder 根路径下 `<name>` 的 createUploadSession 地址。 */
export function createSessionUrl(fileName: string): string {
  return `${GRAPH_BASE}/me/drive/special/approot:/${encodeURIComponent(fileName)}:/createUploadSession`
}

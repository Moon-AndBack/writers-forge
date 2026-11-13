import { open, readFile, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename } from 'node:path'
import { logger } from '../logger'
import {
  SMALL_UPLOAD_LIMIT,
  UPLOAD_TIMEOUT_MS,
  contentUrl,
  createSessionUrl,
  drain,
  ensureBackupFolder,
  graphError,
  graphRequest
} from './graph'
import {
  createRequestSignal,
  describeError,
  isRecord,
  normalizeError,
  readNumber,
  readString,
  resolveTimeout,
  retryDelayMs,
  sleep
} from './http'
import { safeError, safePath } from './logSafe'
import { OneDriveError } from './types'
import type { OneDriveUploadedFile, OneDriveUploadProgress } from './types'

/**
 * 备份文件上传策略（应用专属目录 `backups/`）。
 *
 * - ≤ 4MB：单次 `PUT …:/content`；
 * - > 4MB：`createUploadSession` + 分片 `PUT`（10MB 的整数倍、最大 60MB）；
 *   429 / 5xx / 网络抖动按 `Retry-After` 或指数退避重试；416 时向会话查询
 *   下一偏移继续；失败 / 取消时 `DELETE` 会话，避免残留。
 */

const log = logger.scope('onedrive:upload')

/** 分片单位：10MB（Graph 要求 320KiB 的整数倍，10MB 满足）。 */
const CHUNK_UNIT = 10 * 1024 * 1024
/** 单分片上限：60MB。 */
const MAX_CHUNK_SIZE = 60 * 1024 * 1024
/** 单分片最多尝试次数（含首次）。 */
const MAX_CHUNK_ATTEMPTS = 4

/** 分片上传结果：继续下一片，或整单完成。 */
type ChunkResult = { kind: 'next'; nextOffset: number } | { kind: 'complete'; item: unknown }

/** `uploadFile` 参数。 */
export interface UploadFileOptions {
  accessToken: string
  /** 远端文件名（缺省取本地文件名）。 */
  fileName?: string
  signal?: AbortSignal
  /** 分片进度回调（小文件在上传完成后回调一次）。 */
  onProgress?: (progress: OneDriveUploadProgress) => void
  /** 单次请求超时（默认小文件 / 单分片 120s）。 */
  timeoutMs?: number
}

/** 解析上传响应为统一的文件信息。 */
function parseUploadedFile(
  payload: unknown,
  fallbackName: string,
  fallbackSize: number
): OneDriveUploadedFile {
  if (!isRecord(payload)) {
    return { id: null, name: fallbackName, size: fallbackSize, webUrl: null }
  }
  return {
    id: readString(payload, 'id'),
    name: readString(payload, 'name') ?? fallbackName,
    size: readNumber(payload, 'size') ?? fallbackSize,
    webUrl: readString(payload, 'webUrl')
  }
}

/** 上报上传进度（回调异常不打断上传）。 */
function reportProgress(
  listener: ((progress: OneDriveUploadProgress) => void) | undefined,
  bytesSent: number,
  totalBytes: number
): void {
  if (!listener) return
  const percent = totalBytes > 0 ? Math.min(100, Math.floor((bytesSent / totalBytes) * 100)) : 0
  try {
    listener({ bytesSent, totalBytes, percent })
  } catch (error) {
    log.warn('OneDrive 上传进度回调异常', { error: safeError(error) })
  }
}

/**
 * 计算分片大小：10MB 的整数倍，最大 60MB。
 *
 * 以「约 10 片」为目标放大分片，避免超大数据库产生过多请求。
 */
function resolveChunkSize(totalBytes: number): number {
  const units = Math.min(
    MAX_CHUNK_SIZE / CHUNK_UNIT,
    Math.max(1, Math.ceil(totalBytes / (CHUNK_UNIT * 10)))
  )
  return CHUNK_UNIT * units
}

/** 解析 `nextExpectedRanges: ["<start>-<end>"]` 的起始偏移。 */
function parseNextOffset(payload: unknown, fallback: number): number {
  if (!isRecord(payload) || !Array.isArray(payload.nextExpectedRanges)) return fallback
  const first = payload.nextExpectedRanges[0]
  if (typeof first !== 'string') return fallback
  const start = Number.parseInt(first.split('-')[0] ?? '', 10)
  return Number.isFinite(start) && start >= 0 ? start : fallback
}

/** 会话状态：服务端还有待传区间、已传完、或无法判定。 */
type SessionState =
  { kind: 'next'; nextOffset: number } | { kind: 'complete'; item: unknown } | { kind: 'unknown' }

/** 向会话查询当前状态（用于 416 偏移纠偏与完成后补取 driveItem）。 */
async function resolveSessionState(uploadUrl: string, signal?: AbortSignal): Promise<SessionState> {
  try {
    const response = await fetch(uploadUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal
    })
    if (!response.ok) {
      await drain(response)
      return { kind: 'unknown' }
    }
    const payload: unknown = await response.json().catch(() => null)
    if (isRecord(payload) && !Array.isArray(payload.nextExpectedRanges)) {
      return { kind: 'complete', item: payload }
    }
    const next = parseNextOffset(payload, -1)
    return next >= 0 ? { kind: 'next', nextOffset: next } : { kind: 'unknown' }
  } catch (error) {
    if (signal?.aborted) throw normalizeError(error, { fallback: 'aborted' })
    return { kind: 'unknown' }
  }
}

/**
 * 上传单个分片（含重试）。
 *
 * - 202 → 返回服务端给出的下一偏移；
 * - 200 / 201 → 整单完成并返回 driveItem；
 * - 416 → 查询会话下一偏移后继续（服务端已收到部分数据）；
 * - 429 / 5xx / 网络错误 → 退避重试；
 * - 其他 4xx → 直接抛错（不重试）。
 */
async function putChunk(
  uploadUrl: string,
  body: Uint8Array<ArrayBuffer>,
  offset: number,
  totalBytes: number,
  options: UploadFileOptions
): Promise<ChunkResult> {
  const end = offset + body.byteLength - 1
  const timeoutMs = resolveTimeout(options.timeoutMs, UPLOAD_TIMEOUT_MS)

  for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt += 1) {
    const request = createRequestSignal(options.signal, timeoutMs)
    let response: Response | null = null
    let failure: OneDriveError | null = null

    try {
      response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${offset}-${end}/${totalBytes}`
        },
        body,
        signal: request.signal
      })
    } catch (error) {
      failure = normalizeError(error, { timedOut: request.timedOut(), fallback: 'network' })
    } finally {
      request.dispose()
    }

    if (failure) {
      if (failure.code === 'aborted' || attempt >= MAX_CHUNK_ATTEMPTS) throw failure
      log.warn('OneDrive 分片上传网络失败，准备重试', {
        offset,
        attempt,
        code: failure.code
      })
      await sleep(retryDelayMs(null, attempt), options.signal)
      continue
    }
    if (!response) {
      throw new OneDriveError('upload_failed', { message: 'Upload request produced no response' })
    }

    if (response.status === 416) {
      await drain(response)
      const state = await resolveSessionState(uploadUrl, options.signal)
      if (state.kind === 'complete') return { kind: 'complete', item: state.item }
      if (state.kind === 'unknown') {
        throw new OneDriveError('upload_failed', {
          status: 416,
          message: 'Upload session has no pending ranges'
        })
      }
      if (state.nextOffset === offset) {
        throw new OneDriveError('upload_failed', {
          status: 416,
          message: 'Upload session rejected the current range without advancing'
        })
      }
      return { kind: 'next', nextOffset: state.nextOffset }
    }

    if (response.status === 429 || response.status >= 500) {
      const delay = retryDelayMs(response.headers, attempt)
      await drain(response)
      if (attempt >= MAX_CHUNK_ATTEMPTS) {
        throw new OneDriveError(response.status === 429 ? 'rate_limited' : 'upstream', {
          status: response.status,
          message: `Upload chunk failed after ${attempt} attempts (HTTP ${response.status})`
        })
      }
      log.warn('OneDrive 分片上传被上游拒绝，准备重试', {
        offset,
        attempt,
        status: response.status,
        delayMs: delay
      })
      await sleep(delay, options.signal)
      continue
    }

    if (response.status === 200 || response.status === 201) {
      const payload: unknown = await response.json().catch(() => null)
      return { kind: 'complete', item: payload }
    }

    if (response.status === 202) {
      const payload: unknown = await response.json().catch(() => null)
      const nextOffset = parseNextOffset(payload, offset + body.byteLength)
      if (nextOffset <= offset) {
        throw new OneDriveError('upload_failed', {
          status: 202,
          message: 'Upload session did not advance to a new range'
        })
      }
      return { kind: 'next', nextOffset }
    }

    throw await graphError(response, 'upload_failed')
  }

  throw new OneDriveError('upload_failed', { message: 'Upload chunk retries exhausted' })
}

/** 取消上传会话（best-effort，固定 5s 超时，不受外部 signal 影响）。 */
async function cancelUploadSession(uploadUrl: string): Promise<void> {
  try {
    await fetch(uploadUrl, { method: 'DELETE', signal: AbortSignal.timeout(5_000) })
    log.info('OneDrive 上传会话已取消')
  } catch (error) {
    log.warn('取消 OneDrive 上传会话失败', { error: safeError(error) })
  }
}

/** 小文件：单次 PUT。 */
async function uploadFileSmall(
  filePath: string,
  fileName: string,
  totalBytes: number,
  options: UploadFileOptions
): Promise<OneDriveUploadedFile> {
  let data: Buffer
  try {
    data = await readFile(filePath)
  } catch (error) {
    throw new OneDriveError('upload_failed', {
      message: `Failed to read the backup file: ${describeError(error)}`,
      cause: error
    })
  }

  // 复制到以 ArrayBuffer 为底的视图，保证与 fetch 的 BodyInit 类型兼容。
  const body = new Uint8Array(data.byteLength)
  body.set(data)

  const response = await graphRequest(contentUrl(fileName), {
    accessToken: options.accessToken,
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'application/octet-stream' },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? UPLOAD_TIMEOUT_MS,
    fallback: 'upload_failed'
  })

  const payload: unknown = await response.json().catch(() => null)
  reportProgress(options.onProgress, totalBytes, totalBytes)
  return parseUploadedFile(payload, fileName, totalBytes)
}

/** 大文件：createUploadSession + 分片 PUT。 */
async function uploadFileSession(
  filePath: string,
  fileName: string,
  totalBytes: number,
  options: UploadFileOptions
): Promise<OneDriveUploadedFile> {
  const sessionResponse = await graphRequest(createSessionUrl(fileName), {
    accessToken: options.accessToken,
    method: 'POST',
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    fallback: 'upload_failed'
  })

  const sessionPayload: unknown = await sessionResponse.json().catch(() => null)
  const uploadUrl = isRecord(sessionPayload) ? readString(sessionPayload, 'uploadUrl') : null
  if (!uploadUrl) {
    throw new OneDriveError('upload_failed', {
      message: 'Upload session response is missing uploadUrl'
    })
  }

  const chunkSize = resolveChunkSize(totalBytes)
  let handle: FileHandle
  try {
    handle = await open(filePath, 'r')
  } catch (error) {
    throw new OneDriveError('upload_failed', {
      message: `Failed to open the backup file: ${describeError(error)}`,
      cause: error
    })
  }

  let offset = 0
  let finalItem: unknown = null

  try {
    while (offset < totalBytes) {
      const length = Math.min(chunkSize, totalBytes - offset)
      const buffer = new Uint8Array(length)
      const { bytesRead } = await handle.read(buffer, 0, length, offset)
      if (bytesRead <= 0) {
        throw new OneDriveError('upload_failed', {
          message: 'Unexpected end of file while uploading the backup'
        })
      }

      const body = bytesRead === length ? buffer : buffer.subarray(0, bytesRead)
      const result = await putChunk(uploadUrl, body, offset, totalBytes, options)

      if (result.kind === 'complete') {
        finalItem = result.item
        offset = totalBytes
      } else {
        offset = result.nextOffset
      }

      reportProgress(options.onProgress, Math.min(offset, totalBytes), totalBytes)
    }
  } catch (error) {
    await cancelUploadSession(uploadUrl)
    throw normalizeError(error, { fallback: 'upload_failed' })
  } finally {
    await handle.close().catch(() => undefined)
  }

  if (finalItem === null) {
    const state = await resolveSessionState(uploadUrl, options.signal)
    if (state.kind === 'complete') finalItem = state.item
  }

  return parseUploadedFile(finalItem, fileName, totalBytes)
}

/**
 * 上传本地文件到应用专属目录下的 `backups/`。
 *
 * 按文件大小自动选择单次 PUT（≤ 4MB）或分片上传（> 4MB）。
 */
export async function uploadFile(
  filePath: string,
  options: UploadFileOptions
): Promise<OneDriveUploadedFile> {
  let totalBytes: number
  try {
    totalBytes = (await stat(filePath)).size
  } catch (error) {
    throw new OneDriveError('upload_failed', {
      message: `Failed to stat the backup file: ${describeError(error)}`,
      cause: error
    })
  }

  // 显式 fileName 只取 basename（防御调用方传绝对路径 / 子目录），
  // 缺省或非字符串时回退本地文件名，保持既有默认命名不变。
  const explicitName = typeof options.fileName === 'string' ? basename(options.fileName).trim() : ''
  const fileName = (explicitName || basename(filePath)).trim()
  if (!fileName) {
    throw new OneDriveError('upload_failed', { message: 'Backup file name is empty' })
  }

  log.info('开始上传 OneDrive 备份', {
    fileName: safePath(fileName),
    totalBytes,
    strategy: totalBytes > SMALL_UPLOAD_LIMIT ? 'session' : 'single-put'
  })

  await ensureBackupFolder({
    accessToken: options.accessToken,
    signal: options.signal,
    timeoutMs: options.timeoutMs
  })

  const uploaded =
    totalBytes > SMALL_UPLOAD_LIMIT
      ? await uploadFileSession(filePath, fileName, totalBytes, options)
      : await uploadFileSmall(filePath, fileName, totalBytes, options)

  log.info('OneDrive 备份上传完成', {
    fileName: safePath(uploaded.name),
    size: uploaded.size,
    driveItemId: uploaded.id
  })
  return uploaded
}

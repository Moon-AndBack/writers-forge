import { open, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { logger } from '../logger'
import { getValidAccessToken } from './auth'
import { graphError, graphRequest, itemDownloadUrl } from './graph'
import {
  createRequestSignal,
  isRecord,
  normalizeError,
  readNumber,
  readString,
  retryDelayMs,
  sleep
} from './http'
import { safeError, safePath } from './logSafe'
import { OneDriveError } from './types'
import type { OneDriveDownloadProgress } from './types'

/**
 * 远端备份下载（Range 分块）。
 *
 * 关键点：
 * - 元信息请求走 `graphRequest`（带 Authorization），拿到预签名
 *   `@microsoft.graph.downloadUrl` 与总大小；
 * - 分块请求只打预签名 URL，附加 `Range`，**不得**再带 Authorization；
 *   预签名 URL 有效期只有几分钟，401 / 403 视为过期并重新获取后从当前偏移续传；
 * - 每块独立 120s 超时 + 最多 4 次尝试；网络 / 超时 / 限流 / 5xx 退避重试；
 * - 顺序写盘，成功后 `fsync`；取消或失败删除半成品文件。
 */

const log = logger.scope('onedrive:download')

/** 分块大小：8MB。 */
export const DOWNLOAD_CHUNK_SIZE = 8 * 1024 * 1024
/** 单块超时：120s。 */
const CHUNK_TIMEOUT_MS = 120_000
/** 单块最多尝试次数（含首次）。 */
const MAX_CHUNK_ATTEMPTS = 4
/** 预签名 URL 最多重取次数。 */
const MAX_URL_REFRESH = 2
/** 元信息请求超时。 */
const INFO_TIMEOUT_MS = 60_000

/** `downloadRemoteBackup` 选项。 */
export interface DownloadRemoteBackupOptions {
  /** Graph driveItem id。 */
  itemId: string
  /** 下载落盘路径（父目录须已存在）。 */
  destPath: string
  signal?: AbortSignal
  onProgress?: (progress: OneDriveDownloadProgress) => void
}

/** 预签名下载地址与文件总大小。 */
interface DownloadInfo {
  url: string
  totalBytes: number
}

/** 上报下载进度（回调异常不打断下载）。 */
function reportProgress(
  listener: ((progress: OneDriveDownloadProgress) => void) | undefined,
  bytesReceived: number,
  totalBytes: number
): void {
  if (!listener) return
  const percent = totalBytes > 0 ? Math.min(100, Math.floor((bytesReceived / totalBytes) * 100)) : 0
  try {
    listener({ bytesReceived, totalBytes, percent })
  } catch (error) {
    log.warn('OneDrive 下载进度回调异常', { error: safeError(error) })
  }
}

/** 读取预签名下载地址；404 归一化为 `remote_not_found`。 */
async function fetchDownloadInfo(
  itemId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<DownloadInfo> {
  let response: Response
  try {
    response = await graphRequest(itemDownloadUrl(itemId), {
      accessToken,
      signal,
      timeoutMs: INFO_TIMEOUT_MS,
      fallback: 'download_failed'
    })
  } catch (error) {
    const normalized = normalizeError(error, { fallback: 'download_failed' })
    if (normalized.code === 'not_found') {
      throw new OneDriveError('remote_not_found', {
        status: normalized.status,
        message: 'The remote backup no longer exists',
        cause: normalized
      })
    }
    throw normalized
  }

  const payload: unknown = await response.json().catch(() => null)
  const url = isRecord(payload) ? readString(payload, '@microsoft.graph.downloadUrl') : null
  const totalBytes = isRecord(payload) ? readNumber(payload, 'size') : null
  if (!url || totalBytes === null || totalBytes <= 0) {
    throw new OneDriveError('download_failed', {
      message: 'Download info is missing the URL or file size'
    })
  }
  return { url, totalBytes }
}

/** 完整写入一段数据（处理短写）。 */
async function writeFully(handle: FileHandle, data: Uint8Array, position: number): Promise<void> {
  let written = 0
  while (written < data.byteLength) {
    const { bytesWritten } = await handle.write(
      data,
      written,
      data.byteLength - written,
      position + written
    )
    if (bytesWritten <= 0) {
      throw new OneDriveError('download_failed', {
        message: 'Failed to write the downloaded backup'
      })
    }
    written += bytesWritten
  }
}

/** 把响应体流式写入文件，返回写入字节数。 */
async function writeChunk(
  handle: FileHandle,
  response: Response,
  startOffset: number,
  maxBytes: number,
  totalBytes: number,
  onProgress: ((progress: OneDriveDownloadProgress) => void) | undefined
): Promise<number> {
  const report = (written: number): void => {
    reportProgress(onProgress, startOffset + written, totalBytes)
  }

  const body = response.body
  if (!body) {
    const data = new Uint8Array(await response.arrayBuffer())
    const slice = data.subarray(0, Math.min(data.byteLength, maxBytes))
    await writeFully(handle, slice, startOffset)
    report(slice.byteLength)
    return slice.byteLength
  }

  const reader = body.getReader()
  let written = 0
  try {
    while (written < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue
      const remaining = maxBytes - written
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value
      await writeFully(handle, slice, startOffset + written)
      written += slice.byteLength
      report(written)
    }
  } finally {
    // 防御上游忽略 Range 返回超长响应：写满当前块后主动断开，避免继续占带宽。
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  return written
}

/**
 * 下载远端备份到 `destPath`。
 *
 * 返回实际写入字节数；失败 / 取消会删除半成品文件并抛 `OneDriveError`。
 */
export async function downloadRemoteBackup(
  options: DownloadRemoteBackupOptions
): Promise<{ sizeBytes: number }> {
  const { itemId, destPath, signal, onProgress } = options
  if (signal?.aborted) {
    throw new OneDriveError('aborted', { message: 'Request aborted' })
  }

  let accessToken = await getValidAccessToken({ signal })
  let info = await fetchDownloadInfo(itemId, accessToken, signal)
  let urlRefreshCount = 0

  let handle: FileHandle | null = null
  let succeeded = false

  log.info('开始下载 OneDrive 备份', {
    itemId,
    destPath: safePath(destPath),
    totalBytes: info.totalBytes
  })

  try {
    handle = await open(destPath, 'w')
    let offset = 0
    reportProgress(onProgress, 0, info.totalBytes)

    while (offset < info.totalBytes) {
      const end = Math.min(offset + DOWNLOAD_CHUNK_SIZE, info.totalBytes) - 1
      let progressed = false
      let attempt = 1

      while (attempt <= MAX_CHUNK_ATTEMPTS && !progressed) {
        const request = createRequestSignal(signal, CHUNK_TIMEOUT_MS)
        let failure: OneDriveError | null = null
        let refreshed = false
        let retryHeaders: Headers | null = null

        try {
          const response = await fetch(info.url, {
            method: 'GET',
            headers: { Range: `bytes=${offset}-${end}` },
            signal: request.signal
          })

          if (response.status === 401 || response.status === 403) {
            // 预签名 URL 过期：重取元信息后从当前偏移继续，不消耗退避次数。
            await response.arrayBuffer().catch(() => undefined)
            if (urlRefreshCount >= MAX_URL_REFRESH) {
              throw new OneDriveError(response.status === 401 ? 'unauthorized' : 'forbidden', {
                status: response.status,
                message: `Download URL expired and could not be refreshed (HTTP ${response.status})`
              })
            }
            urlRefreshCount += 1
            // 401 / 403 也可能由 access token 失效引起，重取元信息前强制刷新一次。
            accessToken = await getValidAccessToken({ forceRefresh: true, signal })
            info = await fetchDownloadInfo(itemId, accessToken, signal)
            refreshed = true
          } else if (response.status === 408 || response.status === 429 || response.status >= 500) {
            retryHeaders = response.headers
            await response.arrayBuffer().catch(() => undefined)
            throw new OneDriveError(
              response.status === 429
                ? 'rate_limited'
                : response.status >= 500
                  ? 'upstream'
                  : 'timeout',
              {
                status: response.status,
                message: `Download chunk failed (HTTP ${response.status})`
              }
            )
          } else if (!response.ok) {
            throw await graphError(response, 'download_failed')
          } else if (response.status === 200 && offset > 0) {
            await response.arrayBuffer().catch(() => undefined)
            throw new OneDriveError('download_failed', {
              status: 200,
              message: 'Download URL ignored the Range header'
            })
          } else {
            const maxBytes = info.totalBytes - offset
            const written = await writeChunk(
              handle,
              response,
              offset,
              maxBytes,
              info.totalBytes,
              onProgress
            )
            if (written <= 0) {
              throw new OneDriveError('download_failed', {
                message: 'Download returned an empty response body'
              })
            }
            offset += written
            progressed = true
          }
        } catch (error) {
          failure = normalizeError(error, {
            timedOut: request.timedOut(),
            fallback: 'download_failed'
          })
        } finally {
          request.dispose()
        }

        if (progressed) break
        if (refreshed) continue

        const error =
          failure ??
          new OneDriveError('download_failed', {
            message: 'Download chunk produced no response'
          })
        if (error.code === 'aborted') throw error
        if (!error.retryable || attempt >= MAX_CHUNK_ATTEMPTS) throw error

        const delay = retryDelayMs(retryHeaders, attempt)
        log.warn('OneDrive 备份下载分块失败，准备重试', {
          offset,
          attempt,
          code: error.code,
          delayMs: delay
        })
        await sleep(delay, signal)
        attempt += 1
      }

      if (!progressed) {
        throw new OneDriveError('download_failed', {
          message: 'Download chunk retries exhausted'
        })
      }
    }

    await handle.sync()
    succeeded = true
    log.info('OneDrive 备份下载完成', { destPath: safePath(destPath), sizeBytes: offset })
    return { sizeBytes: offset }
  } catch (error) {
    throw normalizeError(error, { fallback: 'download_failed' })
  } finally {
    if (handle) {
      await handle.close().catch((error: unknown) => {
        log.warn('关闭下载文件失败', { error: safeError(error) })
      })
    }
    if (!succeeded) {
      // 取消 / 失败：删除半成品，避免被后续恢复流程误用。
      await rm(destPath, { force: true }).catch(() => undefined)
    }
  }
}

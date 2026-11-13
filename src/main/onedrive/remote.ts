import { logger } from '../logger'
import { getValidAccessToken } from './auth'
import { appRootUrl, backupChildrenUrl, drain, graphRequest } from './graph'
import { isRecord, readNumber, readString } from './http'
import { OneDriveError } from './types'
import type { RemoteBackupItem } from './types'

/**
 * 远端备份列表（app folder 根路径）。
 *
 * - 跟随 `@odata.nextLink` 分页，最多 20 页（防上游异常导致死循环）；
 * - 列表 404 时再探测 approot 本体：本体也 404 才算空列表（首次访问 special
 *   命名空间前尚未 provision）；本体存在则视为路径 / 权限异常并抛 `list_failed`；
 * - 只保留带 `file` facet 且文件名符合 `writers-forge-<YYYYMMDD-HHmmss>.db`
 *   的项，避免把目录 / 用户手动放入的其它文件当成可恢复备份；
 * - 按 `lastModifiedDateTime` 倒序返回。
 */

const log = logger.scope('onedrive:remote')

/** 单页上限（Graph 默认 200；与分页上限配合防死循环）。 */
const PAGE_SIZE = 200

/** 分页上限（防御性，Graph 单页 200 项已足够）。 */
const MAX_PAGES = 20

/** 远端备份文件名（与 `backup/snapshot` 的命名保持一致）。 */
const REMOTE_FILE_PATTERN = /^writers-forge-\d{8}-\d{6}\.db$/

/** `listRemoteBackups` 选项。 */
export interface ListRemoteBackupsOptions {
  signal?: AbortSignal
}

/** 解析单个 driveItem；非文件 / 非备份命名 / 字段缺失返回 null。 */
function parseRemoteItem(value: unknown): RemoteBackupItem | null {
  if (!isRecord(value) || !isRecord(value.file)) return null

  const itemId = readString(value, 'id')
  const name = readString(value, 'name')
  const modifiedAt =
    readString(value, 'lastModifiedDateTime') ?? readString(value, 'createdDateTime')
  if (!itemId || !name || !modifiedAt) return null
  if (!REMOTE_FILE_PATTERN.test(name)) return null

  const sizeBytes = readNumber(value, 'size') ?? 0
  const webUrl = readString(value, 'webUrl')
  return {
    itemId,
    name,
    sizeBytes,
    modifiedAt,
    ...(webUrl ? { webUrl } : {})
  }
}

/** 解析 `@odata.nextLink`（最后一页为 null）。 */
function readNextLink(payload: unknown): string | null {
  return isRecord(payload) ? readString(payload, '@odata.nextLink') : null
}

/** 读取 `value` 数组（字段缺失视为空页）。 */
function readPageItems(payload: unknown): unknown[] {
  if (!isRecord(payload) || !Array.isArray(payload.value)) return []
  return payload.value
}

/** ISO 时间 → 毫秒（非法值按 0 处理，保证排序稳定）。 */
function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * 列出远端备份（按修改时间倒序）。
 *
 * 列表 404 时探测 approot 本体做区分：本体也 404 → 空数组；本体存在 →
 * `list_failed`（路径 / 权限异常）；探测本身非 404 失败则原样上抛。
 * 401 / 403 与其它 HTTP 失败由 `graphRequest` 归一化为域内错误码抛出。
 */
export async function listRemoteBackups(
  options: ListRemoteBackupsOptions = {}
): Promise<RemoteBackupItem[]> {
  const accessToken = await getValidAccessToken({ signal: options.signal })
  const items: RemoteBackupItem[] = []
  let url: string | null = backupChildrenUrl(PAGE_SIZE)
  let page = 0

  while (url !== null && page < MAX_PAGES) {
    page += 1

    let payload: unknown
    try {
      const response = await graphRequest(url, {
        accessToken,
        signal: options.signal,
        fallback: 'list_failed'
      })
      payload = await response.json().catch(() => null)
    } catch (error) {
      if (error instanceof OneDriveError && error.code === 'not_found') {
        // 再探一次 approot 本体：区分「首次使用（真没有）」与「children 路径异常」。
        // 若 approot 本体也存在但 children 404，说明路径或权限异常，必须报错而不是假装空列表。
        try {
          const probe = await graphRequest(appRootUrl(), {
            accessToken,
            signal: options.signal,
            fallback: 'list_failed'
          })
          await drain(probe)
        } catch (probeError) {
          if (probeError instanceof OneDriveError && probeError.code === 'not_found') {
            log.info('OneDrive 尚未创建 app folder，返回空列表')
            return []
          }
          throw probeError
        }

        log.warn('OneDrive app folder 本体存在，但子项列表返回 404，疑似路径或权限异常', {
          status: error.status ?? 404
        })
        throw new OneDriveError('list_failed', {
          status: error.status ?? 404,
          message: 'OneDrive app folder exists but listing its children returned 404'
        })
      }
      throw error
    }

    if (!isRecord(payload)) {
      throw new OneDriveError('list_failed', {
        message: 'Unexpected response while listing remote backups'
      })
    }

    for (const value of readPageItems(payload)) {
      const item = parseRemoteItem(value)
      if (item) items.push(item)
    }

    url = readNextLink(payload)
  }

  if (url !== null) {
    log.warn('OneDrive 备份列表分页达到上限，返回已获取部分', {
      pages: page,
      count: items.length
    })
  }

  items.sort((a, b) => timestamp(b.modifiedAt) - timestamp(a.modifiedAt))
  log.info('OneDrive 远端备份列表读取完成', {
    pages: page,
    count: items.length,
    pageSize: PAGE_SIZE
  })
  return items
}

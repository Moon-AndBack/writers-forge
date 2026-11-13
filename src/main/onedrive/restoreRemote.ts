import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatTimestamp, removeFileQuietly, restoreDatabase, verifyDatabaseFile } from '../backup'
import type { BackupRestoreResult } from '../backup'
import { logger } from '../logger'
import { downloadRemoteBackup } from './download'
import { safeError, safePath } from './logSafe'
import type { OneDriveRestoreProgress, OneDriveRestoreProgressListener } from './types'

/**
 * 从 OneDrive 备份恢复整个数据库。
 *
 * 编排：
 * 1. 下载到系统临时目录（`writers-forge-restore/`，文件名前缀 `onedrive-restore-`）；
 * 2. 只读校验（复用 `verifyDatabaseFile`：后缀 / quick_check / 核心表）；
 * 3. 调用 `restoreDatabase`（其内部自行占用本地任务锁，故下载阶段**不得**占锁）；
 * 4. 无论成功失败，`finally` 删除临时文件。
 *
 * 临时文件名刻意避开 `writers-forge-` 前缀：`backup/snapshot` 的遗留清理会按该前缀
 * 删除超过 6 小时的 `.db`，复用前缀会让下载中的临时库被误清。
 */

const log = logger.scope('onedrive:restore')

/** 临时恢复目录名（位于系统临时目录下）。 */
const RESTORE_DIR_NAME = 'writers-forge-restore'
/** 临时恢复文件前缀（不得使用 `writers-forge-`，见文件头说明）。 */
const RESTORE_FILE_PREFIX = 'onedrive-restore-'

/** `restoreRemoteBackup` 选项。 */
export interface RestoreRemoteBackupOptions {
  /** Graph driveItem id。 */
  itemId: string
  /** 远端文件名（仅用于日志）。 */
  name?: string
  signal?: AbortSignal
  onProgress?: OneDriveRestoreProgressListener
}

/** 上报恢复进度（回调异常不打断恢复）。 */
function reportProgress(
  listener: OneDriveRestoreProgressListener | undefined,
  progress: OneDriveRestoreProgress
): void {
  if (!listener) return
  try {
    listener(progress)
  } catch (error) {
    log.warn('OneDrive 恢复进度回调异常', { error: safeError(error) })
  }
}

/**
 * 下载并恢复远端备份。
 *
 * 下载 / 校验失败返回结构化错误或抛出 `OneDriveError`；数据库替换阶段由
 * `restoreDatabase` 返回 `BackupRestoreResult`。成功重启由 IPC 层安排。
 */
export async function restoreRemoteBackup(
  options: RestoreRemoteBackupOptions
): Promise<BackupRestoreResult> {
  const directory = join(app.getPath('temp'), RESTORE_DIR_NAME)
  mkdirSync(directory, { recursive: true })
  const tempPath = join(directory, `${RESTORE_FILE_PREFIX}${formatTimestamp(new Date())}.db`)

  log.info('开始恢复 OneDrive 备份', {
    itemId: options.itemId,
    name: options.name,
    filePath: safePath(tempPath)
  })

  try {
    reportProgress(options.onProgress, {
      phase: 'download',
      bytesReceived: 0,
      totalBytes: 0,
      percent: 0
    })

    const downloaded = await downloadRemoteBackup({
      itemId: options.itemId,
      destPath: tempPath,
      signal: options.signal,
      onProgress: (progress) =>
        reportProgress(options.onProgress, {
          phase: 'download',
          bytesReceived: progress.bytesReceived,
          totalBytes: progress.totalBytes,
          percent: progress.percent
        })
    })
    const sizeBytes = downloaded.sizeBytes

    const check = verifyDatabaseFile(tempPath)
    if (!check.ok) {
      log.warn('OneDrive 备份文件校验未通过', { code: check.code })
      return check
    }

    reportProgress(options.onProgress, {
      phase: 'restore',
      bytesReceived: sizeBytes,
      totalBytes: sizeBytes,
      percent: 100
    })

    const result = await restoreDatabase(tempPath)
    if (result.ok) {
      reportProgress(options.onProgress, {
        phase: 'done',
        bytesReceived: sizeBytes,
        totalBytes: sizeBytes,
        percent: 100
      })
      log.info('OneDrive 备份恢复完成', { sizeBytes })
    } else {
      log.warn('OneDrive 备份恢复失败', { code: result.code })
    }
    return result
  } finally {
    await removeFileQuietly(tempPath)
  }
}

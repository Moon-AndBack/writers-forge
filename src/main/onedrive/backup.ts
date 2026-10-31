import { app } from 'electron'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getDb } from '../database/index'
import { logger } from '../logger'
import { getValidAccessToken } from './auth'
import { uploadFile } from './upload'
import { describeError } from './http'
import { safePath } from './logSafe'
import { OneDriveError } from './types'
import type {
  OneDriveBackupProgress,
  OneDriveBackupResult,
  OneDriveProgressListener,
  RunBackupOptions
} from './types'

/**
 * 数据库一致性快照 + OneDrive 单向备份。
 *
 * 关键点：
 * - 用 better-sqlite3 `db.backup(dest)`（异步、WAL 安全）把当前库复制到系统临时目录，
 *   不直接上传正在写入的库文件；
 * - 快照文件名即远端文件名：`writers-forge-<YYYYMMDD-HHmmss>.db`（本地时间）；
 * - 无论上传成败，`finally` 删除临时快照（删除失败只记日志，不掩盖原始错误）；
 * - 仅手动触发，模块内不含定时器。
 */

const log = logger.scope('onedrive:backup')

/** 临时快照专用子目录（位于系统临时目录下，避免与其他临时文件混放）。 */
const SNAPSHOT_DIR_NAME = 'writers-forge-backups'
/** 遗留快照判定阈值：6 小时（进程崩溃等场景下的兜底清理）。 */
const STALE_SNAPSHOT_MS = 6 * 60 * 60 * 1000
/** 快照文件名前缀 / 后缀。 */
const SNAPSHOT_PREFIX = 'writers-forge-'
const SNAPSHOT_SUFFIX = '.db'

/** 一次快照的本地信息。 */
interface Snapshot {
  filePath: string
  fileName: string
  sizeBytes: number
}

/** 当前进行中的备份任务（互斥用）。 */
let activeBackup: Promise<OneDriveBackupResult> | null = null

/** 两位补零。 */
function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

/** 本地时间戳 `YYYYMMDD-HHmmss`。 */
function formatTimestamp(date: Date): string {
  const datePart = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
  const timePart = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  return `${datePart}-${timePart}`
}

/** 判定是否为本模块生成的快照文件名。 */
function isSnapshotName(name: string): boolean {
  return name.startsWith(SNAPSHOT_PREFIX) && name.endsWith(SNAPSHOT_SUFFIX)
}

/** 清理超过阈值的历史遗留快照（best-effort）。 */
async function cleanStaleSnapshots(directory: string, nowMs: number): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return
  }

  await Promise.all(
    entries.filter(isSnapshotName).map(async (name) => {
      const filePath = join(directory, name)
      try {
        const info = await stat(filePath)
        if (nowMs - info.mtimeMs < STALE_SNAPSHOT_MS) return
        await rm(filePath, { force: true })
        log.warn('已清理遗留的数据库快照', { filePath: safePath(filePath) })
      } catch (error) {
        log.warn('清理遗留快照失败', { filePath: safePath(filePath), error: describeError(error) })
      }
    })
  )
}

/**
 * 把当前数据库复制为一致性快照（异步 API，WAL 模式下安全）。
 *
 * 失败统一抛 `snapshot_failed`。
 */
async function createSnapshot(now: Date = new Date()): Promise<Snapshot> {
  const directory = join(app.getPath('temp'), SNAPSHOT_DIR_NAME)
  const fileName = `${SNAPSHOT_PREFIX}${formatTimestamp(now)}${SNAPSHOT_SUFFIX}`
  const filePath = join(directory, fileName)

  try {
    await mkdir(directory, { recursive: true })
    await cleanStaleSnapshots(directory, now.getTime())
    await getDb().backup(filePath)
  } catch (error) {
    await removeSnapshot(filePath)
    throw new OneDriveError('snapshot_failed', {
      message: `Failed to create the database snapshot: ${describeError(error)}`,
      cause: error
    })
  }

  let sizeBytes: number
  try {
    sizeBytes = (await stat(filePath)).size
  } catch (error) {
    await removeSnapshot(filePath)
    throw new OneDriveError('snapshot_failed', {
      message: `Failed to stat the database snapshot: ${describeError(error)}`,
      cause: error
    })
  }

  log.info('数据库快照已生成', { filePath: safePath(filePath), sizeBytes })
  return { filePath, fileName, sizeBytes }
}

/** 删除临时快照（失败只记日志）。 */
async function removeSnapshot(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true })
  } catch (error) {
    log.warn('删除临时快照失败', { filePath: safePath(filePath), error: describeError(error) })
  }
}

/** 进度上报（监听器异常不影响备份本身）。 */
function emitProgress(
  listener: OneDriveProgressListener | undefined,
  progress: OneDriveBackupProgress
): void {
  if (!listener) return
  try {
    listener(progress)
  } catch (error) {
    log.warn('OneDrive 备份进度回调异常', { error: describeError(error) })
  }
}

/** 实际备份流程（调用方负责互斥）。 */
async function executeBackup(options: RunBackupOptions): Promise<OneDriveBackupResult> {
  const startedAt = Date.now()
  emitProgress(options.onProgress, {
    phase: 'snapshot',
    bytesSent: 0,
    totalBytes: 0,
    percent: 0
  })

  // 先取令牌：未登录 / 未配置时快速失败，避免无谓的快照开销。
  const accessToken = await getValidAccessToken({ signal: options.signal })
  const snapshot = await createSnapshot()

  try {
    const uploaded = await uploadFile(snapshot.filePath, {
      accessToken,
      fileName: snapshot.fileName,
      signal: options.signal,
      onProgress: (progress) =>
        emitProgress(options.onProgress, {
          phase: 'upload',
          bytesSent: progress.bytesSent,
          totalBytes: progress.totalBytes,
          percent: progress.percent
        })
    })

    emitProgress(options.onProgress, {
      phase: 'done',
      bytesSent: snapshot.sizeBytes,
      totalBytes: snapshot.sizeBytes,
      percent: 100
    })

    log.info('OneDrive 备份完成', {
      fileName: uploaded.name,
      sizeBytes: uploaded.size,
      durationMs: Date.now() - startedAt
    })

    return {
      fileName: uploaded.name,
      sizeBytes: uploaded.size,
      uploadedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      ...(uploaded.id ? { driveItemId: uploaded.id } : {}),
      ...(uploaded.webUrl ? { webUrl: uploaded.webUrl } : {})
    }
  } finally {
    await removeSnapshot(snapshot.filePath)
  }
}

/** 是否有备份正在进行。 */
export function isBackupRunning(): boolean {
  return activeBackup !== null
}

/**
 * 执行一次手动备份（快照 → 上传 → 清理）。
 *
 * 并发调用会立即抛 `backup_in_progress`；其余失败均抛 `OneDriveError`。
 */
export function runBackup(options: RunBackupOptions = {}): Promise<OneDriveBackupResult> {
  if (activeBackup) {
    return Promise.reject(
      new OneDriveError('backup_in_progress', { message: 'A backup is already running' })
    )
  }

  const task = executeBackup(options)
  activeBackup = task
  void task.then(
    () => {
      activeBackup = null
    },
    () => {
      activeBackup = null
    }
  )
  return task
}

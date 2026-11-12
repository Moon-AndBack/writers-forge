import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { getDb } from '../database'
import { logger } from '../logger'
import { safeError, safePath } from '../onedrive/logSafe'
import { BACKUP_EXTENSION } from './types'
import type { DatabaseFileCheck, Snapshot } from './types'

/**
 * 数据库快照与文件校验（本地备份 / OneDrive 备份共享实现）。
 *
 * 关键点：
 * - 用 better-sqlite3 `db.backup(dest)`（异步、WAL 安全）生成一致性快照，
 *   不直接复制正在写入的库文件；
 * - 文件名固定为 `<prefix><YYYYMMDD-HHmmss>.db`（本地时间）；
 * - `staleAfterMs` 仅用于系统临时目录的遗留快照清理；本地备份目录**不得**传入，
 *   否则会误删用户备份；
 * - `verifyDatabaseFile` 以只读连接打开候选文件，跑 `PRAGMA quick_check` 并核对
 *   核心表 `settings` / `books`，失败一律 `close()` 候选连接。
 */

const log = logger.scope('backup:snapshot')

/** 两位补零。 */
function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

/** 本地时间戳 `YYYYMMDD-HHmmss`。 */
export function formatTimestamp(date: Date): string {
  const datePart = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
  const timePart = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  return `${datePart}-${timePart}`
}

/** 删除文件（失败只记日志，不掩盖调用方原始错误）。 */
export async function removeFileQuietly(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true })
  } catch (error) {
    log.warn('删除文件失败', { filePath: safePath(filePath), error: safeError(error) })
  }
}

/** 清理同前缀、超过阈值的历史快照（best-effort，仅临时目录使用）。 */
async function cleanStaleSnapshots(
  directory: string,
  prefix: string,
  maxAgeMs: number,
  nowMs: number
): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return
  }

  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix) && name.toLowerCase().endsWith(BACKUP_EXTENSION))
      .map(async (name) => {
        const filePath = join(directory, name)
        try {
          const info = await stat(filePath)
          if (!info.isFile() || nowMs - info.mtimeMs < maxAgeMs) return
          await rm(filePath, { force: true })
          log.warn('已清理遗留的数据库快照', { filePath: safePath(filePath) })
        } catch (error) {
          log.warn('清理遗留快照失败', { filePath: safePath(filePath), error: safeError(error) })
        }
      })
  )
}

export interface CreateSnapshotOptions {
  /** 快照落盘目录（不存在时自动创建）。 */
  directory: string
  /** 文件名前缀（完整文件名为 `<prefix><YYYYMMDD-HHmmss>.db`）。 */
  fileNamePrefix: string
  /** 快照时间（缺省当前时间）。 */
  now?: Date
  /**
   * 清理同前缀、超过该时长的旧快照（毫秒）。
   * 仅系统临时目录使用；本地备份目录传此参数会删除用户备份，禁止。
   */
  staleAfterMs?: number
}

/**
 * 把当前数据库复制为一致性快照（异步 API，WAL 模式下安全）。
 *
 * 失败会尽力删除半成品文件后原样抛出，由调用方决定错误码。
 */
export async function createSnapshot(options: CreateSnapshotOptions): Promise<Snapshot> {
  const now = options.now ?? new Date()
  const fileName = `${options.fileNamePrefix}${formatTimestamp(now)}${BACKUP_EXTENSION}`
  const filePath = join(options.directory, fileName)

  try {
    await mkdir(options.directory, { recursive: true })
    if (options.staleAfterMs !== undefined) {
      await cleanStaleSnapshots(
        options.directory,
        options.fileNamePrefix,
        options.staleAfterMs,
        now.getTime()
      )
    }
    await getDb().backup(filePath)
    const sizeBytes = (await stat(filePath)).size
    log.info('数据库快照已生成', { filePath: safePath(filePath), sizeBytes })
    return { filePath, fileName, sizeBytes }
  } catch (error) {
    await removeFileQuietly(filePath)
    throw error
  }
}

/**
 * 只读校验一个候选数据库文件。
 *
 * 判定顺序：
 * 1. 后缀必须是 `.db`，且能只读打开（`fileMustExist`）→ 否则 `invalid_file`；
 * 2. `PRAGMA quick_check` 必须只返回 `ok` → 否则 `corrupt`；
 * 3. 必须存在核心表 `settings` 与 `books` → 否则 `invalid_file`。
 */
export function verifyDatabaseFile(filePath: string): DatabaseFileCheck {
  if (!filePath.toLowerCase().endsWith(BACKUP_EXTENSION)) {
    return { ok: false, code: 'invalid_file' }
  }

  let db: Database.Database
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true })
  } catch (error) {
    log.warn('候选数据库无法打开', { filePath: safePath(filePath), error: safeError(error) })
    return { ok: false, code: 'invalid_file' }
  }

  try {
    let rows: Array<Record<string, unknown>>
    try {
      rows = db.pragma('quick_check') as Array<Record<string, unknown>>
    } catch (error) {
      log.warn('候选数据库完整性检查失败', {
        filePath: safePath(filePath),
        error: safeError(error)
      })
      return { ok: false, code: 'corrupt' }
    }

    const messages = rows
      .map((row) => String(Object.values(row)[0] ?? ''))
      .filter((message) => message !== '' && message !== 'ok')
    if (messages.length > 0) {
      log.warn('候选数据库完整性检查未通过', {
        filePath: safePath(filePath),
        messageCount: messages.length
      })
      return { ok: false, code: 'corrupt' }
    }

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('settings', 'books')"
      )
      .all() as Array<{ name: string }>
    const names = new Set(tables.map((row) => row.name))
    if (!names.has('settings') || !names.has('books')) {
      log.warn('候选数据库缺少核心表', { filePath: safePath(filePath) })
      return { ok: false, code: 'invalid_file' }
    }

    return { ok: true }
  } catch (error) {
    log.warn('候选数据库校验异常', { filePath: safePath(filePath), error: safeError(error) })
    return { ok: false, code: 'corrupt' }
  } finally {
    try {
      db.close()
    } catch (error) {
      log.warn('关闭候选数据库连接失败', { error: safeError(error) })
    }
  }
}

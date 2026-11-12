import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../database'
import { logger } from '../logger'
import { safeError } from '../onedrive/logSafe'
import {
  buildBackupFolderName,
  getBackupDir,
  parseFolderTimestamp,
  readBackupMeta,
  resolveBackupFolder,
  SNAPSHOT_FILE_NAME,
  writeBackupMeta
} from './paths'
import { formatTimestamp, removeDirectoryQuietly, verifyDatabaseFile } from './snapshot'
import type { BackupCreateResult, BackupItem, BackupRenameResult } from './types'

/**
 * 本地备份的创建与重命名。
 *
 * 每次备份一个独立文件夹：`<userData>/backups/<YYYYMMDD-HHmmss>[-名称]/`，
 * 内含 `snapshot.db` 与 `meta.json`。创建时先在内存中生成快照并校验，
 * 任一步失败都删除整个新建目录，绝不把半成品留在列表里。
 *
 * 重命名只改文件夹名与 `meta.name`（不复制快照）；目标已存在时返回
 * `conflict`，绝不覆盖另一份备份。
 */

const log = logger.scope('backup:local')

export async function createLocalBackup(): Promise<BackupCreateResult> {
  const timestamp = formatTimestamp(new Date())
  const folder = buildBackupFolderName({ timestamp, name: '' })
  const folderPath = join(getBackupDir(), folder)
  const snapshotPath = join(folderPath, SNAPSHOT_FILE_NAME)
  const createdAt = new Date().toISOString()

  try {
    mkdirSync(folderPath, { recursive: true })
    await getDb().backup(snapshotPath)
  } catch (error) {
    await removeDirectoryQuietly(folderPath)
    log.error('本地备份快照失败', { folder, error: safeError(error) })
    return { ok: false, code: 'snapshot_failed' }
  }

  const check = verifyDatabaseFile(snapshotPath)
  if (!check.ok) {
    await removeDirectoryQuietly(folderPath)
    log.error('本地备份校验未通过，已删除损坏目录', { folder, code: check.code })
    return check
  }

  let size: number
  try {
    size = statSync(snapshotPath).size
    writeBackupMeta(folderPath, { name: '', createdAt, kind: 'manual', size })
  } catch (error) {
    await removeDirectoryQuietly(folderPath)
    log.error('写入备份元信息失败，已删除目录', { folder, error: safeError(error) })
    return { ok: false, code: 'snapshot_failed' }
  }

  const item: BackupItem = { folder, name: '', createdAt, size, kind: 'manual' }
  log.info('本地备份完成', { folder, sizeBytes: size })
  return { ok: true, item }
}

/**
 * 重命名备份：文件夹名 = 原时间戳前缀 + 新名称 slug，`meta.name` 存原始输入。
 * 名称为空时回退纯时间戳文件夹名。目标目录已存在返回 `conflict`。
 */
export function renameBackup(folder: string, name: string): BackupRenameResult {
  const guarded = resolveBackupFolder(folder)
  if (!guarded.ok) return guarded

  const meta = readBackupMeta(guarded.path)
  if (!meta) {
    log.warn('重命名备份失败：meta.json 缺失或损坏', { folder })
    return { ok: false, code: 'not_found' }
  }

  const timestamp = parseFolderTimestamp(folder)
  if (timestamp === null) {
    log.warn('重命名备份失败：文件夹名缺少合法时间戳前缀', { folder })
    return { ok: false, code: 'invalid_name' }
  }

  let size: number
  try {
    const info = statSync(join(guarded.path, SNAPSHOT_FILE_NAME))
    if (!info.isFile()) return { ok: false, code: 'not_found' }
    size = info.size
  } catch {
    log.warn('重命名备份失败：snapshot.db 缺失', { folder })
    return { ok: false, code: 'not_found' }
  }

  const trimmed = name.trim()
  const nextFolder = buildBackupFolderName({ timestamp, name: trimmed })
  const nextPath = join(getBackupDir(), nextFolder)
  const sameFolder =
    nextFolder === folder ||
    (process.platform === 'win32' && nextFolder.toLowerCase() === folder.toLowerCase())

  if (sameFolder) {
    try {
      writeBackupMeta(guarded.path, { ...meta, name: trimmed, size })
    } catch (error) {
      log.warn('更新备份名称失败', { folder, error: safeError(error) })
      return { ok: false, code: 'rename_failed' }
    }
    log.info('备份名称已更新（文件夹名不变）', { folder })
    return {
      ok: true,
      item: { folder, name: trimmed, createdAt: meta.createdAt, size, kind: meta.kind }
    }
  }

  if (existsSync(nextPath)) {
    log.warn('重命名备份失败：目标文件夹已存在', { folder, nextFolder })
    return { ok: false, code: 'conflict' }
  }

  try {
    renameSync(guarded.path, nextPath)
  } catch (error) {
    log.warn('重命名备份文件夹失败', { folder, nextFolder, error: safeError(error) })
    return { ok: false, code: 'rename_failed' }
  }

  try {
    writeBackupMeta(nextPath, { ...meta, name: trimmed, size })
  } catch (error) {
    // 目录已改名但元信息写失败：尝试改回原名，避免文件夹名与 meta 不一致。
    try {
      renameSync(nextPath, guarded.path)
    } catch (rollbackError) {
      log.error('回滚备份文件夹名失败', {
        folder,
        nextFolder,
        error: safeError(rollbackError)
      })
    }
    log.warn('重命名后写入备份元信息失败', { folder, error: safeError(error) })
    return { ok: false, code: 'rename_failed' }
  }

  log.info('备份已重命名', { folder, nextFolder })
  return {
    ok: true,
    item: { folder: nextFolder, name: trimmed, createdAt: meta.createdAt, size, kind: meta.kind }
  }
}

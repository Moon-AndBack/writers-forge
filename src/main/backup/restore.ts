import { app } from 'electron'
import { copyFileSync, renameSync, rmSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { closeDb, getDatabasePath, getDb } from '../database'
import { logger } from '../logger'
import { isBackupRunning } from '../onedrive/backup'
import { safeError, safePath } from '../onedrive/logSafe'
import { buildBackupFileName, getBackupDir } from './paths'
import { removeFileQuietly, verifyDatabaseFile } from './snapshot'
import { BACKUP_EXTENSION } from './types'
import type { BackupRestoreResult } from './types'
import { finishBackupJob, tryStartBackupJob } from './lock'

/**
 * 从候选 `.db` 恢复整个数据库。
 *
 * 严格按序（任一步失败都不返回成功）：
 * 1. `isBackupRunning()` / 本地任务锁拒绝并发；
 * 2. 候选文件只读校验（后缀、`quick_check`、核心表）；
 * 3. 异步复制到 `<userData>/restore-staging.db`，并二次校验；
 * 4. 用 `db.backup()` 生成恢复前安全副本 `pre-restore-<ts>.db`，失败即中止；
 * 5. `closeDb()`；
 * 6. 删除 `writers-forge.db-wal` / `-shm`；
 * 7. `renameSync` staging → 正式库，失败回退 `copyFileSync`；
 * 8. 重新 `getDb()`（触发迁移）验证，失败用安全副本回滚；
 * 9. 成功后删除 staging，返回安全副本路径（重启由 IPC 层安排）。
 *
 * 失败清理：staging 在任何失败分支都会删除；替换后验证失败会先回滚再返回
 * `restore_failed`，不把不可用数据库留在原位。
 */

const log = logger.scope('backup:restore')

/** 恢复中转文件名（位于 userData，与正式库同卷，保证 rename 原子替换）。 */
const STAGING_FILE_NAME = 'restore-staging.db'

function getStagingPath(): string {
  return join(app.getPath('userData'), STAGING_FILE_NAME)
}

/** 删除 SQLite 侧车文件（-wal / -shm）；任一删除失败返回 false。 */
function removeSidecars(databasePath: string): boolean {
  let ok = true
  for (const filePath of [`${databasePath}-wal`, `${databasePath}-shm`]) {
    try {
      rmSync(filePath, { force: true })
    } catch (error) {
      ok = false
      log.error('删除数据库侧车文件失败', {
        filePath: safePath(filePath),
        error: safeError(error)
      })
    }
  }
  return ok
}

/**
 * 用恢复前安全副本回滚。
 *
 * 先关库（若仍打开）→ 删侧车 → 同步覆盖正式库 → 重新 `getDb()` 验证。
 * 侧车删不掉时**不得**覆盖正式库（旧 WAL 混入新库会损坏数据），直接中止回滚。
 * 回滚本身失败只记 error，不掩盖调用方的 `restore_failed`。
 */
function rollbackFromSafeCopy(safeCopyPath: string, databasePath: string): void {
  try {
    closeDb()
  } catch (error) {
    log.warn('回滚前关闭数据库失败', { error: safeError(error) })
  }

  if (!removeSidecars(databasePath)) {
    log.error('回滚中止：数据库侧车文件无法清理')
    return
  }

  try {
    copyFileSync(safeCopyPath, databasePath)
    getDb()
    log.warn('恢复失败，已回滚到恢复前安全副本', { safeCopy: safePath(safeCopyPath) })
  } catch (error) {
    log.error('回滚失败，数据库可能不可用', {
      safeCopy: safePath(safeCopyPath),
      error: safeError(error)
    })
  }
}

/** 实际恢复流程（调用方已持有任务锁）。 */
async function runRestore(sourcePath: string): Promise<BackupRestoreResult> {
  const databasePath = getDatabasePath()
  const stagingPath = getStagingPath()

  // 清理上次异常中断可能留下的 staging（best-effort）。
  await removeFileQuietly(stagingPath)

  // 2. 候选文件校验：后缀 + 只读打开 + quick_check + 核心表。
  if (extname(sourcePath).toLowerCase() !== BACKUP_EXTENSION) {
    log.warn('恢复候选文件扩展名非法', { filePath: safePath(sourcePath) })
    return { ok: false, code: 'invalid_file' }
  }

  const candidate = verifyDatabaseFile(sourcePath)
  if (!candidate.ok) {
    log.warn('恢复候选文件校验未通过', {
      filePath: safePath(sourcePath),
      code: candidate.code
    })
    return candidate
  }

  // 3. 异步复制到 staging，避免阻塞主进程；复制后再校验一次，防止复制期间被改。
  try {
    await copyFile(sourcePath, stagingPath)
  } catch (error) {
    log.error('复制候选文件到 staging 失败', { error: safeError(error) })
    await removeFileQuietly(stagingPath)
    return { ok: false, code: 'copy_failed' }
  }

  const staged = verifyDatabaseFile(stagingPath)
  if (!staged.ok) {
    log.warn('staging 副本校验未通过', { code: staged.code })
    await removeFileQuietly(stagingPath)
    return staged
  }

  // 4. 恢复前安全副本：失败必须中止，绝不在没有回滚点的情况下替换正式库。
  const safeCopyPath = join(getBackupDir(), buildBackupFileName('pre-restore'))
  try {
    await getDb().backup(safeCopyPath)
  } catch (error) {
    log.error('创建恢复前安全副本失败，已中止恢复', { error: safeError(error) })
    await removeFileQuietly(safeCopyPath)
    await removeFileQuietly(stagingPath)
    return { ok: false, code: 'safe_copy_failed' }
  }

  // 5. 关闭正式库连接。
  try {
    closeDb()
  } catch (error) {
    log.error('关闭数据库失败，已中止恢复', { error: safeError(error) })
    await removeFileQuietly(stagingPath)
    return { ok: false, code: 'restore_failed' }
  }

  // 6. 删除侧车文件（同步执行，尽量不给渲染层 IPC 重开旧库的机会）；
  //    删不掉则中止，绝不把旧 WAL 留给替换后的新库。
  if (!removeSidecars(databasePath)) {
    log.error('删除数据库侧车文件失败，已中止恢复')
    await removeFileQuietly(stagingPath)
    return { ok: false, code: 'restore_failed' }
  }

  // 7. 原子替换；跨卷 / 文件被占用等情况回退到同步复制。
  try {
    renameSync(stagingPath, databasePath)
  } catch (error) {
    log.warn('staging 原子替换失败，回退到同步复制', { error: safeError(error) })
    try {
      copyFileSync(stagingPath, databasePath)
    } catch (copyError) {
      log.error('替换数据库失败，开始回滚', { error: safeError(copyError) })
      try {
        rmSync(stagingPath, { force: true })
      } catch (removeError) {
        log.warn('清理 staging 失败', { error: safeError(removeError) })
      }
      rollbackFromSafeCopy(safeCopyPath, databasePath)
      return { ok: false, code: 'restore_failed' }
    }
    try {
      rmSync(stagingPath, { force: true })
    } catch (removeError) {
      log.warn('清理 staging 失败', { error: safeError(removeError) })
    }
  }

  // 8. 重新打开（触发迁移）验证；失败用安全副本回滚。
  try {
    getDb()
  } catch (error) {
    log.error('恢复后数据库验证失败，开始回滚', { error: safeError(error) })
    rollbackFromSafeCopy(safeCopyPath, databasePath)
    return { ok: false, code: 'restore_failed' }
  }

  // 9. 成功：清理 staging（rename 成功后通常已不存在）。
  await removeFileQuietly(stagingPath)
  log.info('数据库恢复完成', { safeCopy: safePath(safeCopyPath) })
  return { ok: true, safeCopyPath }
}

/**
 * 恢复数据库入口。
 *
 * 并发检查顺序：OneDrive 备份进行中 → `backup_in_progress`；本地已有任务 →
 * 同样返回 `backup_in_progress`。意外异常统一转为 `restore_failed`，绝不返回成功。
 */
export async function restoreDatabase(sourcePath: string): Promise<BackupRestoreResult> {
  if (isBackupRunning() || !tryStartBackupJob('restore')) {
    log.warn('恢复被拒绝：已有备份或恢复任务进行中')
    return { ok: false, code: 'backup_in_progress' }
  }

  try {
    log.info('开始恢复数据库', { filePath: safePath(sourcePath) })
    return await runRestore(sourcePath)
  } catch (error) {
    log.error('恢复流程意外异常', { error: safeError(error) })
    await removeFileQuietly(getStagingPath())
    return { ok: false, code: 'restore_failed' }
  } finally {
    finishBackupJob()
  }
}

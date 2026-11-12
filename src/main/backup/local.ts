import { logger } from '../logger'
import { safeError, safePath } from '../onedrive/logSafe'
import { getBackupDir, toBackupItem } from './paths'
import { createSnapshot, removeFileQuietly, verifyDatabaseFile } from './snapshot'
import { MANUAL_BACKUP_PREFIX } from './types'
import type { BackupCreateResult, Snapshot } from './types'

/**
 * 立即创建一次本地备份：
 * 1. 用共享 `createSnapshot` 在 `<userData>/backups` 生成 `writers-forge-<ts>.db`；
 * 2. 只读打开快照跑 `quick_check` + 核心表校验；
 * 3. 校验失败立即删除该文件，绝不把损坏快照留在用户备份列表里。
 *
 * 调用方（IPC 层）负责互斥与错误码透传。
 */

const log = logger.scope('backup:local')

export async function createLocalBackup(): Promise<BackupCreateResult> {
  let snapshot: Snapshot
  try {
    snapshot = await createSnapshot({
      directory: getBackupDir(),
      fileNamePrefix: MANUAL_BACKUP_PREFIX
    })
  } catch (error) {
    log.error('本地备份快照失败', { error: safeError(error) })
    return { ok: false, code: 'snapshot_failed' }
  }

  const check = verifyDatabaseFile(snapshot.filePath)
  if (!check.ok) {
    await removeFileQuietly(snapshot.filePath)
    log.error('本地备份校验未通过，已删除损坏文件', {
      filePath: safePath(snapshot.filePath),
      code: check.code
    })
    return check
  }

  const item = toBackupItem(snapshot.fileName, snapshot.filePath, snapshot.sizeBytes, Date.now())
  log.info('本地备份完成', { filePath: safePath(snapshot.filePath), sizeBytes: item.size })
  return { ok: true, item }
}

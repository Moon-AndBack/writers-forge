/**
 * 本地备份 / 恢复域统一出口（主进程 IPC 层与 preload 类型层引用）。
 *
 * 分层：
 * - `types`    公共类型、文件名常量、错误码
 * - `paths`    备份目录、文件夹命名 / 列表 / 路径守卫、meta.json 读写
 * - `snapshot` 共享在线快照 + 候选文件校验 + 目录清理
 * - `lock`     备份 / 恢复 / 导出互斥
 * - `local`    立即本地备份、备份重命名
 * - `restore`  九步恢复与回滚
 */

export { BACKUP_EXTENSION, MANUAL_BACKUP_PREFIX } from './types'
export type {
  BackupCreateResult,
  BackupErrorCode,
  BackupExportResult,
  BackupFailure,
  BackupItem,
  BackupKind,
  BackupListResult,
  BackupMeta,
  BackupOkResult,
  BackupRenameResult,
  BackupRestoreResult,
  DatabaseFileCheck,
  Snapshot
} from './types'

export {
  buildBackupFileName,
  buildBackupFolderName,
  getBackupDir,
  listBackups,
  META_FILE_NAME,
  parseFolderTimestamp,
  readBackupMeta,
  resolveBackupFolder,
  SNAPSHOT_FILE_NAME,
  writeBackupMeta
} from './paths'
export type { BackupFolderResolution } from './paths'

export {
  createSnapshot,
  formatTimestamp,
  removeDirectoryQuietly,
  removeFileQuietly,
  verifyDatabaseFile
} from './snapshot'
export type { CreateSnapshotOptions } from './snapshot'

export { finishBackupJob, isBackupJobRunning, isRestoreRunning, tryStartBackupJob } from './lock'
export type { BackupJobKind } from './lock'

export { createLocalBackup, renameBackup } from './local'
export { restoreDatabase } from './restore'

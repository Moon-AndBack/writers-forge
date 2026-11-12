/**
 * 本地备份 / 恢复域公共类型与文件名常量。
 *
 * 本模块**不依赖** electron / better-sqlite3 / 其它备份模块，供主进程各层与
 * preload 类型层安全引用。错误只以语言中立的 `code` 回传，文案由渲染层 i18n 负责。
 */

/** 备份文件后缀（整库导出 / 候选文件校验）。 */
export const BACKUP_EXTENSION = '.db'

/** 手动备份文件名前缀（仅整库导出的默认文件名使用）。 */
export const MANUAL_BACKUP_PREFIX = 'writers-forge-'

/** 备份来源：手动备份 / 恢复前自动安全副本。 */
export type BackupKind = 'manual' | 'pre-restore'

/** 备份文件夹 `meta.json` 的落盘结构。 */
export interface BackupMeta {
  /** 用户命名；未命名为空串。 */
  name: string
  /** 创建时间（ISO 8601）。 */
  createdAt: string
  /** 备份来源。 */
  kind: BackupKind
  /** 快照字节数（读取列表时以 `stat` 为准，不信任此旧值）。 */
  size: number
}

/** 备份列表项（按 `createdAt` 倒序返回）。 */
export interface BackupItem {
  /** 备份文件夹名（列表操作与恢复的唯一标识）。 */
  folder: string
  /** 用户命名；未命名为空串（UI 回退显示时间）。 */
  name: string
  /** 创建时间（ISO 8601）。 */
  createdAt: string
  /** `snapshot.db` 字节数。 */
  size: number
  kind: BackupKind
}

/** 一次数据库在线快照的本地信息（OneDrive 临时快照使用）。 */
export interface Snapshot {
  filePath: string
  fileName: string
  sizeBytes: number
}

/** 可预期的备份域错误码（渲染层 i18n 映射的唯一依据）。 */
export type BackupErrorCode =
  | 'backup_in_progress'
  | 'snapshot_failed'
  | 'invalid_file'
  | 'corrupt'
  | 'copy_failed'
  | 'safe_copy_failed'
  | 'restore_failed'
  | 'invalid_name'
  | 'not_found'
  | 'list_failed'
  | 'delete_failed'
  | 'export_failed'
  | 'open_failed'
  | 'canceled'
  | 'conflict'
  | 'rename_failed'

/** 结构化失败载荷。 */
export interface BackupFailure {
  ok: false
  code: BackupErrorCode
}

export type BackupListResult = { ok: true; items: BackupItem[] } | BackupFailure
export type BackupCreateResult = { ok: true; item: BackupItem } | BackupFailure
export type BackupRenameResult = { ok: true; item: BackupItem } | BackupFailure
export type BackupRestoreResult = { ok: true; safeCopyPath: string } | BackupFailure
export type BackupExportResult = { ok: true; path: string } | BackupFailure
export type BackupOkResult = { ok: true } | BackupFailure

/** 候选数据库文件校验结果（只读打开 + quick_check + 核心表）。 */
export type DatabaseFileCheck = { ok: true } | { ok: false; code: 'invalid_file' | 'corrupt' }

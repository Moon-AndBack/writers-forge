/**
 * preload 类型域 · **本地备份 / 恢复**（`backup:*` 通道）。
 *
 * 单一真源：结果类型与错误码一律经 `import type` 从主进程备份域
 *（`main/backup`）取用，不在 preload 逐字镜像。错误只含语言中立的 `code`，
 * 文案由渲染层 i18n 映射。
 */

import type {
  BackupCreateResult,
  BackupExportResult,
  BackupListResult,
  BackupOkResult,
  BackupRestoreResult
} from '../../main/backup'

export type {
  BackupCreateResult,
  BackupErrorCode,
  BackupExportResult,
  BackupFailure,
  BackupItem,
  BackupKind,
  BackupListResult,
  BackupOkResult,
  BackupRestoreResult
} from '../../main/backup'

/**
 * 本地备份域 preload 暴露面（挂载于 `window.api.backup`）。
 *
 * 通道对应关系见 `main/ipc/backup.ts` 文件头注释，两侧须同步。
 */
export interface BackupApi {
  /** 备份列表（按文件 mtime 倒序；含手动备份与恢复前安全副本）。 */
  list: () => Promise<BackupListResult>
  /** 立即创建一次本地备份；重复调用返回 `backup_in_progress`。 */
  create: () => Promise<BackupCreateResult>
  /** 从备份列表恢复（只接受备份目录内的文件名，路径穿越返回 `invalid_name`）。 */
  restore: (name: string) => Promise<BackupRestoreResult>
  /** 弹系统打开对话框，从任意 `.db` 文件恢复；取消返回 `canceled`。 */
  restoreFile: () => Promise<BackupRestoreResult>
  /** 弹系统保存对话框，导出整库 `.db`；取消返回 `canceled`。 */
  export: () => Promise<BackupExportResult>
  /** 用系统文件管理器打开备份目录。 */
  openFolder: () => Promise<BackupOkResult>
  /** 删除备份目录内的指定备份文件（同样经过路径守卫）。 */
  delete: (name: string) => Promise<BackupOkResult>
}

/**
 * 设置页 · OneDrive 备份分区的静态映射与纯函数。
 *
 * `ERROR_KEYS` 以 `satisfies Record<OneDriveErrorCode, string>` 强制覆盖主进程
 * 全部 25 个错误码：新增 / 删除错误码时 `npm run typecheck` 会立即失败，避免漏译。
 * 错误文案只按 `code` 取，**不展示**主进程的英文 `message`。
 */
import type { OneDriveBackupProgress, OneDriveErrorCode } from '../../../../preload/types/onedrive'

/** 错误码 → `onedrive` ns 文案 key。 */
export const ERROR_KEYS = {
  not_configured: 'error.not_configured',
  encryption_unavailable: 'error.encryption_unavailable',
  credentials_corrupt: 'error.credentials_corrupt',
  auth_cancelled: 'error.auth_cancelled',
  auth_timeout: 'error.auth_timeout',
  auth_failed: 'error.auth_failed',
  state_mismatch: 'error.state_mismatch',
  reauth_required: 'error.reauth_required',
  port_bind_failed: 'error.port_bind_failed',
  network: 'error.network',
  timeout: 'error.timeout',
  aborted: 'error.aborted',
  unauthorized: 'error.unauthorized',
  forbidden: 'error.forbidden',
  not_found: 'error.not_found',
  rate_limited: 'error.rate_limited',
  upstream: 'error.upstream',
  upload_failed: 'error.upload_failed',
  snapshot_failed: 'error.snapshot_failed',
  list_failed: 'error.list_failed',
  download_failed: 'error.download_failed',
  delete_failed: 'error.delete_failed',
  remote_not_found: 'error.remote_not_found',
  backup_in_progress: 'error.backup_in_progress',
  unknown: 'error.unknown'
} as const satisfies Record<OneDriveErrorCode, string>

/** 备份 / 恢复阶段 → 进度文案 key（`upload` / `download` 需插值 `percent`）。 */
export const PHASE_KEYS = {
  snapshot: 'backup.phase.snapshot',
  upload: 'backup.phase.upload',
  download: 'backup.phase.download',
  restore: 'backup.phase.restore',
  done: 'backup.phase.done'
} as const satisfies Record<OneDriveBackupProgress['phase'], string>

/** 非错误型提示（用户主动取消），与错误码分开展示。 */
export const NOTICE_KEYS = {
  signInCancelled: 'notice.signInCancelled',
  backupCancelled: 'notice.backupCancelled'
} as const

export type OneDriveNotice = keyof typeof NOTICE_KEYS

/** 字节数格式化已上提至共享工具，此处保留转发以兼容既有导入。 */
export { formatBytes } from '../../lib/formatBytes'

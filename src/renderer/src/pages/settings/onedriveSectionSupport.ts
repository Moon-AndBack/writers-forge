/**
 * 设置页 · OneDrive 备份分区的静态映射与纯函数。
 *
 * `ERROR_KEYS` 以 `satisfies Record<OneDriveErrorCode, string>` 强制覆盖主进程
 * 全部 21 个错误码：新增 / 删除错误码时 `npm run typecheck` 会立即失败，避免漏译。
 * 错误文案只按 `code` 取，**不展示**主进程的英文 `message`。
 */
import type { OneDriveBackupProgress, OneDriveErrorCode } from '../../../../preload/types/onedrive'

/**
 * 用户自定义 clientId 的 settings 键（与主进程 `ONEDRIVE_SETTING_KEYS.clientId` 同步）。
 *
 * 上游 `status().clientId` 现为「生效值」——未自定义时回退内置默认常量，已无法区分
 * 来源；本键仅用于以**原始自定义值**初始化输入框：空串 = 使用内置默认。
 */
export const ONEDRIVE_CLIENT_ID_SETTING_KEY = 'onedrive:clientId'

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
  backup_in_progress: 'error.backup_in_progress',
  unknown: 'error.unknown'
} as const satisfies Record<OneDriveErrorCode, string>

/** 备份阶段 → 进度文案 key（`upload` 需插值 `percent`）。 */
export const PHASE_KEYS = {
  snapshot: 'backup.phase.snapshot',
  upload: 'backup.phase.upload',
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

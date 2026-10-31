/**
 * OneDrive 备份域公共类型与结构化错误。
 *
 * 约定：
 * - 本模块**不产出面向用户的文案**：错误只携带 `code`（渲染层按 code 走 i18n），
 *   `message` 仅用于主进程日志 / 排查（英文技术描述）。
 * - 类型不依赖 `electron`，便于后续被 IPC 层 / 类型声明复用。
 * - 任何 token / 密文都不得进入 `message`、日志或 IPC 载荷。
 */

/** 归一化错误码（渲染层据此翻译文案）。 */
export type OneDriveErrorCode =
  | 'not_configured'
  | 'encryption_unavailable'
  | 'credentials_corrupt'
  | 'auth_cancelled'
  | 'auth_timeout'
  | 'auth_failed'
  | 'state_mismatch'
  | 'reauth_required'
  | 'port_bind_failed'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'upstream'
  | 'upload_failed'
  | 'snapshot_failed'
  | 'backup_in_progress'
  | 'unknown'

/** 默认可重试的错误码（网络抖动 / 超时 / 限流 / 上游 5xx）。 */
const RETRYABLE_CODES: ReadonlySet<OneDriveErrorCode> = new Set<OneDriveErrorCode>([
  'network',
  'timeout',
  'rate_limited',
  'upstream'
])

/** `OneDriveError` 构造参数。 */
export interface OneDriveErrorOptions {
  /** 上游 HTTP 状态（无则省略）。 */
  status?: number
  /** 覆盖默认可重试判定。 */
  retryable?: boolean
  /** 英文技术描述（不得含 token / 密文）。省略时取错误码。 */
  message?: string
  /** 原始异常（仅主进程内存可见）。 */
  cause?: unknown
}

/**
 * 携带归一化错误码的异常。
 *
 * 上层（IPC / 渲染层）应只读取 `code` / `status` / `retryable`，不要解析 `message`。
 */
export class OneDriveError extends Error {
  readonly code: OneDriveErrorCode
  readonly status?: number
  readonly retryable: boolean

  constructor(code: OneDriveErrorCode, options: OneDriveErrorOptions = {}) {
    super(
      options.message ?? code,
      options.cause === undefined ? undefined : { cause: options.cause }
    )
    this.name = 'OneDriveError'
    this.code = code
    this.status = options.status
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code)
  }
}

/** 运行时判定是否为域内结构化错误。 */
export function isOneDriveError(value: unknown): value is OneDriveError {
  return value instanceof OneDriveError
}

/** OneDrive 账户展示信息。 */
export interface OneDriveAccount {
  /** 邮箱（优先 `mail`，回退 `userPrincipalName`）。 */
  email: string
  displayName?: string
}

/**
 * 已授权凭据（只在加密后落库，明文仅存在于主进程内存）。
 *
 * `expiresAt` 为**毫秒时间戳**；刷新时若上游未返回新的 refresh token，
 * 应沿用旧值（Microsoft 并不每次都轮换）。
 */
export interface OneDriveCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  account?: OneDriveAccount
}

/** 授权状态摘要（仅非敏感信息，可安全透传渲染层）。 */
export interface OneDriveAuthStatus {
  /** 是否已配置 clientId（应用注册）。 */
  configured: boolean
  /** 是否已登录且当前环境可解密凭据。 */
  signedIn: boolean
  /** 账户展示信息（未登录 / 不可解密时为 null）。 */
  account: OneDriveAccount | null
  /** 当前环境是否支持 safeStorage 加密。 */
  encryptionAvailable: boolean
}

/** 备份阶段：生成快照 → 上传 → 完成。 */
export type OneDriveBackupPhase = 'snapshot' | 'upload' | 'done'

/** 备份进度回调载荷。 */
export interface OneDriveBackupProgress {
  phase: OneDriveBackupPhase
  /** 已发送字节数（snapshot 阶段恒为 0）。 */
  bytesSent: number
  /** 总字节数（snapshot 阶段尚未统计，恒为 0）。 */
  totalBytes: number
  /** 进度百分比（0-100 整数；snapshot 阶段恒为 0）。 */
  percent: number
}

/** 备份进度监听器。 */
export type OneDriveProgressListener = (progress: OneDriveBackupProgress) => void

/** 上传进度载荷（graph 层使用，由 backup 层包装成 `OneDriveBackupProgress`）。 */
export interface OneDriveUploadProgress {
  bytesSent: number
  totalBytes: number
  percent: number
}

/** 上传成功后的远端文件信息。 */
export interface OneDriveUploadedFile {
  id: string | null
  name: string
  size: number
  webUrl: string | null
}

/** 单次手动备份的返回结果。 */
export interface OneDriveBackupResult {
  /** 远端文件名（`writers-forge-<YYYYMMDD-HHmmss>.db`）。 */
  fileName: string
  sizeBytes: number
  /** 上传完成时间（ISO 8601）。 */
  uploadedAt: string
  /** 从开始到上传完成的耗时（毫秒）。 */
  durationMs: number
  /** Graph driveItem id（上游未返回时省略）。 */
  driveItemId?: string
  /** OneDrive 网页链接（上游未返回时省略）。 */
  webUrl?: string
}

/** `runBackup` 选项。 */
export interface RunBackupOptions {
  onProgress?: OneDriveProgressListener
  /** 外部取消信号（取消后抛 `aborted`）。 */
  signal?: AbortSignal
}

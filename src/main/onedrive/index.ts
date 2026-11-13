/**
 * OneDrive 备份主进程模块统一出口（供 IPC 层对接）。
 *
 * 分层：
 * - `types`       公共类型与 `OneDriveError`
 * - `credentials` settings 键、加密凭据、授权状态
 * - `auth`        PKCE 授权、刷新、登出
 * - `graph`       Graph 请求与上传
 * - `backup`      快照 + 备份编排
 *
 * 本模块只返回结构化错误码，不产出面向用户的文案（文案由渲染层 i18n 负责）。
 */

export * from './types'

export {
  ONEDRIVE_SETTING_KEYS,
  getOneDriveClientId,
  setOneDriveClientId,
  isCredentialEncryptionAvailable,
  readStoredCredentials,
  writeStoredCredentials,
  clearStoredCredentials,
  getStoredAccount,
  getOneDriveAuthStatus
} from './credentials'

export {
  ONEDRIVE_SCOPES,
  signIn,
  cancelSignIn,
  isSignInInProgress,
  getValidAccessToken,
  signOut
} from './auth'
export type { SignInOptions } from './auth'

export { getAccountProfile } from './graph'
export { uploadFile } from './upload'
export type { GraphAuthOptions } from './graph'
export type { UploadFileOptions } from './upload'

export { isBackupRunning, runBackup } from './backup'

export { listRemoteBackups } from './remote'
export type { ListRemoteBackupsOptions } from './remote'

export { downloadRemoteBackup } from './download'
export type { DownloadRemoteBackupOptions } from './download'

export { restoreRemoteBackup } from './restoreRemote'
export type { RestoreRemoteBackupOptions } from './restoreRemote'

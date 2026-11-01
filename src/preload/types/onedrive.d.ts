/**
 * preload 类型域 · **OneDrive 备份**（`onedrive:*` 通道 + 备份进度订阅）。
 *
 * 属 `src/preload/types/` 按域拆分产物。**单一真源**：类型一律经 `import type`
 * 从主进程能力层（`main/onedrive`）与 IPC 契约层（`main/ipc/onedrive`）取用，
 * 不逐字镜像（理由见 `database.d.ts` 文件头：`import type` 编译期擦除，不污染 renderer bundle）。
 *
 * 安全约定：本域**不存在**任何返回 access token / refresh token 的签名——
 * 状态只含账户邮箱等展示信息；错误只含归一化 `code`（英文 message 由渲染层 i18n 映射）。
 */

import type {
  OneDriveAccount,
  OneDriveAuthStatus,
  OneDriveBackupProgress,
  OneDriveBackupResult,
  OneDriveErrorCode
} from '../../main/onedrive'
import type { OneDriveFailure, OneDriveResult, OneDriveStatus } from '../../main/ipc/onedrive'

export type {
  OneDriveAccount,
  OneDriveAuthStatus,
  OneDriveBackupProgress,
  OneDriveBackupResult,
  OneDriveErrorCode,
  OneDriveFailure,
  OneDriveResult,
  OneDriveStatus
}

/** 进度订阅退订函数（组件卸载时必调）。 */
export type OneDriveProgressUnsubscribe = () => void

/**
 * OneDrive 域 preload 暴露面（挂载于 `window.api.onedrive`）。
 *
 * 通道对应关系见 `main/ipc/onedrive.ts` 文件头注释，两侧须同步。
 */
export interface OneDriveApi {
  /** 聚合状态：加密可用性 / clientId / 登录态 / 授权中 / 备份中。 */
  status: () => Promise<OneDriveStatus>
  /** 写入应用注册 clientId（空串 = 清除）；返回写入后的状态。 */
  setClientId: (clientId: string) => Promise<OneDriveStatus>
  /** 发起授权（打开系统浏览器）；取消 / 超时 / 失败以 `ok=false` + `code` 返回。 */
  signIn: () => Promise<OneDriveResult<OneDriveAuthStatus>>
  /** 取消进行中的授权；返回是否有流程被取消（无进行中流程为 false）。 */
  cancelSignIn: () => Promise<boolean>
  /** 登出（保留 clientId）；返回登出后的状态。 */
  signOut: () => Promise<OneDriveStatus>
  /** 执行一次手动备份；进度走 `onProgress`。重复调用返回 `backup_in_progress`。 */
  backup: () => Promise<OneDriveResult<OneDriveBackupResult>>
  /** 中断进行中的备份；返回是否发出了取消请求（无进行中任务为 false）。 */
  cancelBackup: () => Promise<boolean>
  /** 订阅备份进度，返回退订函数（组件卸载时必调）。 */
  onProgress: (callback: (progress: OneDriveBackupProgress) => void) => OneDriveProgressUnsubscribe
}

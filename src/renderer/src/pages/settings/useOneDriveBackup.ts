/**
 * 设置页 · OneDrive 备份状态 hook。
 *
 * 职责：
 * - 挂载时 `status()` 拉取初始态（含 `backupRunning` / `signingIn`）；
 * - 订阅 `onProgress`（卸载时退订），备份进度与运行态由事件驱动；
 * - 封装登录 / 取消登录 / 退出 / 备份 / 取消备份的异步流程；
 * - 云端备份列表与恢复拆分到 `useOneDriveRemoteBackups`，本 hook 只合并对外接口；
 * - 错误只保留 `OneDriveErrorCode` / `BackupErrorCode`，由组件经映射表走 i18n。
 *
 * 不在此处翻译错误文案（仅提示类 toast / 确认框使用 `t()`），避免把错误码
 * 降级成字符串后失去可映射性。
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  OneDriveBackupProgress,
  OneDriveErrorCode,
  OneDriveStatus
} from '../../../../preload/types/onedrive'
import { useToast } from '../../components/ui'
import { useConfirm } from '../writer/chapters/useConfirm'
import { formatBytes, type OneDriveNotice } from './onedriveSectionSupport'
import { useOneDriveRemoteBackups, type OneDriveRemoteController } from './useOneDriveRemoteBackups'

const INITIAL_PROGRESS: OneDriveBackupProgress = {
  phase: 'snapshot',
  bytesSent: 0,
  totalBytes: 0,
  percent: 0
}

export interface OneDriveBackupController extends OneDriveRemoteController {
  /** 主进程聚合状态；未读取完成时为 null。 */
  status: OneDriveStatus | null
  /** 初次 status 读取中。 */
  loading: boolean
  /** 当前环境未暴露 `window.api.onedrive`。 */
  unsupported: boolean
  /** 登录流程进行中（含进入设置前已在浏览器等待回调）。 */
  signingIn: boolean
  /** 备份进行中（含进入设置前已启动的备份）。 */
  backupRunning: boolean
  /** 当前 / 最近一次备份进度；无备份时为 null。 */
  progress: OneDriveBackupProgress | null
  /** 最近一次失败的错误码（成功 / 新操作开始时清空）。 */
  errorCode: OneDriveErrorCode | null
  /** 用户主动取消的提示（非错误）。 */
  notice: OneDriveNotice | null
  handleSignIn: () => void
  handleCancelSignIn: () => void
  handleSignOut: () => void
  handleBackup: () => void
  handleCancelBackup: () => void
  /** 退出登录二次确认弹窗节点。 */
  confirmNode: ReactNode
  /** 备份成功提示节点。 */
  toastNode: ReactNode
}

export function useOneDriveBackup(): OneDriveBackupController {
  const { t } = useTranslation('onedrive')
  const { show: showToast, node: toastNode } = useToast()
  const { request: requestConfirm, node: confirmNode } = useConfirm()
  const api = window.api?.onedrive

  const [status, setStatus] = useState<OneDriveStatus | null>(null)
  const [loading, setLoading] = useState(api !== undefined)
  const [signingIn, setSigningIn] = useState(false)
  const [backupRunning, setBackupRunning] = useState(false)
  const [progress, setProgress] = useState<OneDriveBackupProgress | null>(null)
  const [errorCode, setErrorCode] = useState<OneDriveErrorCode | null>(null)
  const [notice, setNotice] = useState<OneDriveNotice | null>(null)

  const remote = useOneDriveRemoteBackups({
    api,
    signedIn: status?.signedIn === true,
    backupRunning,
    signingIn,
    statusRestoreRunning: status?.restoreRunning === true,
    requestConfirm
  })
  const { actions: remoteActions, resetRemote, restoreRunning: remoteRestoreRunning } = remote

  useEffect(() => {
    if (!api) return undefined

    let active = true

    void (async () => {
      try {
        const next = await api.status()
        if (!active) return
        setStatus(next)
        setSigningIn(next.signingIn)
        if (next.backupRunning) {
          setBackupRunning(true)
          setProgress(INITIAL_PROGRESS)
        }
      } catch {
        if (active) setErrorCode('unknown')
      } finally {
        if (active) setLoading(false)
      }
    })()

    const unsubscribe = api.onProgress((next) => {
      setProgress(next)
      // `done` 之后 invoke 结果即将返回；此处先结束运行态，避免事件晚到导致卡住。
      setBackupRunning(next.phase !== 'done')
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [api])

  const handleSignIn = useCallback((): void => {
    if (!api || signingIn || status === null || remoteRestoreRunning) return

    setErrorCode(null)
    setNotice(null)
    setSigningIn(true)

    void (async () => {
      try {
        const result = await api.signIn()
        if (result.ok) {
          setStatus((prev) => {
            const base: OneDriveStatus = prev ?? {
              signedIn: false,
              account: null,
              encryptionAvailable: result.value.encryptionAvailable,
              signingIn: false,
              backupRunning: false,
              restoreRunning: false
            }
            return { ...base, ...result.value, signingIn: false }
          })
          showToast(t('account.signedInToast'))
        } else if (result.code === 'auth_cancelled') {
          setNotice('signInCancelled')
        } else {
          setErrorCode(result.code)
        }
      } catch {
        setErrorCode('unknown')
      } finally {
        setSigningIn(false)
      }
    })()
  }, [api, remoteRestoreRunning, showToast, signingIn, status, t])

  const handleCancelSignIn = useCallback((): void => {
    if (!api) return
    void api.cancelSignIn().catch(() => {})
  }, [api])

  const handleSignOut = useCallback((): void => {
    if (!api || status?.signedIn !== true || remoteRestoreRunning) return

    requestConfirm(
      {
        title: t('signOut.confirmTitle'),
        message: t('signOut.confirmMessage'),
        confirmText: t('signOut.confirmAction'),
        tone: 'default'
      },
      async () => {
        try {
          const next = await api.signOut()
          setStatus(next)
          setSigningIn(next.signingIn)
          setBackupRunning(next.backupRunning)
          setProgress(null)
          setErrorCode(null)
          setNotice(null)
          // 登出后远端列表不再可见，清空状态与恢复结果。
          resetRemote()
          showToast(t('signOut.successToast'))
        } catch {
          setErrorCode('unknown')
        }
      }
    )
  }, [api, resetRemote, remoteRestoreRunning, requestConfirm, showToast, status?.signedIn, t])

  const handleBackup = useCallback((): void => {
    if (!api || status?.signedIn !== true || backupRunning || remoteRestoreRunning) {
      return
    }

    setErrorCode(null)
    setNotice(null)
    setBackupRunning(true)
    setProgress(INITIAL_PROGRESS)

    void (async () => {
      try {
        const result = await api.backup()
        if (result.ok) {
          setProgress({
            phase: 'done',
            bytesSent: result.value.sizeBytes,
            totalBytes: result.value.sizeBytes,
            percent: 100
          })
          showToast(
            t('backup.successToast', {
              fileName: result.value.fileName,
              size: formatBytes(result.value.sizeBytes)
            })
          )
          // 新备份已上传，刷新远端列表。
          remoteActions.refreshRemote()
        } else if (result.code === 'aborted') {
          setProgress(null)
          setNotice('backupCancelled')
        } else {
          setProgress(null)
          setErrorCode(result.code)
        }
      } catch {
        setProgress(null)
        setErrorCode('unknown')
      } finally {
        setBackupRunning(false)
        setStatus((prev) => (prev ? { ...prev, backupRunning: false } : prev))
      }
    })()
  }, [api, backupRunning, remoteActions, remoteRestoreRunning, showToast, status?.signedIn, t])

  const handleCancelBackup = useCallback((): void => {
    if (!api) return
    setErrorCode(null)
    void api.cancelBackup().catch(() => {})
  }, [api])

  return {
    status,
    loading,
    unsupported: api === undefined,
    signingIn,
    backupRunning,
    progress,
    errorCode,
    notice,
    ...remote,
    handleSignIn,
    handleCancelSignIn,
    handleSignOut,
    handleBackup,
    handleCancelBackup,
    confirmNode,
    toastNode
  }
}

export default useOneDriveBackup

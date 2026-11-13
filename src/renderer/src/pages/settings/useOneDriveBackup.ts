/**
 * 设置页 · OneDrive 备份状态 hook。
 *
 * 职责：
 * - 挂载时 `status()` 拉取初始态（含 `backupRunning` / `signingIn` 恢复）；
 * - 订阅 `onProgress`（卸载时退订），备份进度与运行态由事件驱动；
 * - 封装登录 / 取消登录 / 退出 / 备份 / 取消备份 / 保存 clientId 的异步流程；
 * - 错误只保留 `OneDriveErrorCode`，由组件经 `ERROR_KEYS` 走 i18n 文案。
 *
 * 不在此处翻译错误文案（仅提示类 toast / 确认框使用 `t()`），避免把错误码
 * 降级成字符串后失去可映射性。
 */
import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  OneDriveBackupProgress,
  OneDriveErrorCode,
  OneDriveStatus
} from '../../../../preload/types/onedrive'
import { useToast } from '../../components/ui'
import { useConfirm } from '../writer/chapters/useConfirm'
import {
  ONEDRIVE_CLIENT_ID_SETTING_KEY,
  formatBytes,
  type OneDriveNotice
} from './onedriveSectionSupport'

const INITIAL_PROGRESS: OneDriveBackupProgress = {
  phase: 'snapshot',
  bytesSent: 0,
  totalBytes: 0,
  percent: 0
}

export interface OneDriveBackupController {
  /** 主进程聚合状态；未读取完成时为 null。 */
  status: OneDriveStatus | null
  /** 初次 status 读取中。 */
  loading: boolean
  /** 当前环境未暴露 `window.api.onedrive`。 */
  unsupported: boolean
  /** clientId 输入草稿。 */
  draftClientId: string
  setDraftClientId: Dispatch<SetStateAction<string>>
  savingClientId: boolean
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
  handleSaveClientId: () => void
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
  const settingsApi = window.api?.settings

  const [status, setStatus] = useState<OneDriveStatus | null>(null)
  const [loading, setLoading] = useState(api !== undefined)
  const [draftClientId, setDraftClientId] = useState('')
  const [savingClientId, setSavingClientId] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [backupRunning, setBackupRunning] = useState(false)
  const [progress, setProgress] = useState<OneDriveBackupProgress | null>(null)
  const [errorCode, setErrorCode] = useState<OneDriveErrorCode | null>(null)
  const [notice, setNotice] = useState<OneDriveNotice | null>(null)

  useEffect(() => {
    if (!api) return undefined

    let active = true

    void (async () => {
      // `status().clientId` 是生效值（可能已回退内置默认），无法区分来源；
      // 直接读原始 settings 值，空串才让输入框保持「留空 = 默认」。
      const rawClientId = await (
        settingsApi ? settingsApi.get(ONEDRIVE_CLIENT_ID_SETTING_KEY) : Promise.resolve(null)
      ).catch(() => null)

      try {
        const next = await api.status()
        if (!active) return
        setStatus(next)
        setDraftClientId((rawClientId ?? '').trim())
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
  }, [api, settingsApi])

  const handleSignIn = useCallback((): void => {
    if (!api || signingIn || status === null) return

    setErrorCode(null)
    setNotice(null)
    setSigningIn(true)

    void (async () => {
      try {
        const result = await api.signIn()
        if (result.ok) {
          setStatus((prev) => {
            const base: OneDriveStatus = prev ?? {
              configured: false,
              signedIn: false,
              account: null,
              encryptionAvailable: result.value.encryptionAvailable,
              clientId: '',
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
  }, [api, showToast, signingIn, status, t])

  const handleCancelSignIn = useCallback((): void => {
    if (!api) return
    void api.cancelSignIn().catch(() => {})
  }, [api])

  const handleSignOut = useCallback((): void => {
    if (!api || status?.signedIn !== true) return

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
          showToast(t('signOut.successToast'))
        } catch {
          setErrorCode('unknown')
        }
      }
    )
  }, [api, requestConfirm, showToast, status?.signedIn, t])

  const handleBackup = useCallback((): void => {
    if (!api || status?.signedIn !== true || backupRunning) return

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
  }, [api, backupRunning, showToast, status?.signedIn, t])

  const handleCancelBackup = useCallback((): void => {
    if (!api) return
    setErrorCode(null)
    void api.cancelBackup().catch(() => {})
  }, [api])

  const handleSaveClientId = useCallback((): void => {
    if (!api || savingClientId) return

    const trimmed = draftClientId.trim()
    setErrorCode(null)
    setNotice(null)
    setSavingClientId(true)

    void (async () => {
      try {
        const next = await api.setClientId(trimmed)
        setStatus(next)
        // 不把生效值（内置默认）回填输入框，否则「留空 = 默认」无法表达。
        setDraftClientId(trimmed)
        showToast(t('clientId.savedToast'))
      } catch {
        setErrorCode('unknown')
      } finally {
        setSavingClientId(false)
      }
    })()
  }, [api, draftClientId, savingClientId, showToast, t])

  return {
    status,
    loading,
    unsupported: api === undefined,
    draftClientId,
    setDraftClientId,
    savingClientId,
    signingIn,
    backupRunning,
    progress,
    errorCode,
    notice,
    handleSignIn,
    handleCancelSignIn,
    handleSignOut,
    handleBackup,
    handleCancelBackup,
    handleSaveClientId,
    confirmNode,
    toastNode
  }
}

export default useOneDriveBackup

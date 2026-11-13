/**
 * 设置页 · OneDrive 云端备份列表与恢复子状态机。
 *
 * 从 `useOneDriveBackup` 拆出（单文件 500 行上限）：只管理远端列表三态、
 * 恢复进度 / 取消 / 嵌套错误码，账号与本地备份流程仍留在主 hook。
 *
 * 恢复时序（由调用方提供确认框控制器，复用主 hook 的 confirmNode）：
 * 1. 先 `flushAll()` 统一落盘；
 * 2. `requestConfirm` 二次确认（覆盖整库 / 自动安全副本 / 自动重启 / 先保存）；
 * 3. 调 `restoreBackup(itemId)`，成功后保持运行态等待主进程重启。
 *
 * 错误映射：外层 `OneDriveResult` 失败用 `OneDriveErrorCode`，内层
 * `BackupRestoreResult` 失败用 `BackupErrorCode`，意外异常用 `unknown`。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BackupErrorCode } from '../../../../main/backup'
import type {
  OneDriveApi,
  OneDriveErrorCode,
  OneDriveRestoreProgress,
  RemoteBackupItem
} from '../../../../preload/types/onedrive'
import { useFlushAllBeforeClose } from '../../shell/beforeCloseFlush'
import type { ConfirmController } from '../writer/chapters/useConfirm'

/** 远端列表三态；`idle` 用于未登录 / 已登出。 */
export type RemoteBackupStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * 恢复失败来源：
 * - `onedrive`：外层 `OneDriveResult` 失败（下载 / 鉴权 / 条目不存在等）；
 * - `backup`：内层 `BackupRestoreResult` 失败（校验 / 安全副本 / 替换数据库）；
 * - `unknown`：意外异常（IPC reject 等），界面显示通用失败文案。
 */
export type RemoteRestoreFailure =
  | { source: 'onedrive'; code: OneDriveErrorCode }
  | { source: 'backup'; code: BackupErrorCode }
  | { source: 'unknown' }

export interface OneDriveRemoteActions {
  /** 重新读取远端备份列表（错误态「重试」入口）。 */
  refreshRemote: () => void
  /** 恢复指定远端备份：先统一落盘，再二次确认。 */
  restoreRemote: (itemId: string) => void
  /** 中断进行中的云端恢复（下载阶段生效）。 */
  cancelRestore: () => void
}

export interface OneDriveRemoteController {
  /** 云端备份列表三态。 */
  remoteStatus: RemoteBackupStatus
  /** 云端备份列表（按修改时间倒序）。 */
  remoteItems: RemoteBackupItem[]
  /** 远端列表读取失败码（与恢复失败分开）。 */
  remoteErrorCode: OneDriveErrorCode | null
  /** 云端恢复进行中，或已成功、等待主进程重启。 */
  restoreRunning: boolean
  /** 当前 / 最近一次恢复进度；无恢复时为 null。 */
  restoreProgress: OneDriveRestoreProgress | null
  /** 正在恢复的远端条目 id（进入页面时已在恢复则为 null）。 */
  restoringItemId: string | null
  /** 恢复失败（外层 OneDrive 错误优先，其次恢复域错误）。 */
  restoreFailure: RemoteRestoreFailure | null
  /** 用户主动取消恢复的提示（非错误）。 */
  restoreCancelled: boolean
  /** 登出时清空远端列表与恢复结果。 */
  resetRemote: () => void
  actions: OneDriveRemoteActions
}

/** 进入设置页时恢复已在运行：没有事件历史，先给一个下载阶段占位。 */
const INITIAL_RESTORE_PROGRESS: OneDriveRestoreProgress = {
  phase: 'download',
  bytesReceived: 0,
  totalBytes: 0,
  percent: 0
}

export interface UseOneDriveRemoteBackupsOptions {
  api: OneDriveApi | undefined
  /** 已登录且当前环境可解密凭据。 */
  signedIn: boolean
  /** 备份进行中：与恢复互斥。 */
  backupRunning: boolean
  /** 登录流程进行中：与恢复互斥。 */
  signingIn: boolean
  /** 进入页面时主进程报告恢复正在运行。 */
  statusRestoreRunning: boolean
  /** 主 hook 的确认框控制器（复用同一个 confirmNode）。 */
  requestConfirm: ConfirmController['request']
}

export function useOneDriveRemoteBackups(
  options: UseOneDriveRemoteBackupsOptions
): OneDriveRemoteController {
  const { api, signedIn, backupRunning, signingIn, statusRestoreRunning, requestConfirm } = options
  const { t } = useTranslation('onedrive')
  const flushAll = useFlushAllBeforeClose()

  const [remoteStatus, setRemoteStatus] = useState<RemoteBackupStatus>('idle')
  const [remoteItems, setRemoteItems] = useState<RemoteBackupItem[]>([])
  const [remoteErrorCode, setRemoteErrorCode] = useState<OneDriveErrorCode | null>(null)
  const [restoreActive, setRestoreActive] = useState(false)
  const [restoreSettled, setRestoreSettled] = useState(false)
  const [restoreProgressState, setRestoreProgressState] = useState<OneDriveRestoreProgress | null>(
    null
  )
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null)
  const [restoreFailure, setRestoreFailure] = useState<RemoteRestoreFailure | null>(null)
  const [restoreCancelled, setRestoreCancelled] = useState(false)

  /**
   * 进入设置页时主进程已报告恢复运行（`statusRestoreRunning`），但本页没有进度历史：
   * 用派生值显示占位进度并禁用操作；恢复失败 / 取消后 `restoreSettled` 解除。
   */
  const restoreRunning = restoreActive || (statusRestoreRunning && !restoreSettled)
  const restoreProgress = restoreProgressState ?? (restoreRunning ? INITIAL_RESTORE_PROGRESS : null)

  const mountedRef = useRef(true)
  /** flushAll 期间防重复进入恢复准备流程（确认框未弹出前）。 */
  const preparingRestoreRef = useRef(false)
  /** 本次页面是否持有 `restoreBackup` 的 invoke 结果（用于区分进入页面前已启动的恢复）。 */
  const restoreOwnedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /**
   * 读取远端列表（不先改状态，避免在 effect 内同步 setState）：
   * - `retry`：登录后首读 / 恢复失败后的刷新；
   * - `silent`：后台刷新，失败保留旧列表（不替换已展示内容）。
   */
  const loadRemote = useCallback(
    async (mode: 'retry' | 'silent'): Promise<void> => {
      if (!api) return

      try {
        const result = await api.listBackups()
        if (!mountedRef.current) return

        if (result.ok) {
          setRemoteItems(result.value)
          setRemoteStatus('ready')
          setRemoteErrorCode(null)
        } else {
          setRemoteErrorCode(result.code)
          if (mode !== 'silent') setRemoteStatus('error')
        }
      } catch {
        if (!mountedRef.current) return
        setRemoteErrorCode('list_failed')
        if (mode !== 'silent') setRemoteStatus('error')
      }
    },
    [api]
  )

  const resetRemote = useCallback((): void => {
    setRemoteStatus('idle')
    setRemoteItems([])
    setRemoteErrorCode(null)
    setRestoreFailure(null)
    setRestoreCancelled(false)
    setRestoringItemId(null)
    setRestoreActive(false)
    setRestoreSettled(false)
    setRestoreProgressState(null)
    restoreOwnedRef.current = false
  }, [])

  useEffect(() => {
    if (!signedIn || !api) return undefined
    let active = true

    // 登录后自动读取一次；setState 均在 await 之后，避免 effect 内同步级联渲染。
    void (async () => {
      try {
        const result = await api.listBackups()
        if (!active || !mountedRef.current) return
        if (result.ok) {
          setRemoteItems(result.value)
          setRemoteStatus('ready')
          setRemoteErrorCode(null)
        } else {
          setRemoteErrorCode(result.code)
          setRemoteStatus('error')
        }
      } catch {
        if (!active || !mountedRef.current) return
        setRemoteErrorCode('list_failed')
        setRemoteStatus('error')
      }
    })()

    return () => {
      active = false
    }
  }, [api, signedIn])

  // 恢复进度推送；`done` 表示已成功、主进程即将重启，保持禁用与重启提示。
  useEffect(() => {
    if (!api) return undefined
    return api.onRestoreProgress((next) => {
      setRestoreProgressState(next)
      setRestoreActive(true)
      setRestoreSettled(false)
    })
  }, [api])

  const runRestore = useCallback(
    async (itemId: string): Promise<void> => {
      if (!api) return

      setRestoreFailure(null)
      setRestoreCancelled(false)
      setRestoreActive(true)
      setRestoreSettled(false)
      setRestoringItemId(itemId)
      setRestoreProgressState(INITIAL_RESTORE_PROGRESS)
      restoreOwnedRef.current = true

      /** 失败 / 取消：解除运行态，允许用户重试。 */
      const settleFailure = (): void => {
        restoreOwnedRef.current = false
        setRestoreActive(false)
        setRestoreSettled(true)
        setRestoringItemId(null)
        setRestoreProgressState(null)
      }

      try {
        const result = await api.restoreBackup(itemId)
        if (!mountedRef.current) return

        if (!result.ok) {
          // 外层 OneDrive 域错误优先；条目已被远端删除时顺手刷新列表。
          if (result.code === 'aborted') {
            setRestoreCancelled(true)
          } else {
            setRestoreFailure({ source: 'onedrive', code: result.code })
            if (result.code === 'remote_not_found') void loadRemote('silent')
          }
          settleFailure()
          return
        }

        if (!result.value.ok) {
          // 内层恢复域错误（校验 / 安全副本 / 替换数据库）。
          if (result.value.code === 'canceled') {
            setRestoreCancelled(true)
          } else {
            setRestoreFailure({ source: 'backup', code: result.value.code })
          }
          settleFailure()
          return
        }

        // 成功：主进程会在 300ms 后重启，保持禁用与「正在恢复并重启…」。
        setRestoreProgressState((prev) => ({
          phase: 'done',
          bytesReceived: prev?.totalBytes ?? 0,
          totalBytes: prev?.totalBytes ?? 0,
          percent: 100
        }))
      } catch {
        if (!mountedRef.current) return
        setRestoreFailure({ source: 'unknown' })
        settleFailure()
      }
    },
    [api, loadRemote]
  )

  const restoreRemote = useCallback(
    (itemId: string): void => {
      if (
        !api ||
        !signedIn ||
        restoreRunning ||
        backupRunning ||
        signingIn ||
        preparingRestoreRef.current
      ) {
        return
      }
      const item = remoteItems.find((candidate) => candidate.itemId === itemId)
      if (!item) return

      preparingRestoreRef.current = true
      setRestoreFailure(null)
      setRestoreCancelled(false)

      void (async () => {
        // 1) 先统一落盘，确保未保存编辑不会在覆盖 + 重启中丢失。
        try {
          await flushAll()
        } finally {
          preparingRestoreRef.current = false
        }
        if (!mountedRef.current) return

        // 2) 二次确认（覆盖整库 / 自动安全副本 / 自动重启 / 未保存内容先保存）。
        requestConfirm(
          {
            title: t('remote.confirm.title'),
            message: [
              t('remote.confirm.cover', { name: item.name }),
              t('remote.confirm.safeCopy'),
              t('remote.confirm.restart'),
              t('remote.confirm.flush')
            ].join(' '),
            confirmText: t('remote.confirm.action'),
            tone: 'danger'
          },
          // 3) 确认后才真正下载并替换数据库；不 await，让确认框立即关闭、露出进度区。
          () => {
            void runRestore(itemId)
          }
        )
      })()
    },
    [
      api,
      backupRunning,
      flushAll,
      remoteItems,
      requestConfirm,
      restoreRunning,
      runRestore,
      signedIn,
      signingIn,
      t
    ]
  )

  const refreshRemote = useCallback((): void => {
    if (restoreRunning) return
    setRemoteStatus('loading')
    setRestoreFailure(null)
    setRestoreCancelled(false)
    void loadRemote('retry')
  }, [loadRemote, restoreRunning])

  const cancelRestore = useCallback((): void => {
    if (!api) return
    const owned = restoreOwnedRef.current
    void api
      .cancelRestore()
      .then((cancelled) => {
        // 进入页面前的恢复没有本地 invoke 结果可等待，取消成功后主动结算，
        // 避免 `status.restoreRunning` 一直把界面锁在运行态。
        if (!cancelled || owned || !mountedRef.current) return
        setRestoreCancelled(true)
        setRestoreActive(false)
        setRestoreSettled(true)
        setRestoreProgressState(null)
        setRestoringItemId(null)
      })
      .catch(() => {})
  }, [api])

  const actions = useMemo<OneDriveRemoteActions>(
    () => ({ refreshRemote, restoreRemote, cancelRestore }),
    [cancelRestore, refreshRemote, restoreRemote]
  )

  return {
    remoteStatus: signedIn ? (remoteStatus === 'idle' ? 'loading' : remoteStatus) : 'idle',
    remoteItems: signedIn ? remoteItems : [],
    remoteErrorCode: signedIn ? remoteErrorCode : null,
    restoreRunning,
    restoreProgress,
    restoringItemId,
    restoreFailure: signedIn ? restoreFailure : null,
    restoreCancelled: signedIn ? restoreCancelled : false,
    resetRemote,
    actions
  }
}

export default useOneDriveRemoteBackups

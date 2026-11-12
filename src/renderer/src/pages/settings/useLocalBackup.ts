/**
 * 设置页 · 本地备份 / 恢复状态机。
 *
 * 职责：
 * - 首次挂载读取备份列表（loading → error / ready）；
 * - 封装立即备份 / 从列表恢复 / 从文件恢复 / 导出整库 / 打开目录 / 删除；
 * - 所有写操作（含恢复）前先 `flushAll()` 统一落盘，避免未保存编辑丢失；
 * - 错误只保留主进程 `BackupErrorCode`，由组件经 `BACKUP_ERROR_KEYS` 走 i18n；
 * - `canceled` 是用户主动取消：不报错、不 toast、不改变列表。
 *
 * 恢复成功时主进程会在 300ms 后自动 `app.relaunch()` + `app.exit(0)`，
 * 本 hook 只保持 `busy='restoring'` + `restarting=true` 的禁用 / 提示态，
 * 不做跳转或自行重启。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { BackupErrorCode, BackupItem, BackupRestoreResult } from '../../../../main/backup'
import { useToast } from '../../components/ui'
import { useFlushAllBeforeClose } from '../../shell/beforeCloseFlush'
import { useConfirm } from '../writer/chapters/useConfirm'

/** 列表三态：loading 必须先于 error / empty 判断。 */
export type LocalBackupStatus = 'loading' | 'ready' | 'error'

/** 当前进行中的操作；`none` 之外全部禁用操作按钮。 */
export type LocalBackupBusy = 'none' | 'creating' | 'restoring' | 'exporting' | 'deleting'

/** 错误码 → `settings` ns 文案 key（覆盖主进程全部 14 个错误码）。 */
export const BACKUP_ERROR_KEYS = {
  backup_in_progress: 'data.error.backup_in_progress',
  snapshot_failed: 'data.error.snapshot_failed',
  invalid_file: 'data.error.invalid_file',
  corrupt: 'data.error.corrupt',
  copy_failed: 'data.error.copy_failed',
  safe_copy_failed: 'data.error.safe_copy_failed',
  restore_failed: 'data.error.restore_failed',
  invalid_name: 'data.error.invalid_name',
  not_found: 'data.error.not_found',
  list_failed: 'data.error.list_failed',
  delete_failed: 'data.error.delete_failed',
  export_failed: 'data.error.export_failed',
  open_failed: 'data.error.open_failed',
  canceled: 'data.error.canceled'
} as const satisfies Record<BackupErrorCode, string>

export interface LocalBackupActions {
  /** 重新读取列表（错误态「重试」入口）。 */
  refresh: () => void
  create: () => void
  /** 从列表恢复：先弹确认框，确认后落盘并覆盖整库。 */
  restore: (name: string) => void
  /** 从任意 `.db` 文件恢复：先弹确认框，确认后再弹系统文件选择框。 */
  restoreFile: () => void
  exportDb: () => void
  openFolder: () => void
  remove: (name: string) => void
}

export interface LocalBackupController {
  status: LocalBackupStatus
  items: BackupItem[]
  busy: LocalBackupBusy
  errorCode: BackupErrorCode | null
  /** 恢复已成功、等待主进程自动重启。 */
  restarting: boolean
  actions: LocalBackupActions
  /** 删除确认弹窗节点。 */
  confirmNode: ReactNode
  /** 操作提示节点。 */
  toastNode: ReactNode
}

type LoadMode = 'retry' | 'silent'

export function useLocalBackup(): LocalBackupController {
  const { t } = useTranslation('settings')
  const { show: showToast, node: toastNode } = useToast()
  const { request: requestConfirm, node: confirmNode } = useConfirm()
  const flushAll = useFlushAllBeforeClose()
  const api = window.api?.backup

  const [status, setStatus] = useState<LocalBackupStatus>(api ? 'loading' : 'error')
  const [items, setItems] = useState<BackupItem[]>([])
  const [busy, setBusyState] = useState<LocalBackupBusy>('none')
  const [errorCode, setErrorCode] = useState<BackupErrorCode | null>(api ? null : 'list_failed')
  const [restarting, setRestarting] = useState(false)

  const busyRef = useRef<LocalBackupBusy>('none')
  const mountedRef = useRef(true)

  const setBusy = useCallback((next: LocalBackupBusy): void => {
    busyRef.current = next
    setBusyState(next)
  }, [])

  /**
   * 读取列表（首次加载在 effect 内直接发起，避免在 effect 内同步 setState）。
   * - `retry`：错误态「重试」，失败切回 error；
   * - `silent`：写操作后的刷新，失败只保留旧列表并给出行内错误码（不替换内容）。
   */
  const load = useCallback(
    async (mode: LoadMode): Promise<void> => {
      if (!api) return

      try {
        const result = await api.list()
        if (!mountedRef.current) return

        if (result.ok) {
          setItems(result.items)
          setStatus('ready')
          setErrorCode(null)
        } else if (mode === 'silent') {
          setErrorCode(result.code)
        } else {
          setErrorCode(result.code)
          setStatus('error')
        }
      } catch {
        if (!mountedRef.current) return
        setErrorCode('list_failed')
        if (mode !== 'silent') setStatus('error')
      }
    },
    [api]
  )

  useEffect(() => {
    mountedRef.current = true

    if (api) {
      void (async () => {
        try {
          const result = await api.list()
          if (!mountedRef.current) return

          if (result.ok) {
            setItems(result.items)
            setStatus('ready')
            setErrorCode(null)
          } else {
            setErrorCode(result.code)
            setStatus('error')
          }
        } catch {
          if (!mountedRef.current) return
          setErrorCode('list_failed')
          setStatus('error')
        }
      })()
    }

    return () => {
      mountedRef.current = false
    }
  }, [api])

  const refresh = useCallback((): void => {
    if (!api) {
      setStatus('error')
      setErrorCode('list_failed')
      return
    }
    setStatus('loading')
    setErrorCode(null)
    void load('retry')
  }, [api, load])

  const create = useCallback((): void => {
    if (!api || busyRef.current !== 'none') return

    setErrorCode(null)
    setBusy('creating')

    void (async () => {
      try {
        await flushAll()
        const result = await api.create()
        if (!mountedRef.current) return

        if (result.ok) {
          showToast(t('data.create.successToast', { name: result.item.name }))
          await load('silent')
        } else if (result.code !== 'canceled') {
          setErrorCode(result.code)
        }
      } catch {
        if (mountedRef.current) setErrorCode('snapshot_failed')
      } finally {
        if (mountedRef.current) setBusy('none')
      }
    })()
  }, [api, flushAll, load, setBusy, showToast, t])

  /** 恢复公共流程：调用方已完成二次确认。成功时保持 restoring 直到进程重启。 */
  const runRestore = useCallback(
    async (task: () => Promise<BackupRestoreResult>): Promise<void> => {
      setErrorCode(null)
      setRestarting(false)
      setBusy('restoring')

      try {
        await flushAll()
        const result = await task()
        if (!mountedRef.current) return

        if (result.ok) {
          setRestarting(true)
          showToast(t('data.restore.successToast'))
          // 恢复会新增一份 pre-restore 安全副本，刷新列表后再等待主进程重启。
          await load('silent')
          // 不置回 none：主进程即将重启，保持全分区禁用 + 重启提示。
        } else {
          setBusy('none')
          if (result.code !== 'canceled') setErrorCode(result.code)
        }
      } catch {
        if (mountedRef.current) {
          setBusy('none')
          setErrorCode('restore_failed')
        }
      }
    },
    [flushAll, load, setBusy, showToast, t]
  )

  const restoreMessage = useCallback(
    (name?: string): string =>
      [
        name === undefined
          ? t('data.restore.confirmCoverFile')
          : t('data.restore.confirmCover', { name }),
        t('data.restore.confirmSafeCopy'),
        t('data.restore.confirmRestart'),
        t('data.restore.confirmFlush')
      ].join(' '),
    [t]
  )

  const restore = useCallback(
    (name: string): void => {
      if (!api || busyRef.current !== 'none') return

      requestConfirm(
        {
          title: t('data.restore.title'),
          message: restoreMessage(name),
          confirmText: t('data.restore.confirm'),
          tone: 'danger'
        },
        () => runRestore(() => api.restore(name))
      )
    },
    [api, requestConfirm, restoreMessage, runRestore, t]
  )

  const restoreFile = useCallback((): void => {
    if (!api || busyRef.current !== 'none') return

    requestConfirm(
      {
        title: t('data.restore.title'),
        message: restoreMessage(),
        confirmText: t('data.restore.confirm'),
        tone: 'danger'
      },
      () => runRestore(() => api.restoreFile())
    )
  }, [api, requestConfirm, restoreMessage, runRestore, t])

  const exportDb = useCallback((): void => {
    if (!api || busyRef.current !== 'none') return

    setErrorCode(null)
    setBusy('exporting')

    void (async () => {
      try {
        await flushAll()
        const result = await api.export()
        if (!mountedRef.current) return

        if (result.ok) {
          showToast(t('data.export.successToast'))
        } else if (result.code !== 'canceled') {
          setErrorCode(result.code)
        }
      } catch {
        if (mountedRef.current) setErrorCode('export_failed')
      } finally {
        if (mountedRef.current) setBusy('none')
      }
    })()
  }, [api, flushAll, setBusy, showToast, t])

  const openFolder = useCallback((): void => {
    if (!api || busyRef.current !== 'none') return

    setErrorCode(null)
    void api
      .openFolder()
      .then((result) => {
        if (!mountedRef.current) return
        if (result.ok) {
          showToast(t('data.location.successToast'))
        } else if (result.code !== 'canceled') {
          setErrorCode(result.code)
        }
      })
      .catch(() => {
        if (mountedRef.current) setErrorCode('open_failed')
      })
  }, [api, showToast, t])

  const remove = useCallback(
    (name: string): void => {
      if (!api || busyRef.current !== 'none') return

      requestConfirm(
        {
          title: t('data.backups.deleteConfirmTitle'),
          message: t('data.backups.deleteConfirmMessage', { name }),
          confirmText: t('data.backups.delete'),
          tone: 'danger'
        },
        async () => {
          setErrorCode(null)
          setBusy('deleting')

          try {
            const result = await api.delete(name)
            if (!mountedRef.current) return

            if (result.ok) {
              showToast(t('data.backups.deletedToast', { name }))
              await load('silent')
            } else if (result.code !== 'canceled') {
              setErrorCode(result.code)
            }
          } catch {
            if (mountedRef.current) setErrorCode('delete_failed')
          } finally {
            if (mountedRef.current) setBusy('none')
          }
        }
      )
    },
    [api, load, requestConfirm, setBusy, showToast, t]
  )

  return {
    status,
    items,
    busy,
    errorCode,
    restarting,
    actions: { refresh, create, restore, restoreFile, exportDb, openFolder, remove },
    confirmNode,
    toastNode
  }
}

export default useLocalBackup

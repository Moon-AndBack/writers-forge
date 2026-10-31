import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ConfirmDialog } from '../ConfirmDialog'

interface PendingConfirm {
  title: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'default'
  run: () => void | Promise<void>
}

export interface ConfirmController {
  /** 弹出确认框；用户点确认后执行 `run`（可为 async，执行期间按钮呈 loading）。 */
  request: (options: Omit<PendingConfirm, 'run'>, run: () => void | Promise<void>) => void
  /** 需挂载到组件树中的弹窗节点（挂在组件 return 内即可）。 */
  node: ReactNode
}

/**
 * 命令式确认框控制器：`const confirm = useConfirm()` → `confirm.request({...}, () => …)`
 * 触发，`{confirm.node}` 渲染弹窗。用于章节树 hover 删除（组件在列表递归中，
 * 集中持有一个弹窗实例，避免每行各挂一个 Modal）。
 */
export function useConfirm(): ConfirmController {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const request = useCallback(
    (options: Omit<PendingConfirm, 'run'>, run: () => void | Promise<void>): void => {
      setPending({ ...options, run })
    },
    []
  )

  const close = useCallback((): void => {
    if (busyRef.current) return
    setPending(null)
  }, [])

  const confirm = useCallback(async (): Promise<void> => {
    const current = pending
    if (!current || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await current.run()
      setPending(null)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [pending])

  const node = (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ''}
      message={pending?.message}
      confirmText={pending?.confirmText}
      cancelText={pending?.cancelText}
      tone={pending?.tone ?? 'danger'}
      confirming={busy}
      onConfirm={() => {
        void confirm()
      }}
      onClose={close}
    />
  )

  return { request, node }
}

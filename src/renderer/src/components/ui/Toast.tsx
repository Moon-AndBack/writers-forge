import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../../styles/components/toast.css'

/** 默认展示时长（毫秒）与退场淡出时长。 */
const DEFAULT_DURATION = 2600
const FADE_DURATION = 200

interface ToastState {
  message: string
  /** 退场中：透明度淡出，结束后卸载。 */
  leaving: boolean
}

export interface ToastController {
  /** 展示一条简短提示（覆盖上一条并重新计时）。 */
  show: (message: string) => void
  /** 需挂载到组件树中的提示节点（挂在组件 return 内即可）。 */
  node: ReactNode
}

/**
 * 轻量 Toast 提示控制器（命令式）：`const toast = useToast()` →
 * `toast.show('已删除《书名》')` 触发，`{toast.node}` 渲染提示。
 *
 * 说明：本项目其余 UI 组件均为「组件 + props」形态，此处出于调用便利与
 * 与 `pages/writer/chapters/useConfirm` 一致，采用 hook 形态；样式与
 * `surface.css` 的 Modal / 卡片同源（`--pane` 底 + `--sh-float` + 描边环）。
 * 浮层经 `createPortal` 挂到 `document.body`，`document` 不存在时返回 null；
 * 淡入淡出仅用 opacity，不做位移 / 缩放。
 */
export function useToast(duration = DEFAULT_DURATION): ToastController {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timersRef = useRef<number[]>([])

  const clearTimers = useCallback((): void => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
  }, [])

  const show = useCallback(
    (message: string): void => {
      clearTimers()
      setToast({ message, leaving: false })
      timersRef.current.push(
        window.setTimeout(() => {
          setToast((current) => (current ? { ...current, leaving: true } : current))
          timersRef.current.push(window.setTimeout(() => setToast(null), FADE_DURATION))
        }, duration)
      )
    },
    [clearTimers, duration]
  )

  // 卸载时清理定时器，避免对已卸载组件 setState。
  useEffect(() => clearTimers, [clearTimers])

  const node =
    toast && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={toast.leaving ? 'wf-toast is-leaving' : 'wf-toast'}
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </div>,
          document.body
        )
      : null

  return { show, node }
}

export default useToast

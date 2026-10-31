import { useCallback, useEffect, useRef, useState } from 'react'
import { POPOVER_HIDE_DELAY } from './popoverTiming'

/**
 * 「+N」溢出浮窗的默认收起延迟（毫秒）：给「计数胶囊 → 浮窗」的往返移动留余量，
 * 取通用浮层隐藏延迟（与悬停卡 / 关系胶囊同口径）。
 */
const DEFAULT_CLOSE_DELAY = POPOVER_HIDE_DELAY

/** `useOverflowPopup` 的返回值：锚点胶囊 + 开合控制。 */
export interface UseOverflowPopupResult {
  /** 当前浮窗锚点胶囊（null = 未打开）。 */
  anchor: HTMLElement | null
  /** 悬停「+N」：立即打开（并取消挂起收起）。 */
  open: (el: HTMLElement) => void
  /** 取消挂起收起（浮窗 onPointerEnter 用）。 */
  cancelClose: () => void
  /** 延迟收起（离开「+N」或浮窗用）。 */
  scheduleClose: () => void
}

/**
 * 开合控制器子集：供需要「从外部保持浮窗打开 / 收起」的调用方使用
 * （如档案卡关系行的第二层详情卡悬停时，避免浮窗被自己的收起计时关掉）。
 */
export type OverflowPopupControl = Pick<UseOverflowPopupResult, 'cancelClose' | 'scheduleClose'>

/**
 * 「+N」浮窗状态机（跨场景复用）：锚点胶囊 + 「悬停即开 / 延时收起」的往返定时器。
 *
 * 收敛自实体悬停卡关系行（`EntityCardRelations`）的本地实现，档案卡关系行与剧情场景卡
 * 后续复用同一套语义：`open` 等价于旧实现的「取消挂起收起 + 写入锚点」；浮窗自身
 * `onPointerEnter` 调 `cancelClose`、`onPointerLeave` 调 `scheduleClose`
 * （portal 在卡片外，离开「+N」进浮窗会先触发「+N」的 mouseleave）。
 *
 * 卸载时清理挂起定时器，避免对已卸载组件 setState。
 */
export function useOverflowPopup(closeDelay: number = DEFAULT_CLOSE_DELAY): UseOverflowPopupResult {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  /** 取消「+N」浮窗的挂起收起。 */
  const cancelClose = useCallback((): void => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  /** 离开「+N」或浮窗：延迟收起，给「胶囊 → 浮窗」的往返移动留余量。 */
  const scheduleClose = useCallback((): void => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setAnchor(null)
    }, closeDelay)
  }, [closeDelay])

  /** 悬停「+N」：立即打开（先取消可能仍在挂起的收起）。 */
  const open = useCallback(
    (el: HTMLElement): void => {
      cancelClose()
      setAnchor(el)
    },
    [cancelClose]
  )

  // 卸载清理挂起收起
  useEffect(() => cancelClose, [cancelClose])

  return { anchor, open, cancelClose, scheduleClose }
}

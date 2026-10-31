import { useCallback, useEffect, useRef, useState } from 'react'
import { ENTITY_HOVER_HIDE_DELAY } from '../../../components/popoverTiming'
import type { HoverAnchor } from './HoverCard'

/* ---------- 实体高亮悬停（事件委托在容器上；章节正文 / 剧情胶囊共用） ---------- */

/**
 * 悬停高亮 span：解析 `data-entity-id` 并计算锚点矩形。
 *
 * 事件经容器委托（章节编辑器 DOM 事件 / 剧情胶囊列表 `onMouseOver`），
 * 由 `event.target.closest('span[data-entity-id]')` 定位命中的实体 span。
 * portal 浮窗（如「＋N」收口列表）不在此事件树内，需调用 `showFor` 显式给出锚点；
 * 悬停卡自身需接 `cancelHide` / `onMouseLeave`，否则鼠标移入卡片会被隐藏计时关掉。
 */
export function useEntityHover() {
  const [anchor, setAnchor] = useState<HoverAnchor | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  /** 清掉挂起的隐藏计时（`null` 视为空闲）。 */
  const clearHideTimer = useCallback((): void => {
    if (hideTimerRef.current === null) return
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
  }, [])

  const handleOver = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      const target = event.target as HTMLElement
      const span = target.closest<HTMLElement>('span[data-entity-id]')
      if (!span) return
      clearHideTimer()
      const entityId = Number(span.dataset.entityId)
      if (!Number.isInteger(entityId)) return
      setAnchor({ rect: span.getBoundingClientRect(), entityId })
    },
    [clearHideTimer]
  )

  /**
   * 显式展示某实体的悬停卡：供 portal 浮窗内的胶囊使用（事件不冒泡到委托容器）。
   * 与 `handleOver` 同口径，但锚点由调用方给出（`anchorEl` 为活元素，滚动跟随有效）。
   */
  const showFor = useCallback(
    (el: HTMLElement, entityId: number): void => {
      clearHideTimer()
      if (!Number.isInteger(entityId) || entityId <= 0) return
      setAnchor({ rect: el.getBoundingClientRect(), entityId, anchorEl: el })
    },
    [clearHideTimer]
  )

  const scheduleHide = useCallback((): void => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      setAnchor(null)
    }, ENTITY_HOVER_HIDE_DELAY)
  }, [])

  /** 取消挂起的隐藏（鼠标从锚点移入悬停卡时调用，避免卡片被隐藏计时关掉）。 */
  const cancelHide = useCallback((): void => {
    clearHideTimer()
  }, [clearHideTimer])

  // 卸载清理
  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    }
  }, [])

  const close = useCallback((): void => setAnchor(null), [])

  return {
    anchor,
    onMouseOver: handleOver,
    onMouseLeave: scheduleHide,
    close,
    showFor,
    cancelHide
  }
}

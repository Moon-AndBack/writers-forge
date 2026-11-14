import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import '../../styles/components/tooltip.css'

/**
 * tooltip 首选方向。最终方向会在运行时按视口空间自动避让调整。
 * - top / bottom：水平居中于锚点，垂直贴锚点上方 / 下方（标题栏、书架工具条等）；
 * - right / left：垂直居中于锚点，水平贴锚点右侧 / 左侧（活动栏模块按钮等）。
 */
export type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left'

export interface UseTooltipOptions {
  /** 提示文本；为空字符串时不显示（便于由 props 动态决定）。 */
  content: string
  /** 首选方向，默认 bottom（标题栏场景）。 */
  placement?: TooltipPlacement
  /** 禁用时始终不显示（如按钮禁用态）。 */
  disabled?: boolean
  /** 显示延迟（ms），避免鼠标扫过即闪；默认 350。 */
  showDelay?: number
  /** 隐藏延迟（ms），默认 60。 */
  hideDelay?: number
}

/** 需挂到锚点元素上的交互属性（不包含 ref，ref 由调用方选择是否与其合并）。 */
export interface TooltipAnchorProps {
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  'aria-describedby': string | undefined
}

export interface UseTooltipResult<T extends HTMLElement = HTMLElement> {
  /** 锚点引用：把其挂到触发元素上（`ref={anchorRef}`），供定位测量。 */
  anchorRef: RefObject<T | null>
  /** 锚点交互属性：展开写法 `{...anchorProps}` 挂到按钮 / 元素上。 */
  anchorProps: TooltipAnchorProps
  /** 提示浮层节点（经 createPortal 挂到 body），无内容时为 null。 */
  tooltip: ReactNode
  /** 取消尚未触发的显示计时（不改变当前可见状态）。 */
  cancelShow: () => void
}

const GAP = 8
const PAD = 6

interface TipPosition {
  x: number
  y: number
  placement: TooltipPlacement
}

/**
 * 计算浮层坐标：以首选方向起算，四方向中优先选「完全不越界」者，
 * 否则取越界最小者，最后把坐标夹取回视口内，实现边缘自动避让。
 */
function computePosition(
  anchor: DOMRect,
  width: number,
  height: number,
  preferred: TooltipPlacement
): TipPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight

  const coordsFor = (placement: TooltipPlacement): { x: number; y: number } => {
    switch (placement) {
      case 'top':
        return { x: anchor.left + anchor.width / 2 - width / 2, y: anchor.top - height - GAP }
      case 'bottom':
        return { x: anchor.left + anchor.width / 2 - width / 2, y: anchor.bottom + GAP }
      case 'left':
        return { x: anchor.left - width - GAP, y: anchor.top + anchor.height / 2 - height / 2 }
      case 'right':
      default:
        return { x: anchor.right + GAP, y: anchor.top + anchor.height / 2 - height / 2 }
    }
  }

  const overflowOf = (placement: TooltipPlacement): number => {
    const { x, y } = coordsFor(placement)
    return (
      (x < PAD ? 1 : 0) +
      (x + width > vw - PAD ? 1 : 0) +
      (y < PAD ? 1 : 0) +
      (y + height > vh - PAD ? 1 : 0)
    )
  }

  const order: TooltipPlacement[] = [
    preferred,
    ...(['top', 'bottom', 'right', 'left'] as TooltipPlacement[]).filter(
      (item) => item !== preferred
    )
  ]
  let chosen = preferred
  let bestOverflow = Number.POSITIVE_INFINITY
  for (const placement of order) {
    const overflow = overflowOf(placement)
    if (overflow < bestOverflow) {
      bestOverflow = overflow
      chosen = placement
    }
    if (overflow === 0) break
  }

  const { x, y } = coordsFor(chosen)
  const clampedX = Math.min(Math.max(x, PAD), Math.max(PAD, vw - width - PAD))
  const clampedY = Math.min(Math.max(y, PAD), Math.max(PAD, vh - height - PAD))
  return { x: clampedX, y: clampedY, placement: chosen }
}

/**
 * 自绘 tooltip：hover / focus 显示、mouseleave / blur 隐藏，带显示 / 隐藏延迟；
 * 浮层经 createPortal 挂到 document.body（fixed 定位），按锚点矩形与视口空间
 * 自动避让边缘。样式见 styles/components/tooltip.css，纯令牌、四主题自适应。
 *
 * 用法：
 *   const { anchorRef, anchorProps, tooltip } = useTooltip({ content: label })
 *   return (<>{tooltip}<button ref={anchorRef} {...anchorProps}>…</button></>)
 *
 * 说明：`anchorProps` 不含 ref，调用方需把 `anchorRef` 挂到锚点元素上
 * （`IconButton` 内部会把转发 ref 与该 anchorRef 合并）。
 */
export function useTooltip<T extends HTMLElement = HTMLElement>(
  options: UseTooltipOptions
): UseTooltipResult<T> {
  const {
    content,
    placement = 'bottom',
    disabled = false,
    showDelay = 350,
    hideDelay = 60
  } = options

  const anchorRef = useRef<T | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const showTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const reactId = `wf-tooltip-${useId().replace(/:/g, '')}`
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<TipPosition | null>(null)

  const clearTimers = useCallback((): void => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current)
      showTimer.current = null
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const show = useCallback((): void => {
    if (disabled || !content) return
    clearTimers()
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null
      setPos(null)
      setVisible(true)
    }, showDelay)
  }, [clearTimers, content, disabled, showDelay])

  /** 只取消尚未触发的显示计时，不影响已显示状态（调用方可主动让位给同级浮层）。 */
  const cancelShow = useCallback((): void => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current)
      showTimer.current = null
    }
  }, [])

  const hide = useCallback((): void => {
    clearTimers()
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null
      setVisible(false)
    }, hideDelay)
  }, [clearTimers, hideDelay])

  // 窗口失焦（Alt+Tab / 最小化）：鼠标快速移出窗口可能丢 mouseleave，统一收起避免残留。
  useEffect(() => {
    const onBlur = (): void => hide()
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [hide])

  // 内容被清空 / 禁用时收起：在微任务中更新，避免在 effect 体内同步 setState
  // （react-hooks/set-state-in-effect）。定时器同步清理。
  useEffect(() => {
    if (!disabled && content) return undefined
    clearTimers()
    const id = window.setTimeout(() => setVisible(false), 0)
    return () => window.clearTimeout(id)
  }, [clearTimers, content, disabled])

  // 卸载清理定时器。
  useEffect(() => clearTimers, [clearTimers])

  // 测量并定位：浮层挂载后 + 滚动 / 缩放时重算。
  useEffect(() => {
    if (!visible) return undefined
    const reposition = (): void => {
      const anchor = anchorRef.current
      const tip = tipRef.current
      if (!anchor || !tip) return
      const rect = anchor.getBoundingClientRect()
      const next = computePosition(rect, tip.offsetWidth, tip.offsetHeight, placement)
      setPos(next)
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [visible, placement])

  const anchorProps: TooltipAnchorProps = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    'aria-describedby': content ? reactId : undefined
  }

  let tooltip: ReactNode = null
  if (visible && content && typeof document !== 'undefined') {
    tooltip = createPortal(
      <div
        ref={tipRef}
        id={reactId}
        role="tooltip"
        className={`wf-tooltip${pos ? ' is-ready' : ''}`}
        style={pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : { left: 0, top: 0 }}
      >
        {content}
      </div>,
      document.body
    )
  }

  return { anchorRef, anchorProps, tooltip, cancelShow }
}

export default useTooltip

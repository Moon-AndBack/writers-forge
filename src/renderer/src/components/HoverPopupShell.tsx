import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, MouseEventHandler, ReactElement, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CARD_WIDTH, computeCardPosition, computeMorePosition } from './popoverGeometry'
import { findAboveAnchorPopover, subscribeAboveAnchorPopover } from './popoverStack'

export interface HoverPopupShellProps {
  /** 锚点矩形（活元素断开时的兜底快照）。 */
  anchorRect: DOMRect
  /**
   * 锚点活元素：连通时优先按其最新视口矩形定位（滚动 / 重排跟随）；
   * 断开或未传时用 `anchorRect` 快照。
   */
  anchorEl?: HTMLElement | null
  /** 定位算法选择：`card` = 悬停卡式（居中/右侧），`more` = 「+N」浮窗式（左对齐锚点）。 */
  variant?: 'card' | 'more'
  /**
   * `card` 变体的定位方向（`more` 变体忽略）：
   * `above` = 贴锚点上方（上方不足翻到下方）；`below` = 贴锚点下方（下方不足翻到上方）；
   * `right` = 贴锚点右侧（右侧不足改下方 / 上方）。
   */
  placement?: 'above' | 'below' | 'right'
  /**
   * `card` 变体的水平基准（`more` 变体忽略，其定位本就左对齐锚点）：
   * `center` = 居中于锚点（默认，原有行为）；`left` = 左缘贴锚点左缘。
   * 用于「上下叠放的两个浮窗左边缘对齐」（实体悬停卡 + 伏笔提示）。
   */
  align?: 'center' | 'left'
  /**
   * 是否为其上方已显示的「贴锚点浮窗」（伏笔悬停提示，见 `popoverStack`）让位（默认 false）：
   * true 时按该浮窗实测高度把本浮窗叠放到它上方（层间间隔 `STACKED_POPOVER_GAP`），
   * 它已翻到锚点下方时本浮窗翻下则叠放到它下方 —— 两者不重叠，也不遮挡标记行。
   * 默认关闭，`PlotSceneHoverCard` / `ActivityBarFilterPopover` / `EntityCardMorePopup` 行为不变。
   */
  stackAbove?: boolean
  /**
   * 是否承接鼠标：false 时补内联 `pointer-events: none`。
   * 现有三个浮层均未传 false —— 剧情正文浮窗的 `pointer-events: none` 已由
   * `.rp-plot-hover` 的 CSS 声明，此处不重复设置（避免内联样式覆盖后续 CSS 调整）。
   */
  interactive?: boolean
  /** 浮层根节点类名（`.entity-card` / `.entity-card-more` / `.rp-plot-hover`）。 */
  className: string
  /**
   * 内联宽度（浮层宽度固定时传，如悬停卡 340）；不传则交给 CSS。
   * 仅决定内联宽度：定位宽度一律取浮层实测 `offsetWidth`（与改造前逐字一致，
   * 视口变窄被 `max-width` 夹小、或剧情浮窗 360px 都按实测值参与钳制）。
   */
  width?: number
  /** role 属性（默认 'tooltip'）。 */
  role?: string
  /** 浮层内容变化时触发重新定位（如「+N」浮窗条目变化会改变高度）。 */
  contentKey?: unknown
  onPointerEnter?: MouseEventHandler<HTMLDivElement>
  onPointerLeave?: MouseEventHandler<HTMLDivElement>
  /**
   * 浮层根节点回调 ref（可选）：调用方若需在浮层上做额外测量（如悬停卡用
   * ResizeObserver 取内容宽），经此拿到同一个 DOM 节点，无需再套一层包裹元素。
   * 有意只收函数式 ref —— Shell 不写调用方的 ref 对象（本仓 `react-hooks/immutability`
   * 禁止改 props），写入由调用方自己在回调里完成。
   */
  elementRef?: (node: HTMLDivElement | null) => void
  children: ReactNode
}

/**
 * 浮层宿主外壳（portal + fixed 定位 + 跟随重定位）。
 *
 * 收敛自三处逐字同型的宿主逻辑：
 * - 实体悬停卡 `HoverCard`（`.entity-card`，`above`，定宽 340，可交互）；
 * - 「+N」关系浮窗 `EntityCardMorePopup`（`.entity-card-more`，`more`，宽度随内容，可交互）；
 * - 剧情正文浮窗 `PlotSceneHoverCard`（`.rp-plot-hover`，`right`，宽度由 CSS 定 360，`pointer-events: none`）。
 *
 * 本组件只负责「挂到 body 上、量尺寸、摆位置、跟随滚动 / 缩放」，
 * **不接管**开合状态、关闭计时与内容渲染 —— 那些留在各浮层内部。
 *
 * 事件绑定沿用改造前的鼠标事件（`mouseenter` / `mouseleave`）：prop 名保留
 * `onPointer*` 以对齐调用方「进入 / 离开」语义，但不用 pointer 事件，
 * 以免触摸 / 笔输入在 `pointerenter` 上多触发一次开合。
 */
export function HoverPopupShell({
  anchorRect,
  anchorEl,
  variant = 'card',
  placement = 'above',
  align = 'center',
  stackAbove = false,
  interactive = true,
  className,
  width,
  role = 'tooltip',
  contentKey,
  onPointerEnter,
  onPointerLeave,
  elementRef,
  children
}: HoverPopupShellProps): ReactElement {
  const nodeRef = useRef<HTMLDivElement | null>(null)

  /** 内部测量用 ref：与调用方的回调 ref 合并（调用方回调只拿节点，不参与定位）。 */
  const setNodeRef = useCallback(
    (node: HTMLDivElement | null): void => {
      nodeRef.current = node
      elementRef?.(node)
    },
    [elementRef]
  )

  /**
   * 视觉重定位（实测口径）：按浮层真实尺寸写 ref 样式，不经 state
   * （规避 effect 内同步 setState）。锚点活元素连通时按其最新视口矩形、
   * 否则回退 `anchorRect` 快照。
   */
  const reposition = useCallback((): void => {
    const node = nodeRef.current
    if (!node) return
    const rect = anchorEl?.isConnected ? anchorEl.getBoundingClientRect() : anchorRect
    const height = node.offsetHeight
    const measuredWidth = node.offsetWidth
    // 上方相邻浮窗（伏笔提示）：只在需要让位时查；方位按「是否整个落在锚点下方」判定，
    // 让位量用实测高度（与滚动无关，见 `StackedNeighbor`）。
    const neighborRect = stackAbove ? findAboveAnchorPopover(node) : null
    const neighbor =
      neighborRect === null
        ? null
        : {
            height: neighborRect.height,
            side: neighborRect.top >= rect.bottom ? ('below' as const) : ('above' as const)
          }
    const position =
      variant === 'more'
        ? computeMorePosition(rect, measuredWidth, height)
        : computeCardPosition(
            rect,
            height,
            measuredWidth || width || CARD_WIDTH,
            placement,
            align,
            neighbor
          )
    node.style.left = `${position.left}px`
    node.style.top = `${position.top}px`
  }, [align, anchorEl, anchorRect, placement, stackAbove, variant, width])

  // 首帧绘制前定位；内容变化（contentKey 变）后重测，覆盖加载态 → 详情等高度变化。
  useLayoutEffect(() => {
    reposition()
  }, [reposition, contentKey])

  // 滚动 / 缩放跟随锚点（capture 捕获内层滚动容器的滚动事件）。
  useEffect(() => {
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [reposition])

  // 上方相邻浮窗（伏笔提示）挂载 / 卸载 → 立即按新的让位量重定位（不必等下一次滚动）。
  useEffect(() => {
    if (!stackAbove) return undefined
    return subscribeAboveAnchorPopover(reposition)
  }, [stackAbove, reposition])

  const style: CSSProperties = { left: 0, top: 0 }
  if (width !== undefined) style.width = width
  if (interactive === false) style.pointerEvents = 'none'

  // portal 到 body：脱离祖先 transform / overflow 链，按视口坐标定位且不被浮层自身裁剪。
  return createPortal(
    <div
      ref={setNodeRef}
      className={className}
      role={role}
      style={style}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      {children}
    </div>,
    document.body
  )
}

export default HoverPopupShell

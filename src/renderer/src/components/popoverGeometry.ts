/**
 * 浮层几何：视口边距 / 锚点间隙 / 定位算法，供悬停卡与「+N」浮窗共用。
 *
 * - `computeCardPosition`：实体悬停卡（默认 `above`：水平居中、上方优先）与剧情正文浮窗
 *   （`right`：优先贴锚点右侧）共用；
 * - `computeMorePosition`：「+N」关系浮窗（左对齐锚点）。
 *
 * 两者尺寸均由调用方传入实测值（「渲染后测量再定位」口径），本模块不估高。
 */

/**
 * 浮层宽度（定宽，内联写入）；高度不再估算，改为渲染后实测。
 * 340 给关系胶囊留足一行 2~3 条的空间，减少第四行换行行数。
 */
export const CARD_WIDTH = 340

/**
 * 浮层与视口边缘的间距（px）。
 *
 * 原 `HoverCard` 的 `CARD_MARGIN` 与原 `EntityCardMorePopup` 的 `VIEWPORT_MARGIN` 数值与语义
 * 完全一致（均为 fixed 定位浮层的视口钳制边距），故合并为本常量；CSS 侧 `.entity-card` /
 * `.rp-plot-hover` 的 `max-width: calc(100vw - 20px)` 即 2 × 本值。
 */
export const POPOVER_VIEWPORT_MARGIN = 10

/** 锚点与「+N」浮窗之间的垂直间隙（px）。 */
export const ANCHOR_GAP = 6

/**
 * 「实体悬停卡 + 伏笔悬停提示」上下堆叠时两者的垂直间隙（px）。
 *
 * 只作用于堆叠路径（`computeCardPosition` 的 `neighbor.side === 'above'` 分支）：
 * 上层浮窗底边 = 下层浮窗顶边 − 本值。单侧显示时 `neighbor` 为 null，本值不参与计算，
 * 浮层相对锚点的位置与改造前一致（不会整体下移）。
 */
export const STACKED_POPOVER_GAP = 8

/** 固定态活动栏占位：左缘 8 + 栏宽 48 + 与浮窗间距 8 = 64px（同 shell.css 几何口径）。 */
const ACTIVITY_BAR_PINNED_INSET = 64

/** 浮窗左边界下限：固定态让开活动栏（64px），悬浮态仅保留视口边距。 */
function hoverCardLeftInset(): number {
  return document.body.classList.contains('act-pinned')
    ? ACTIVITY_BAR_PINNED_INSET
    : POPOVER_VIEWPORT_MARGIN
}

/** 水平钳制：把目标左缘夹在 `[minLeft, maxLeft]` 内（居中 / 左对齐两条分支共用）。 */
function clampLeft(left: number, minLeft: number, maxLeft: number): number {
  return Math.min(Math.max(left, minLeft), maxLeft)
}

/**
 * 上方堆叠的相邻浮窗（可选）：供 `above` 放置的上层浮窗（实体悬停卡）让位。
 *
 * 只取「实测高度 + 相对锚点的上下方位」，**不取它的 top / bottom**：高度与滚动无关，
 * 按高度计算可避免「两个浮窗各挂一个 scroll 监听、上层先跑读到下层上一帧位置」造成
 * 的整段滚动错位；方位只用于判断它是否已翻到锚点下方（决定让位还是避让）。
 * 前提：相邻浮窗与本浮窗由同一指针悬停触发，两者锚点同处一行 —— 此时
 * 「让位量 = 相邻浮窗高度 + 间距」正是它的实际顶边关系（它自己也是贴锚点上方一个间距）。
 */
export interface StackedNeighbor {
  /** 相邻浮窗实测高度（px）。 */
  height: number
  /** 相邻浮窗相对本浮窗锚点的位置：`above` = 贴锚点上方；`below` = 已翻到锚点下方。 */
  side: 'above' | 'below'
}

/**
 * 计算弹窗 fixed 定位（视口坐标系）：`above` 底边距锚点 POPOVER_VIEWPORT_MARGIN、上方不足改放下方；
 * `below` 顶边贴锚点下方（同间距）、下方不足改上方、上下都不够则贴底夹紧；
 * `right` 优先贴锚点右侧，右侧不足改下方 / 上方。水平默认居中并按视口边界钳制。
 * `align` 选择水平基准：`center` = 居中于锚点（默认，原有行为）；`left` = 左缘贴锚点左缘，
 * 供「上下叠放的两个浮窗（实体卡 + 伏笔提示）左边缘对齐」使用。两者都走同一套钳制。
 * `neighbor` 见 {@link StackedNeighbor}：`above` 分支据此把本浮窗叠放到相邻浮窗之上
 * （相邻浮窗翻到锚点下方时改叠放到它下方），`above` 分支的层间间隔为 STACKED_POPOVER_GAP；
 * 其余分支忽略该参数（既有消费者行为不变）。
 * 尺寸由调用方传入实测值（对齐「渲染后测量再定位」口径）。
 */
export function computeCardPosition(
  rect: DOMRect,
  height: number,
  width: number = CARD_WIDTH,
  placement: 'above' | 'below' | 'right' = 'above',
  align: 'center' | 'left' = 'center',
  neighbor: StackedNeighbor | null = null
): { left: number; top: number } {
  const minLeft = hoverCardLeftInset()
  const maxLeft = Math.max(minLeft, window.innerWidth - width - POPOVER_VIEWPORT_MARGIN)
  // 水平基准左缘：居中取锚点中心减半宽，左对齐直接取锚点左缘。
  const baseLeft = align === 'left' ? rect.left : rect.left + rect.width / 2 - width / 2
  if (placement === 'below') {
    const left = clampLeft(baseLeft, minLeft, maxLeft)
    const below = rect.bottom + POPOVER_VIEWPORT_MARGIN
    const above = rect.top - POPOVER_VIEWPORT_MARGIN - height
    const top =
      below + height <= window.innerHeight - POPOVER_VIEWPORT_MARGIN
        ? below
        : above >= POPOVER_VIEWPORT_MARGIN
          ? above
          : Math.max(POPOVER_VIEWPORT_MARGIN, window.innerHeight - height - POPOVER_VIEWPORT_MARGIN)
    return { left: Math.round(left), top: Math.round(top) }
  }
  if (placement === 'right') {
    const toRight = Math.max(rect.right + POPOVER_VIEWPORT_MARGIN, minLeft)
    if (toRight + width + POPOVER_VIEWPORT_MARGIN <= window.innerWidth) {
      const maxTop = Math.max(
        POPOVER_VIEWPORT_MARGIN,
        window.innerHeight - height - POPOVER_VIEWPORT_MARGIN
      )
      const top = Math.min(Math.max(rect.top, POPOVER_VIEWPORT_MARGIN), maxTop)
      return { left: Math.round(toRight), top: Math.round(top) }
    }
    // 右侧空间不足：改放锚点下方（水平按 align 基准并夹紧）；下方也不够时上翻，仍不够则夹紧。
    const left = clampLeft(baseLeft, minLeft, maxLeft)
    const below = rect.bottom + POPOVER_VIEWPORT_MARGIN
    const above = rect.top - POPOVER_VIEWPORT_MARGIN - height
    const top =
      below + height <= window.innerHeight - POPOVER_VIEWPORT_MARGIN
        ? below
        : above >= POPOVER_VIEWPORT_MARGIN
          ? above
          : Math.max(POPOVER_VIEWPORT_MARGIN, window.innerHeight - height - POPOVER_VIEWPORT_MARGIN)
    return { left: Math.round(left), top: Math.round(top) }
  }
  const left = clampLeft(baseLeft, minLeft, maxLeft)
  // 上方堆叠：相邻浮窗贴锚点上方时让位（本浮窗底边 = 其顶边 − STACKED_POPOVER_GAP）；
  // 相邻浮窗已翻到锚点下方时本浮窗不上移，若也翻下则叠放到它下方，保证两者不重叠。
  const stackedAbove = neighbor !== null && neighbor.side === 'above' ? neighbor.height : 0
  const stackGap = neighbor !== null && neighbor.side === 'above' ? STACKED_POPOVER_GAP : 0
  const above = rect.top - POPOVER_VIEWPORT_MARGIN - height - stackedAbove - stackGap
  const belowBase = rect.bottom + POPOVER_VIEWPORT_MARGIN
  const below =
    neighbor !== null && neighbor.side === 'below'
      ? belowBase + neighbor.height + POPOVER_VIEWPORT_MARGIN
      : belowBase
  const top =
    above >= POPOVER_VIEWPORT_MARGIN
      ? above
      : Math.min(below, window.innerHeight - height - POPOVER_VIEWPORT_MARGIN)
  return { left: Math.round(left), top: Math.round(Math.max(top, POPOVER_VIEWPORT_MARGIN)) }
}

/**
 * 「+N」浮窗定位（视口坐标）：
 * - 水平左对齐锚点，并在 `[POPOVER_VIEWPORT_MARGIN, 视口宽 - 宽 - POPOVER_VIEWPORT_MARGIN]` 内夹紧；
 * - 垂直优先锚点下方；下方放不下改上方；上下都不够则贴底夹紧
 *   （高度由 CSS `max-height: 50vh` 限制，故「贴底」仍能完整落在视口内）。
 */
export function computeMorePosition(
  rect: DOMRect,
  width: number,
  height: number
): { left: number; top: number } {
  const maxLeft = Math.max(
    POPOVER_VIEWPORT_MARGIN,
    window.innerWidth - width - POPOVER_VIEWPORT_MARGIN
  )
  const left = Math.min(Math.max(rect.left, POPOVER_VIEWPORT_MARGIN), maxLeft)
  const below = rect.bottom + ANCHOR_GAP
  const above = rect.top - ANCHOR_GAP - height
  const top =
    below + height <= window.innerHeight - POPOVER_VIEWPORT_MARGIN
      ? below
      : above >= POPOVER_VIEWPORT_MARGIN
        ? above
        : Math.max(POPOVER_VIEWPORT_MARGIN, window.innerHeight - height - POPOVER_VIEWPORT_MARGIN)
  return { left: Math.round(left), top: Math.round(top) }
}

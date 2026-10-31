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

/** 固定态活动栏占位：左缘 8 + 栏宽 48 + 与浮窗间距 8 = 64px（同 shell.css 几何口径）。 */
const ACTIVITY_BAR_PINNED_INSET = 64

/** 浮窗左边界下限：固定态让开活动栏（64px），悬浮态仅保留视口边距。 */
function hoverCardLeftInset(): number {
  return document.body.classList.contains('act-pinned')
    ? ACTIVITY_BAR_PINNED_INSET
    : POPOVER_VIEWPORT_MARGIN
}

/**
 * 计算弹窗 fixed 定位（视口坐标系）：`above` 底边距锚点 POPOVER_VIEWPORT_MARGIN、上方不足改放下方；
 * `right` 优先贴锚点右侧，右侧不足改下方 / 上方。水平默认居中并按视口边界钳制。
 * 尺寸由调用方传入实测值（对齐「渲染后测量再定位」口径）。
 */
export function computeCardPosition(
  rect: DOMRect,
  height: number,
  width: number = CARD_WIDTH,
  placement: 'above' | 'right' = 'above'
): { left: number; top: number } {
  const minLeft = hoverCardLeftInset()
  const maxLeft = Math.max(minLeft, window.innerWidth - width - POPOVER_VIEWPORT_MARGIN)
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
    // 右侧空间不足：改放锚点下方（水平居中并夹紧）；下方也不够时上翻，仍不够则夹紧。
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, minLeft), maxLeft)
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
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, minLeft), maxLeft)
  const above = rect.top - POPOVER_VIEWPORT_MARGIN - height
  const below = rect.bottom + POPOVER_VIEWPORT_MARGIN
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

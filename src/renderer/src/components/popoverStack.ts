/**
 * 浮层堆叠登记表：「贴锚点上方」显示的浮窗登记自己的 DOM 节点，供其**上方**浮窗按实测高度
 * 让位 —— 目前唯一的使用方是伏笔悬停提示 `MarkHoverTip`（被让位方为实体悬停卡 `HoverCard`），
 * 两者同时出现时的几何为：
 *
 * ```
 *        [实体卡]
 *          ↕ STACKED_POPOVER_GAP
 *        [伏笔提示]
 *          ↕ POPOVER_VIEWPORT_MARGIN
 *   ——— 标记所在行 ———
 * ```
 *
 * 为什么用模块级登记而不是 props 串联：两者分属不同域（实体悬停 / 伏笔标记），在章节视图与
 * 大纲编辑器里是并列的兄弟节点；走 props 需要页面层持有对方的 DOM ref 并各写一遍协调逻辑
 * （`ChaptersView.tsx` 已接近 500 行上限）。登记表只描述「此刻 DOM 上谁正贴着锚点上方」，
 * 语义等价于一次 `document.querySelector`，另带变更通知：提示挂载 / 卸载时重定位上层浮窗。
 *
 * 只登记「已显示」的浮窗：组件卸载即注销，故表内为空 = 当前没有需要让位的相邻浮窗。
 */

/** 当前「贴锚点上方」显示的浮窗节点（Set 保证同一节点重复登记无副作用）。 */
const aboveAnchorNodes = new Set<HTMLElement>()

/** 登记表变化订阅者（上层浮窗的重定位回调）。 */
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * 登记「贴锚点上方的浮窗」；返回注销函数（组件卸载 / 换节点时调用）。
 * 登记 / 注销都会广播，让上层浮窗立即按新状态重新测量（无需等下一次滚动）。
 */
export function registerAboveAnchorPopover(node: HTMLElement): () => void {
  aboveAnchorNodes.add(node)
  emit()
  return () => {
    aboveAnchorNodes.delete(node)
    emit()
  }
}

/** 订阅登记表变化（浮窗挂载 / 卸载）：上层浮窗借此重新测量让位量。 */
export function subscribeAboveAnchorPopover(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 取「贴着锚点上方」的浮窗实测矩形：多个登记时取最靠上者（正常只有一个）；
 * `exclude` 排除自身节点（防止浮窗把自己当成相邻浮窗）；无登记 / 已断开 / 零高度 → null。
 */
export function findAboveAnchorPopover(exclude: HTMLElement | null): DOMRect | null {
  let topmost: DOMRect | null = null
  for (const node of aboveAnchorNodes) {
    if (node === exclude || !node.isConnected) continue
    const rect = node.getBoundingClientRect()
    if (rect.height <= 0) continue
    if (topmost === null || rect.top < topmost.top) topmost = rect
  }
  return topmost
}

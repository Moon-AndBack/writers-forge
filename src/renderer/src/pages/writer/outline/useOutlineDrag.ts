import { useSortableDrag } from '../useSortableDrag'
import type { DragContext, SortableDragResult } from '../useSortableDrag'
import type { OutlineItemRow } from './outlineTree'

/**
 * 大纲条目行拖拽排序（大纲域薄封装）：通用实现见 `../useSortableDrag`（§9 收敛——
 * 与章节域共用同一套 Pointer Events + `setPointerCapture` 逻辑，**不用 HTML5 DnD**）。
 *
 * 与章节域的差异：大纲条目**无 pin 段 / 特殊章**，无「段」概念——仅在**同组内**重排
 * （正文卷下 / 分组下 / 置顶独立区），落点换算在同组全部兄弟行之间（splice 语义：
 * 0 = 组首，`items.length - 1` = 组尾），故**不传** `siblingsOf`（走缺省 =
 * 上下文全部条目剔除自身）。
 *
 * 交互口径：
 * - **拖拽把手**：行 hover 显示把手，仅把手可启动拖拽（整行拖拽会与「点击选中」冲突）；
 * - **视觉反馈**：被拖行半透明（`.outline-chapter.is-dragging`），目标缝显示占位线（`.drop-line`）；
 * - **松手**：回传 `{ id, targetIndex }` 交调用方落库 + reload；失败由调用方 reload 回滚；Esc / 指针异常取消。
 */

/** 单次拖拽命中判定所需的组内上下文（`items` = 本组全部条目行）。 */
export type OutlineDragContext = DragContext<OutlineItemRow>

export interface UseOutlineDragOptions {
  /** 拖拽落库：松手时调用（调用方负责 reorder + reload + 失败回滚）。 */
  onReorder: (id: number, targetIndex: number) => void
}

export type UseOutlineDragResult = SortableDragResult<OutlineItemRow>

export function useOutlineDrag({ onReorder }: UseOutlineDragOptions): UseOutlineDragResult {
  return useSortableDrag<OutlineItemRow>({ onReorder })
}

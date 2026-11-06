import { useSortableDrag } from '../useSortableDrag'
import type { DragContext, SortableDragResult } from '../useSortableDrag'
import { segmentOf } from './chapterTree'
import type { ChapterRow } from './chapterTree'

/**
 * 章行拖拽排序（章节域薄封装）：通用实现见 `../useSortableDrag`（§9 收敛——
 * 与大纲域共用同一套 Pointer Events + `setPointerCapture` 逻辑，**不用 HTML5 DnD**）。
 *
 * 域内口径（由 `siblingsOf` 注入）：
 * - **拖拽把手**：行 hover 显示 `GripVerticalIcon` 把手，仅把手可启动拖拽
 *   （整行拖拽会与「点击选中章」冲突，且拖动选中文字易误触发）；
 * - **限制**：仅同卷同 pin 段内重排——后端 `reorder(id, targetIndex)` 即「pin 段内」语义；
 *   跨段（普通章 ↔ 特殊章、top/bottom 之间）不允许，改段用「置顶 / 置底」按钮；
 * - **落点换算**：拖拽中按指针纵坐标在**同段兄弟行**间求「插入缝」索引
 *   （段内 splice 语义：0 = 段首，`segment.length - 1` = 段尾）；
 * - **视觉反馈**：被拖行半透明（`.is-dragging`），目标缝显示占位线（`.drop-line`）；
 * - **松手**：回传 `{ id, targetIndex }` 交调用方落库 + reload；失败由调用方回滚
 *   （reload 恢复真实序）；Esc / 指针异常抬起取消。
 */

/** 单条拖拽命中判定所需的段上下文（`items` = 整套章列表，段换算在 hook 内做）。 */
export type DragSegmentContext = DragContext<ChapterRow>

export interface UseChapterDragOptions {
  /** 拖拽落库：松手时调用（调用方负责 reorder + reload + 失败回滚）。 */
  onReorder: (id: number, targetIndex: number) => void
}

export type UseChapterDragResult = SortableDragResult<ChapterRow>

/**
 * 同 pin 段兄弟序（splice 基准：移除自身后的段内行序）。
 * ⚠️ 章节侧**必须**显式传入此项：缺省值会把跨段落点算成段内索引，
 * 与后端 `chapterReorder` 的分段语义不符（静默错序）。
 */
function chapterSiblings(dragged: ChapterRow, context: DragContext<ChapterRow>): ChapterRow[] {
  const segmentKey = segmentOf(dragged)
  return context.items.filter((row) => row.id !== dragged.id && segmentOf(row) === segmentKey)
}

export function useChapterDrag({ onReorder }: UseChapterDragOptions): UseChapterDragResult {
  return useSortableDrag<ChapterRow>({ onReorder, siblingsOf: chapterSiblings })
}

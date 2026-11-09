import { useCallback } from 'react'
import { useSortableDrag } from '../useSortableDrag'
import type { DragContainerHit, DragContext, SortableDragResult } from '../useSortableDrag'
import { segmentOf } from './chapterTree'
import type { ChapterRow, VolumeRow } from './chapterTree'

/**
 * 章行拖拽排序 / 跨卷移动（章节域薄封装）：通用实现见 `../useSortableDrag`（§9 收敛——
 * 与大纲域共用同一套 Pointer Events + `setPointerCapture` 逻辑，**不用 HTML5 DnD**）。
 *
 * 域内口径（由 `siblingsOf` 注入）：
 * - **拖拽把手**：行 hover 显示 `GripVerticalIcon` 把手，仅把手可启动拖拽
 *   （整行拖拽会与「点击选中章」冲突，且拖动选中文字易误触发）；
 * - **同卷**：仅同 pin 段内重排——后端 `reorder(id, targetIndex)` 即「pin 段内」语义；
 *   跨段（普通章 ↔ 特殊章、top/bottom 之间）不允许，改段用「置顶 / 置底」按钮；
 * - **跨卷**：指针下的目标卷与源卷不同 → 松手 `onMove(id, volumeId)`（追加到目标卷末尾）；
 *   目标卷可接收性在此校验（对齐数据层 `moveChapter`）：分组容器一律不接收，
 *   特殊章不可移入非「未分卷」的自定义卷；
 * - **落点换算**：同卷时按指针纵坐标在**同段兄弟行**间求「插入缝」索引
 *   （段内 splice 语义：0 = 段首，`segment.length - 1` = 段尾）；跨卷时只高亮目标卷；
 * - **视觉反馈**：被拖行原位半透明 + 抬起（`.is-dragging`），同段行让位预览 +
 *   落点线（`.chapter-drop-line`），跨卷显示目标卷头高亮；
 * - **松手**：回传 `{ id, targetIndex }` / `{ id, volumeId }` 交调用方落库 + reload；
 *   失败由调用方回滚（reload 恢复真实序）；Esc / 无效落点取消。
 */

/** 单条拖拽命中判定所需的段上下文（`items` = 当前卷章列表，段换算在 hook 内做）。 */
export type DragSegmentContext = DragContext<ChapterRow>

export interface UseChapterDragOptions {
  /** 同卷拖拽落库：松手时调用（调用方负责 reorder + reload + 失败回滚）。 */
  onReorder: (id: number, targetIndex: number) => void
  /** 跨卷移动：松手在其它可接收卷上时调用（数据层追加到目标卷末尾）。 */
  onMove: (id: number, volumeId: number) => void
  /** 章节页可见卷（`normal` / `custom`，含未分卷），用于校验目标卷可接收性。 */
  volumes: VolumeRow[]
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

/**
 * 指针下的目标卷解析（跨卷拖拽）：
 * - 源卷 → 不跨卷（回退同卷段内排序）；
 * - 卷容器外空白 → 无效落点 `blocked`（松手不落库）；
 * - 分组容器（`kind='group'`）→ `blocked`；
 * - 特殊章 → 非「未分卷」自定义卷 → `blocked`（对齐数据层 `moveChapter`）；
 * - 其余卷 → 目标容器 key `v{id}`（追加到该卷末尾）。
 */
function resolveDropVolume(
  dragged: ChapterRow,
  clientX: number,
  clientY: number,
  volumes: VolumeRow[]
): DragContainerHit {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const holder = element.closest<HTMLElement>('[data-volume-id]')
    if (!holder) continue
    const volumeId = Number(holder.dataset.volumeId)
    const target = volumes.find((volume) => volume.id === volumeId)
    if (!target) continue
    // 指针仍在源卷内：走同卷段内排序，不进入跨卷模式。
    if (target.id === dragged.volumeId) return { key: null }
    if (target.kind === 'group') return { key: null, blocked: true }
    if (dragged.kind === 'special' && target.kind === 'custom' && !target.isUnfiled) {
      return { key: null, blocked: true }
    }
    return { key: `v${target.id}` }
  }
  // 不在任何卷容器上（卷间空隙 / 栏外）：无效落点，松手不落库。
  return { key: null, blocked: true }
}

export function useChapterDrag({
  onReorder,
  onMove,
  volumes
}: UseChapterDragOptions): UseChapterDragResult {
  const resolveContainer = useCallback(
    (dragged: ChapterRow, clientX: number, clientY: number): DragContainerHit =>
      resolveDropVolume(dragged, clientX, clientY, volumes),
    [volumes]
  )

  // 容器 key `v{id}` → 数字卷 id；非法 key 直接忽略（不落库）。
  const onDropToContainer = useCallback(
    (id: number, containerKey: string): void => {
      const volumeId = Number(containerKey.slice(1))
      if (!Number.isInteger(volumeId) || volumeId <= 0) return
      onMove(id, volumeId)
    },
    [onMove]
  )

  return useSortableDrag<ChapterRow>({
    onReorder,
    siblingsOf: chapterSiblings,
    resolveContainer,
    onDropToContainer,
    // 章节有行让位 / 原位预览的 transform，落点必须用拖拽开始时的布局锚点。
    cacheRowLayout: true
  })
}

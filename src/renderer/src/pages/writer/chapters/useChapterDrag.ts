import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ChapterRow } from './chapterTree'

/**
 * 章行拖拽排序（v2）：Pointer Events + `setPointerCapture` 模式（对齐 `useSplitter`，
 * **不用 HTML5 DnD**——其拖影样式与中文输入法 / 自定义样式冲突且不可控）。
 *
 * 交互口径：
 * - **拖拽把手**：行 hover 显示 `GripVerticalIcon` 把手，仅把手可启动拖拽
 *   （整行拖拽会与「点击选中章」冲突，且拖动选中文字易误触发）；
 * - **限制**：仅同卷同 pin 段内重排——后端 `reorder(id, targetIndex)` 即「pin 段内」语义；
 *   跨段（普通章 ↔ 特殊章、top/bottom 之间）不允许，改段用「置顶 / 置底」按钮；
 * - **落点换算**：拖拽中按指针纵坐标在**同段兄弟行**间求「插入缝」索引
 *   （段内 splice 语义：0 = 段首，`segment.length - 1` = 段尾），由调用方
 *   传入该章所在段（`segmentIds`）与段行 DOM 引用做命中判定；
 * - **视觉反馈**：被拖行半透明（`.is-dragging`），目标缝显示占位线（`.drop-line`）；
 * - **松手**：回传 `{ id, targetIndex }` 交调用方落库 + reload；失败由调用方回滚
 *   （reload 恢复真实序）；Esc / 指针异常抬起取消。
 */

/** 单条拖拽命中判定所需的段上下文。 */
export interface DragSegmentContext {
  /** 同 pin 段内的全部章行（展示顺序），含被拖章自身。 */
  segment: ChapterRow[]
  /** 段内每章的行元素引用（key = 章节 id），供命中判定取行矩形。 */
  rowRefs: Map<number, HTMLElement>
}

export interface UseChapterDragOptions {
  /** 拖拽落库：松手时调用（调用方负责 reorder + reload + 失败回滚）。 */
  onReorder: (id: number, targetIndex: number) => void
}

export interface UseChapterDragResult {
  /** 拖拽中的章 id（null = 未拖拽）；驱动被拖行半透明与占位线渲染。 */
  draggingId: number | null
  /** 占位线插入缝位置（段内 splice 语义索引）；拖拽中才有意义。 */
  dropIndex: number | null
  /** 把手 pointerdown：启动拖拽（仅左键）。 */
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    chapter: ChapterRow,
    context: DragSegmentContext
  ) => void
  /** 拖拽中指针移动（绑在把手元素上，capture 后仍派发给启动元素）。 */
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  /** 指针抬起：结算拖拽（落库或取消）。 */
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  /** 指针取消（pointercancel）：取消拖拽。 */
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

/** 相邻缝的命中半径比例：指针进入行高的该比例范围即视为压缝。 */
const EDGE_RATIO = 0.5

/** 段判别（对齐后端 `chapterReorder.ts` 的 `segmentOf`）。 */
function segmentOf(chapter: ChapterRow): 'top' | 'normal' | 'unpinned' | 'bottom' {
  if (chapter.kind !== 'special') return 'normal'
  if (chapter.pin === 'top') return 'top'
  if (chapter.pin === 'bottom') return 'bottom'
  return 'unpinned'
}

export function useChapterDrag({ onReorder }: UseChapterDragOptions): UseChapterDragResult {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // 拖拽上下文（ref 持有，避免渲染期重建）。
  const contextRef = useRef<DragSegmentContext | null>(null)
  const draggingRef = useRef<number | null>(null)

  const cleanup = useCallback((): void => {
    draggingRef.current = null
    contextRef.current = null
    setDraggingId(null)
    setDropIndex(null)
  }, [])

  // Esc 取消：还原视觉，不落库。
  useEffect(() => {
    if (draggingId === null) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      cleanup()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draggingId, cleanup])

  /** 按指针纵坐标求目标插入缝（段内 splice 语义：移除自身后的位置）。
   *  段判定与后端 `chapterReorder.ts` 同口径：普通章段 / top / unpinned / bottom，
   *  仅在**同段兄弟行**间换算（跨段不允许，改段用「置顶 / 置底」按钮）。 */
  const resolveDropIndex = useCallback((clientY: number): number | null => {
    const context = contextRef.current
    const id = draggingRef.current
    if (context === null || id === null) return null
    const chapter = context.segment.find((row) => row.id === id)
    if (!chapter) return null
    const segmentKey = segmentOf(chapter)
    // 同段兄弟序（splice 语义基准：移除自身后的段内行序）。
    const others = context.segment.filter((row) => row.id !== id && segmentOf(row) === segmentKey)
    if (others.length === 0) return 0

    let index = others.length
    for (let i = 0; i < others.length; i += 1) {
      const rect = context.rowRefs.get(others[i].id)?.getBoundingClientRect()
      if (!rect) continue
      // 指针在行上半（含中线）→ 插在该行之前；下半 → 继续向后找。
      if (clientY < rect.top + rect.height * EDGE_RATIO) {
        index = i
        break
      }
    }
    return index
  }, [])

  const onPointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      chapter: ChapterRow,
      context: DragSegmentContext
    ): void => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      contextRef.current = context
      draggingRef.current = chapter.id
      setDraggingId(chapter.id)
      setDropIndex(null)
      // 捕获指针到把手上：后续 move / up 都派发给启动元素（对齐 useSplitter）。
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    []
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (draggingRef.current === null) return
      const index = resolveDropIndex(event.clientY)
      if (index !== null) setDropIndex(index)
    },
    [resolveDropIndex]
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const id = draggingRef.current
      if (id === null) return
      const targetIndex = resolveDropIndex(event.clientY)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      cleanup()
      if (targetIndex !== null) onReorder(id, targetIndex)
    },
    [resolveDropIndex, onReorder, cleanup]
  )

  /** 指针取消：仅清理视觉，不落库。 */
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (draggingRef.current === null) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      cleanup()
    },
    [cleanup]
  )

  return { draggingId, dropIndex, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}

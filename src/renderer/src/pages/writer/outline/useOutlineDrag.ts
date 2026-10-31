import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { OutlineItemRow } from './outlineTree'

/**
 * 大纲条目行拖拽排序：Pointer Events + `setPointerCapture` 模式（对齐章节域
 * `useChapterDrag`，**不用 HTML5 DnD**——其拖影样式与中文输入法 / 自定义样式冲突且不可控）。
 *
 * 与章节域的差异：大纲条目**无 pin 段 / 特殊章**，无「段」概念——仅在**同组内**重排
 * （正文卷下 / 分组下 / 置顶独立区），落点换算在同组全部兄弟行之间（splice 语义：
 * 0 = 组首，`items.length - 1` = 组尾）。
 *
 * 交互口径：
 * - **拖拽把手**：行 hover 显示把手，仅把手可启动拖拽（整行拖拽会与「点击选中」冲突）；
 * - **视觉反馈**：被拖行半透明（`.outline-chapter.is-dragging`），目标缝显示占位线（`.drop-line`）；
 * - **松手**：回传 `{ id, targetIndex }` 交调用方落库 + reload；失败由调用方 reload 回滚；Esc / 指针异常取消。
 */

/** 单次拖拽命中判定所需的组内上下文。 */
export interface OutlineDragContext {
  /** 本组全部条目行（展示顺序，含被拖条目自身）。 */
  items: OutlineItemRow[]
  /** 组内每条目的行元素引用（key = 条目 id），供命中判定取行矩形。 */
  rowRefs: Map<number, HTMLElement>
}

export interface UseOutlineDragOptions {
  /** 拖拽落库：松手时调用（调用方负责 reorder + reload + 失败回滚）。 */
  onReorder: (id: number, targetIndex: number) => void
}

export interface UseOutlineDragResult {
  /** 拖拽中的条目 id（null = 未拖拽）；驱动被拖行半透明与占位线渲染。 */
  draggingId: number | null
  /** 占位线插入缝位置（组内 splice 语义索引）；拖拽中才有意义。 */
  dropIndex: number | null
  /** 把手 pointerdown：启动拖拽（仅左键）。 */
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    item: OutlineItemRow,
    context: OutlineDragContext
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

export function useOutlineDrag({ onReorder }: UseOutlineDragOptions): UseOutlineDragResult {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // 拖拽上下文（ref 持有，避免渲染期重建）。
  const contextRef = useRef<OutlineDragContext | null>(null)
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

  /** 按指针纵坐标求目标插入缝（组内 splice 语义：移除自身后的位置）。 */
  const resolveDropIndex = useCallback((clientY: number): number | null => {
    const context = contextRef.current
    const id = draggingRef.current
    if (context === null || id === null) return null
    // 同组兄弟序（splice 语义基准：移除自身后的组内行序）。
    const others = context.items.filter((row) => row.id !== id)
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
      item: OutlineItemRow,
      context: OutlineDragContext
    ): void => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      contextRef.current = context
      draggingRef.current = item.id
      setDraggingId(item.id)
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

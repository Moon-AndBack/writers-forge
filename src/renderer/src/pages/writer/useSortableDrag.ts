import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * 可排序拖拽通用 hook（§9 单一实现）：章节域 `useChapterDrag` 与大纲域
 * `useOutlineDrag` 曾各自维护一份 ~90% 同构的 Pointer Events 拖拽实现
 * （Esc 清理、指针捕获、落点换算、松手结算逐字相同），现收敛于此。
 *
 * **唯一差异**为「落点换算的兄弟序来源」：章节需先按 pin 段筛选（跨段不允许），
 * 大纲直接用组内全部条目。差异由调用方经 `siblingsOf` 参数化注入，
 * **章节侧必须显式传入**——依赖缺省值会把跨段落点算成段内索引，前端看似正常，
 * 但与后端 `chapterReorder` 的分段语义不符（静默错序）。
 *
 * 交互口径（两域共用，逐字沿用原实现）：
 * - **指针捕获**：`pointerdown` 时 `setPointerCapture`，后续 move / up 都派发给
 *   启动元素（对齐 `useSplitter`；**不用 HTML5 DnD**——拖影样式与中文输入法 /
 *   自定义样式冲突且不可控）；
 * - **落点换算**：拖拽中按指针纵坐标在兄弟行间求「插入缝」索引
 *   （splice 语义：0 = 段首，`others.length` = 段尾）；
 * - **松手**：先 `cleanup()` 再回传 `{ id, targetIndex }` 交调用方落库 + reload；
 *   失败由调用方回滚（reload 恢复真实序）；Esc / 指针异常抬起仅清理，不落库。
 */

/** 单次拖拽命中判定所需的上下文。 */
export interface DragContext<T> {
  /** 参与拖拽展示的条目（展示顺序，含被拖条目自身）。 */
  items: T[]
  /** 每条目的行元素引用（key = 条目 id），供命中判定取行矩形。 */
  rowRefs: Map<number, HTMLElement>
}

export interface UseSortableDragOptions<T extends { id: number }> {
  /** 拖拽落库：松手时调用（调用方负责 reorder + reload + 失败回滚）。 */
  onReorder: (id: number, targetIndex: number) => void
  /** 段内兄弟序（splice 基准，须剔除被拖项）。缺省 = `context.items` 剔除自身。 */
  siblingsOf?: (dragged: T, context: DragContext<T>) => T[]
}

export interface SortableDragResult<T> {
  /** 拖拽中的条目 id（null = 未拖拽）；驱动被拖行半透明与占位线渲染。 */
  draggingId: number | null
  /** 占位线插入缝位置（splice 语义索引）；拖拽中才有意义。 */
  dropIndex: number | null
  /** 把手 pointerdown：启动拖拽（仅左键）。 */
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, item: T, context: DragContext<T>) => void
  /** 拖拽中指针移动（绑在把手元素上，capture 后仍派发给启动元素）。 */
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  /** 指针抬起：结算拖拽（落库或取消）。 */
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  /** 指针取消（pointercancel）：取消拖拽。 */
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

/** 相邻缝的命中半径比例：指针进入行高的该比例范围即视为压缝。 */
const EDGE_RATIO = 0.5

/**
 * 段内 splice 索引 → 展示列表中「占位线渲染在哪一行之前」：
 * 取目标缝处的兄弟行 id；缝在段尾时返回 null（由列表末尾兜底线渲染）。
 * 章节（段内）与大纲（组内）同构算法，收敛至此（§9）。
 */
export function resolveDropLineId<T extends { id: number }>(
  siblings: T[],
  draggingId: number | null,
  dropIndex: number | null
): number | null {
  if (draggingId === null || dropIndex === null) return null
  const others = siblings.filter((row) => row.id !== draggingId)
  if (dropIndex >= others.length) return null
  return others[dropIndex]?.id ?? null
}

export function useSortableDrag<T extends { id: number }>({
  onReorder,
  siblingsOf
}: UseSortableDragOptions<T>): SortableDragResult<T> {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // 拖拽上下文（ref 持有，避免渲染期重建）。
  const contextRef = useRef<DragContext<T> | null>(null)
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

  /** 按指针纵坐标求目标插入缝（splice 语义：移除自身后的位置）。 */
  const resolveDropIndex = useCallback(
    (clientY: number): number | null => {
      const context = contextRef.current
      const id = draggingRef.current
      if (context === null || id === null) return null
      let others: T[]
      if (siblingsOf) {
        // 域内兄弟序（如章节：仅同 pin 段；须先在被拖项所在集合中定位自身）。
        const dragged = context.items.find((row) => row.id === id)
        if (!dragged) return null
        others = siblingsOf(dragged, context)
      } else {
        // 缺省兄弟序：上下文全部条目剔除自身。
        others = context.items.filter((row) => row.id !== id)
      }
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
    },
    [siblingsOf]
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, item: T, context: DragContext<T>): void => {
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

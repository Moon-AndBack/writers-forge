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
 *   （splice 语义：0 = 段首，`others.length` = 段尾）；启用 `cacheRowLayout` 时
 *   行位置取 **pointerdown 时缓存的相对父容器偏移**，不用实时 `getBoundingClientRect()`
 *   ——否则行让位的 transform 会改变实时矩形，落点与动画互相追赶、产生抖动；
 *   未启用时保持原有实时矩形路径（大纲等无位移预览的域）；
 * - **松手**：先 `cleanup()` 再回传 `{ id, targetIndex }` 交调用方落库 + reload；
 *   失败由调用方回滚（reload 恢复真实序）；Esc / 指针异常抬起仅清理，不落库；
 * - **跨容器（可选，缺省关闭，行为与旧版完全一致）**：拖拽中经 `resolveContainer`
 *   解析指针下的目标容器；命中其它容器时进入跨容器模式（不显示同容器落点线），
 *   松手交 `onDropToContainer`（章节跨卷移动用）。
 */

/** 单次拖拽命中判定所需的上下文。 */
export interface DragContext<T> {
  /** 参与拖拽展示的条目（展示顺序，含被拖条目自身）。 */
  items: T[]
  /** 每条目的行元素引用（key = 条目 id），供命中判定取行矩形。 */
  rowRefs: Map<number, HTMLElement>
}

/**
 * 跨容器命中结果：`key` 非 null = 可移入的目标容器；`blocked` = 指针下有容器
 * 但拒绝接收（松手取消，不落库）；`key: null` 且未 blocked = 不跨容器（同容器排序）。
 */
export interface DragContainerHit {
  key: string | null
  blocked?: boolean
}

export interface UseSortableDragOptions<T extends { id: number }> {
  /** 拖拽落库：松手时调用（调用方负责 reorder + reload + 失败回滚）。 */
  onReorder: (id: number, targetIndex: number) => void
  /** 段内兄弟序（splice 基准，须剔除被拖项）。缺省 = `context.items` 剔除自身。 */
  siblingsOf?: (dragged: T, context: DragContext<T>) => T[]
  /**
   * 跨容器命中解析（缺省 = 不支持跨容器，行为与旧版完全一致）：
   * 返回指针下的目标容器 key，或 `blocked`（容器存在但拒绝接收）。
   */
  resolveContainer?: (dragged: T, clientX: number, clientY: number) => DragContainerHit
  /** 跨容器松手：容器由 `resolveContainer` 判定为可接收时调用。 */
  onDropToContainer?: (id: number, containerKey: string) => void
  /**
   * 落点换算是否使用 pointerdown 时缓存的行布局（而非实时矩形）。
   * 章节有让位 transform，必须开启；缺省 false，保持大纲等域原有的实时矩形行为。
   */
  cacheRowLayout?: boolean
}

export interface SortableDragResult<T> {
  /** 拖拽中的条目 id（null = 未拖拽）；驱动被拖行半透明与占位线渲染。 */
  draggingId: number | null
  /** 占位线插入缝位置（splice 语义索引）；拖拽中才有意义。 */
  dropIndex: number | null
  /** 跨容器模式下的目标容器 key（null = 同容器 / 未跨容器）；驱动目标容器高亮。 */
  dropContainerKey: string | null
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

/** pointerdown 时缓存的行布局锚点：父容器内偏移 + 行高（不含 transform 的布局值）。 */
interface RowMetrics {
  parent: HTMLElement | null
  /** 行顶相对父容器顶部的距离（拖拽开始时读取，之后不随 transform 变化）。 */
  top: number
  height: number
}

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
  siblingsOf,
  resolveContainer,
  onDropToContainer,
  cacheRowLayout = false
}: UseSortableDragOptions<T>): SortableDragResult<T> {
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [dropContainerKey, setDropContainerKey] = useState<string | null>(null)

  // 拖拽上下文（ref 持有，避免渲染期重建）。
  const contextRef = useRef<DragContext<T> | null>(null)
  const draggingRef = useRef<number | null>(null)
  // pointerdown 时缓存的行锚点（落点换算只用它，不读实时行矩形）。
  const metricsRef = useRef<Map<number, RowMetrics> | null>(null)

  const cleanup = useCallback((): void => {
    draggingRef.current = null
    contextRef.current = null
    metricsRef.current = null
    setDraggingId(null)
    setDropIndex(null)
    setDropContainerKey(null)
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
        // 优先用 pointerdown 缓存的布局锚点：锚点 top 相对父容器，父容器实时矩形
        // 只承担滚动 / 折叠变化，不受行自身 transform 影响（落点不会跟着动画抖）。
        const metrics = cacheRowLayout ? metricsRef.current?.get(others[i].id) : undefined
        let top: number
        let height: number
        if (metrics) {
          top = (metrics.parent?.getBoundingClientRect().top ?? 0) + metrics.top
          height = metrics.height
        } else {
          // 异常回退（无缓存 / 无父容器）：仍按实时矩形判定，行为与旧版一致。
          const rect = context.rowRefs.get(others[i].id)?.getBoundingClientRect()
          if (!rect) continue
          top = rect.top
          height = rect.height
        }
        // 指针在行上半（含中线）→ 插在该行之前；下半 → 继续向后找。
        if (clientY < top + height * EDGE_RATIO) {
          index = i
          break
        }
      }
      return index
    },
    [cacheRowLayout, siblingsOf]
  )

  /** 解析指针下的跨容器命中（未配置 / 无被拖项时返回 null = 走同容器逻辑）。 */
  const resolveContainerHit = useCallback(
    (clientX: number, clientY: number): DragContainerHit | null => {
      const context = contextRef.current
      const id = draggingRef.current
      if (!resolveContainer || context === null || id === null) return null
      const dragged = context.items.find((row) => row.id === id)
      if (!dragged) return null
      return resolveContainer(dragged, clientX, clientY)
    },
    [resolveContainer]
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, item: T, context: DragContext<T>): void => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      contextRef.current = context
      draggingRef.current = item.id
      // 缓存每行拖拽开始时的布局锚点：行顶相对父容器 + 行高。
      // 拖拽中的 inline transform（让位）只影响绘制，不影响这份布局值。
      if (cacheRowLayout) {
        const metrics = new Map<number, RowMetrics>()
        for (const [rowId, element] of context.rowRefs) {
          const parent = element.offsetParent instanceof HTMLElement ? element.offsetParent : null
          const parentTop = parent?.getBoundingClientRect().top ?? 0
          const rect = element.getBoundingClientRect()
          metrics.set(rowId, { parent, top: rect.top - parentTop, height: rect.height })
        }
        metricsRef.current = metrics
      } else {
        metricsRef.current = null
      }
      setDraggingId(item.id)
      setDropIndex(null)
      setDropContainerKey(null)
      // 捕获指针到把手上：后续 move / up 都派发给启动元素（对齐 useSplitter）。
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [cacheRowLayout]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (draggingRef.current === null) return
      const hit = resolveContainerHit(event.clientX, event.clientY)
      if (hit !== null) {
        if (hit.key !== null) {
          // 跨容器模式：清空同容器落点线，只由目标容器高亮表达落点。
          setDropContainerKey(hit.key)
          setDropIndex(null)
          return
        }
        setDropContainerKey(null)
        if (hit.blocked) {
          // 容器拒绝接收（或指针不在任何容器上）：不显示落点线。
          setDropIndex(null)
          return
        }
      }
      const index = resolveDropIndex(event.clientY)
      if (index !== null) setDropIndex(index)
    },
    [resolveContainerHit, resolveDropIndex]
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const id = draggingRef.current
      if (id === null) return
      // 松手时重新解析（不依赖 move 的异步 state），决定「跨容器 / 拒绝 / 同容器排序」。
      const hit = resolveContainerHit(event.clientX, event.clientY)
      const blocked = hit?.blocked === true
      const containerKey = hit?.key ?? null
      const targetIndex = blocked || containerKey !== null ? null : resolveDropIndex(event.clientY)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      cleanup()
      if (blocked) return
      if (containerKey !== null) {
        onDropToContainer?.(id, containerKey)
        return
      }
      if (targetIndex !== null) onReorder(id, targetIndex)
    },
    [resolveContainerHit, resolveDropIndex, onDropToContainer, onReorder, cleanup]
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

  return {
    draggingId,
    dropIndex,
    dropContainerKey,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel
  }
}

import { useCallback, useRef, useState } from 'react'
import { resolveDropLineId } from '../useSortableDrag'
import { segmentOf } from './chapterTree'
import type { ChapterPin, ChapterRow } from './chapterTree'
import ChapterRowItem from './ChapterRowItem'
import type { UseChapterDragResult } from './useChapterDrag'

export interface ChapterListProps {
  /** 该卷下的章（后端顺序：pin 段 top → 普通 → 无 pin → bottom）。 */
  chapters: ChapterRow[]
  /** 当前选中章节 id。 */
  activeChapterId: number | null
  /** 拖拽上下文（由 ChaptersPanel 持有）：当前拖拽 id / 占位缝 / 事件处理器。 */
  drag: UseChapterDragResult
  /** 选中章节。 */
  onSelect: (id: number) => void
  /** 删除章（含确认）。 */
  onDelete: (chapter: ChapterRow) => void
  /** 特殊章置顶 / 置底切换。 */
  onTogglePin: (id: number, pin: ChapterPin) => void
}

/**
 * 卷内章列表（v2）：按 pin 段（后端已排）渲染章行 + 拖拽占位线。
 * 段判定与后端 `PIN_RANK_SQL` 同口径：top → 普通 → 无 pin → bottom；
 * 同卷拖拽仅同段内生效——落点换算限定在**被拖章所属段**的兄弟行之间；
 * 跨卷模式（目标卷高亮）下不渲染同卷落点线，落点由目标卷头表达。
 */
export default function ChapterList({
  chapters,
  activeChapterId,
  drag,
  onSelect,
  onDelete,
  onTogglePin
}: ChapterListProps) {
  // 段行 DOM 引用（key = 章节 id），供拖拽命中判定取行矩形。
  const [rowRefs] = useState(() => new Map<number, HTMLElement>())
  // 列表容器引用（读行间距 / 作为落点线尾部锚点）。
  const listRef = useRef<HTMLDivElement | null>(null)
  // 拖拽开始时测得的列表布局：行高 / 行间距 / 首行相对列表的偏移。
  const [rowMetrics, setRowMetrics] = useState({ height: 0, gap: 0, top: 0 })

  const registerRow = useCallback(
    (id: number, element: HTMLElement | null): void => {
      if (element === null) rowRefs.delete(id)
      else rowRefs.set(id, element)
    },
    [rowRefs]
  )

  // 被拖章所属段（同 pin 段的兄弟行，展示顺序）——拖拽换算仅在此段内。
  const draggingChapter =
    drag.draggingId !== null ? (chapters.find((row) => row.id === drag.draggingId) ?? null) : null
  const segment = draggingChapter
    ? chapters.filter((row) => segmentOf(row) === segmentOf(draggingChapter))
    : []

  // 段内 splice 索引 → 展示列表中的行位置（落点线画在该行原始上缘）；
  // 落点在段尾（index === others.length）时取段末行之后的缝（不一定是整个列表尾）。
  const dropLineBeforeId = resolveDropLineId(segment, drag.draggingId, drag.dropIndex)

  // 跨卷模式：落点由目标卷头高亮表达，卷内一律不渲染同卷落点线。
  const crossVolume = drag.dropContainerKey !== null
  // 仅被拖章所在卷参与同卷预览（其它卷不渲染落点线 / 让位）。
  const isDragSource = draggingChapter !== null

  // 同卷让位 + 被拖行原位抬起：
  // - 位移只由 layout 数据计算（段内索引 + 拖拽开始时测得的步长），不读实时矩形；
  // - 让位行 = 原索引与目标索引之间的兄弟行，各让出一行（高度 + gap）；
  // - 被拖行原槽位由相邻行让入，该行沉底隐藏，避免与半透明被拖行的文字叠加；
  // - 跨卷模式不应用任何位移（落点由目标卷头表达）。
  const rowStep = rowMetrics.height + rowMetrics.gap
  const shiftById = new Map<number, number>()
  let underlapId: number | null = null
  if (!crossVolume && isDragSource && drag.dropIndex !== null && rowStep > 0) {
    const fromIndex = segment.findIndex((row) => row.id === drag.draggingId)
    const toIndex = drag.dropIndex
    const others = segment.filter((row) => row.id !== drag.draggingId)
    if (fromIndex !== -1 && fromIndex !== toIndex) {
      const direction = fromIndex < toIndex ? -1 : 1
      const start = Math.min(fromIndex, toIndex)
      const end = Math.max(fromIndex, toIndex)
      for (let i = start; i < end; i += 1) {
        shiftById.set(others[i].id, direction * rowStep)
      }
      // 向下拖：被拖行后一行上移入原槽；向上拖：前一行下移入原槽。
      underlapId = others[fromIndex + (fromIndex < toIndex ? 0 : -1)]?.id ?? null
    }
  }

  // 落点线（绝对定位，不占布局）：始终锚定目标行在**原始布局**中的上缘，
  // 不叠加让位位移——向下拖时它是空位下缘，向上拖时是空位上缘，两侧都不会
  // 随让位动画漂移，也不会被原位的被拖行遮住。段尾取段末行之后的那条缝
  // （可能是下一段首行 / 列表内容底），不再笼统落在整个列表末尾。
  const showDropLine = !crossVolume && isDragSource && drag.dropIndex !== null && rowStep > 0
  let dropLineTop: number | null = null
  if (showDropLine) {
    if (dropLineBeforeId !== null) {
      const index = chapters.findIndex((row) => row.id === dropLineBeforeId)
      if (index !== -1) dropLineTop = rowMetrics.top + index * rowStep - 1
    } else {
      const lastSegmentRow = segment[segment.length - 1]
      const lastIndex = lastSegmentRow
        ? chapters.findIndex((row) => row.id === lastSegmentRow.id)
        : -1
      if (lastIndex !== -1 && lastIndex + 1 < chapters.length) {
        dropLineTop = rowMetrics.top + (lastIndex + 1) * rowStep - 1
      } else if (lastIndex !== -1) {
        dropLineTop = rowMetrics.top + chapters.length * rowStep - rowMetrics.gap - 1
      }
    }
  }

  // 把手启动：把「本卷章列表 + 行引用」组装为拖拽上下文（段换算在 hook 内做）。
  // 启动瞬间测一次行高 + gap（此时行尚无 transform，读到的就是布局值）。
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, chapter: ChapterRow): void => {
      const list = listRef.current
      const row = rowRefs.get(chapter.id)
      const first = chapters.length > 0 ? rowRefs.get(chapters[0].id) : null
      if (list && row && first) {
        const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0
        setRowMetrics({ height: row.offsetHeight, gap, top: first.offsetTop })
      }
      drag.onPointerDown(event, chapter, { items: chapters, rowRefs })
    },
    [drag, chapters, rowRefs]
  )

  return (
    <div ref={listRef} className={`chapters-list${isDragSource ? ' is-dragging' : ''}`}>
      {chapters.map((chapter) => (
        <ChapterRowItem
          key={chapter.id}
          chapter={chapter}
          active={chapter.id === activeChapterId}
          dragging={chapter.id === drag.draggingId}
          underlap={chapter.id === underlapId}
          shiftY={shiftById.get(chapter.id) ?? 0}
          registerRow={registerRow}
          dragHandle={{
            onPointerDown: handlePointerDown,
            onPointerMove: drag.onPointerMove,
            onPointerUp: drag.onPointerUp,
            onPointerCancel: drag.onPointerCancel
          }}
          onSelect={onSelect}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
        />
      ))}
      {showDropLine && dropLineTop !== null && (
        <div
          key={`line-${dropLineBeforeId ?? 'tail'}`}
          className="drop-line chapter-drop-line"
          style={{ top: dropLineTop }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

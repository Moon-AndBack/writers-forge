import { useCallback, useState } from 'react'
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
 * 拖拽仅同段内生效——落点换算限定在**被拖章所属段**的兄弟行之间。
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

  // 段内 splice 索引 → 展示列表中的行位置（占位线渲染在该行之前）；
  // 落点在段尾（index === others.length）时占位线渲染在列表末尾（兜底线）。
  const dropLineBeforeId = resolveDropLineId(segment, drag.draggingId, drag.dropIndex)

  // 把手启动：把「本卷章列表 + 行引用」组装为拖拽上下文（段换算在 hook 内做）。
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, chapter: ChapterRow): void => {
      drag.onPointerDown(event, chapter, { items: chapters, rowRefs })
    },
    [drag, chapters, rowRefs]
  )

  return (
    <div className="chapters-list">
      {chapters.map((chapter) => (
        <ChapterRowItem
          key={chapter.id}
          chapter={chapter}
          active={chapter.id === activeChapterId}
          dragging={chapter.id === drag.draggingId}
          dropBefore={dropLineBeforeId === chapter.id}
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
      {drag.draggingId !== null && drag.dropIndex !== null && dropLineBeforeId === null && (
        <div className="drop-line" aria-hidden="true" />
      )}
    </div>
  )
}

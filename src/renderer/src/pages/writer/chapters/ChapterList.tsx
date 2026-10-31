import { useCallback, useState } from 'react'
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
  const dropLineBeforeId = resolveDropLineId(chapters, segment, drag.draggingId, drag.dropIndex)

  // 把手启动：把「本卷章列表 + 行引用」组装为拖拽上下文（段换算在 hook 内做）。
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>, chapter: ChapterRow): void => {
      drag.onPointerDown(event, chapter, { segment: chapters, rowRefs })
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

/** 段判别（对齐后端 `chapterReorder.ts` 的 `segmentOf`）。 */
function segmentOf(chapter: ChapterRow): 'top' | 'normal' | 'unpinned' | 'bottom' {
  if (chapter.kind !== 'special') return 'normal'
  if (chapter.pin === 'top') return 'top'
  if (chapter.pin === 'bottom') return 'bottom'
  return 'unpinned'
}

/**
 * 段内 splice 索引 → 展示列表中「占位线渲染在哪一行之前」：
 * 取目标缝处的段内兄弟行 id；缝在段尾时返回 null（由列表末尾兜底线渲染）。
 */
function resolveDropLineId(
  chapters: ChapterRow[],
  segment: ChapterRow[],
  draggingId: number | null,
  dropIndex: number | null
): number | null {
  if (draggingId === null || dropIndex === null) return null
  const others = segment.filter((row) => row.id !== draggingId)
  if (dropIndex >= others.length) return null
  const targetId = others[dropIndex]?.id
  if (targetId === undefined) return null
  return chapters.some((row) => row.id === targetId) ? targetId : null
}

import { useTranslation } from 'react-i18next'
import type { ChapterPin, ChapterRow } from './chapterTree'
import { chapterNameLabel } from './chapterTree'
import { IconButton } from '../../../components/ui'
import { GripVerticalIcon, PinBottomIcon, PinTopIcon } from '../icons'
import { TrashIcon } from '../../../components/icons'
import { useChapterLabels } from './useChapterLabels'
import TreeRowItem from '../../../components/tree/TreeRowItem'

export interface ChapterRowItemProps {
  /** 章行数据。 */
  chapter: ChapterRow
  /** 是否当前选中章。 */
  active: boolean
  /** 是否正在被拖拽（半透明视觉）。 */
  dragging: boolean
  /** 是否被让位行压在原槽位（沉底隐藏，避免与半透明被拖行的文字叠加）。 */
  underlap: boolean
  /** 拖拽纵向位移（px）：让位行 = ±一行；0 = 不位移。 */
  shiftY: number
  /** 行元素引用回调（拖拽命中判定用；卸载传 null）。 */
  registerRow: (id: number, element: HTMLElement | null) => void
  /** 拖拽把手事件（仅把手可启动；capture 后 move/up 派发回把手）。 */
  dragHandle: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>, chapter: ChapterRow) => void
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
  }
  /** 选中章节。 */
  onSelect: (id: number) => void
  /** 删除章（含确认）。 */
  onDelete: (chapter: ChapterRow) => void
  /** 特殊章置顶 / 置底切换。 */
  onTogglePin: (id: number, pin: ChapterPin) => void
}

/**
 * 单章行（v2）：`chapter-dot` → 前缀段（斜体，不可编辑）→ `●` 圆点分隔符 →
 * 名段（LXGW 正体）→ 草稿徽标 → hover 操作（特殊章：置顶 / 置底切换 + 删除；
 * 普通章：删除）→ 拖拽把手（hover 显示，仅同段内可拖）。
 */
export default function ChapterRowItem({
  chapter,
  active,
  dragging,
  underlap,
  shiftY,
  registerRow,
  dragHandle,
  onSelect,
  onDelete,
  onTogglePin
}: ChapterRowItemProps) {
  const { t } = useTranslation('chapters')
  const labels = useChapterLabels()
  const prefix = labels.chapterRowPrefixLabel(chapter)
  const name = chapterNameLabel(chapter)

  return (
    <TreeRowItem
      id={chapter.id}
      classPrefix="chapter"
      active={active}
      dragging={dragging}
      stateClasses={[
        chapter.status === 'draft' ? 'is-draft' : '',
        chapter.kind === 'special' ? 'is-special' : '',
        underlap ? 'is-drag-underlap' : ''
      ]}
      style={shiftY !== 0 ? { transform: `translateY(${shiftY}px)` } : undefined}
      registerRow={registerRow}
      onSelect={onSelect}
      leading={
        <>
          {prefix !== '' && <span className="chapter-prefix">{prefix}</span>}
          {/* 圆点分隔符：前缀段与名段之间恒显示（前缀段可能为空——回收站口径不适用此处）。 */}
          <span className="chapter-sep" aria-hidden="true">
            ●
          </span>
        </>
      }
      nameNode={
        name !== '' ? (
          <span className="chapter-name">{name}</span>
        ) : (
          <span className="chapter-name chapter-name--empty" />
        )
      }
      badge={
        chapter.status === 'draft' ? (
          <span className="chapter-draft">{t('status.draft')}</span>
        ) : null
      }
      actions={
        <>
          {chapter.kind === 'special' && (
            <IconButton
              size="sm"
              className="row-act"
              label={chapter.pin === 'top' ? t('pinBottom') : t('pinTop')}
              tooltipPlacement="top"
              onClick={() => onTogglePin(chapter.id, chapter.pin === 'top' ? 'bottom' : 'top')}
            >
              {chapter.pin === 'top' ? <PinBottomIcon /> : <PinTopIcon />}
            </IconButton>
          )}
          <IconButton
            size="sm"
            className="row-act"
            tone="danger"
            label={t('deleteChapter')}
            tooltipPlacement="top"
            onClick={() => onDelete(chapter)}
          >
            <TrashIcon />
          </IconButton>
        </>
      }
      grip={{
        title: t('dragReorder'),
        icon: <GripVerticalIcon />,
        onPointerDown: (event) => dragHandle.onPointerDown(event, chapter),
        onPointerMove: dragHandle.onPointerMove,
        onPointerUp: dragHandle.onPointerUp,
        onPointerCancel: dragHandle.onPointerCancel
      }}
    />
  )
}

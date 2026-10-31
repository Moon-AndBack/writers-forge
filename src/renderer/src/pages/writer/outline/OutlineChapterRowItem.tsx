import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { GripVerticalIcon, PencilIcon } from '../icons'
import { TrashIcon } from '../../../components/icons'
import { outlineItemLabel, type OutlineItemRow } from './outlineTree'

export interface OutlineChapterRowItemProps {
  item: OutlineItemRow
  /** 是否当前选中条目。 */
  active: boolean
  /** 是否拖拽中（半透明提示）。 */
  dragging?: boolean
  /** 是否缩进一级（分组下条目）。 */
  nested?: boolean
  /** 行元素注册（供同卷内拖拽命中判定）；缺省不注册。 */
  registerRow?: (id: number, element: HTMLElement | null) => void
  /** 拖拽把手回调；缺省不渲染把手（如置顶区条目暂不支持拖拽）。 */
  dragHandle?: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>, item: OutlineItemRow) => void
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
  }
  /** 是否处于内联改名态（缺省 / 无回调时不提供改名）。 */
  renaming?: boolean
  /** 改名草稿值。 */
  draftName?: string
  /** 改名草稿变更。 */
  onDraftNameChange?: (value: string) => void
  /** 点击铅笔进入改名；缺省不渲染铅笔按钮。 */
  onBeginRename?: (item: OutlineItemRow) => void
  /** 提交改名（Enter / blur）。 */
  onCommitRename?: (item: OutlineItemRow) => void
  /** 取消改名（Escape）。 */
  onCancelRename?: (item: OutlineItemRow) => void
  onSelect: (id: number) => void
  onDelete: (item: OutlineItemRow) => void
}

/**
 * 单条大纲条目行：圆点 → 名（纯自定义名，空名占位）→ hover 操作（改名 / 删除）→ 拖拽把手。
 * 由卷区（带把手）与置顶区（无把手，可选内联改名）共用；`nested` 供分组子条目缩进。
 */
export default function OutlineChapterRowItem({
  item,
  active,
  dragging = false,
  nested = false,
  registerRow,
  dragHandle,
  renaming = false,
  draftName = '',
  onDraftNameChange,
  onBeginRename,
  onCommitRename,
  onCancelRename,
  onSelect,
  onDelete
}: OutlineChapterRowItemProps) {
  const { t } = useTranslation('outline')
  const isEmpty = item.title.trim() === ''
  // 有拖拽把手 → 操作按钮组右移让位把手（`right: 22px`）；无把手贴右缘（`right: 2px`）。
  const hasGrip = dragHandle !== undefined
  const classes = [
    'outline-chapter',
    active ? 'is-active' : '',
    dragging ? 'is-dragging' : '',
    nested ? 'is-nested' : '',
    hasGrip ? 'has-grip' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={registerRow ? (element) => registerRow(item.id, element) : undefined}
      className={classes}
      onClick={() => onSelect(item.id)}
    >
      <span className="outline-chapter-dot" />
      {renaming ? (
        <input
          className="vol-rename"
          type="text"
          value={draftName}
          autoFocus
          spellCheck={false}
          aria-label={t('rename')}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onDraftNameChange?.(event.target.value)}
          onBlur={() => onCommitRename?.(item)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onCommitRename?.(item)
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onCancelRename?.(item)
            }
          }}
        />
      ) : (
        <span className={`outline-chapter-name${isEmpty ? ' is-empty' : ''}`}>
          {outlineItemLabel(item, t('unnamedChapter'))}
        </span>
      )}
      <span className="outline-chapter-actions" onClick={(event) => event.stopPropagation()}>
        {onBeginRename && (
          <IconButton
            size="sm"
            className="row-act"
            label={t('rename')}
            tooltipPlacement="top"
            onClick={() => onBeginRename(item)}
          >
            <PencilIcon />
          </IconButton>
        )}
        <IconButton
          size="sm"
          className="row-act"
          tone="danger"
          label={t('deleteChapter')}
          tooltipPlacement="top"
          onClick={() => onDelete(item)}
        >
          <TrashIcon />
        </IconButton>
      </span>
      {dragHandle && (
        <span
          className="outline-chapter-grip"
          title={t('dragWithinVolume')}
          onPointerDown={(event) => dragHandle.onPointerDown(event, item)}
          onPointerMove={dragHandle.onPointerMove}
          onPointerUp={dragHandle.onPointerUp}
          onPointerCancel={dragHandle.onPointerCancel}
        >
          <GripVerticalIcon />
        </span>
      )}
    </div>
  )
}

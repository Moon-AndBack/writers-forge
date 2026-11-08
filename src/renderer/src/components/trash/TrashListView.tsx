/**
 * 回收站列表（章节 / 大纲 / 伏笔 / 灵感共用，§9 唯一实现）。
 *
 * 纯展示：不依赖 i18n，文案由调用方经 `t()` 取用后传入（对齐 `EmptyState` 约定）。
 * 样式直接复用 `styles/writer-trash.css`。
 *
 * 「列表 + 详情」为可选能力：传入 `detail` / `detailEmpty` 且存在数据时，经
 * `TrashSplitLayout` 渲染「列表卡 + 分隔条 + 详情卡」两栏（宽度可拖拽并持久化）；
 * 未传详情区或首帧 / 空态 / 错误态时保持单列，head + 列表的 DOM 与改造前一致。
 */
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { Button, IconButton } from '../ui'
import { RestoreIcon, TrashIcon } from '../icons'
import { EmptyState } from '../EmptyState'
import { LoadErrorState } from '../LoadErrorState'
import { TrashSplitLayout } from './TrashSplitLayout'

/** 回收站行：`name` 为主名，`sub` 为次要行（如原归属卷名）。 */
export interface TrashRow {
  id: number
  name: string
  sub?: string
  /** 父卷 id（树形模式）：命中 `volumes` 中同 id 的行时，渲染在该卷行下方。 */
  parentId?: number
}

/** 选中行所属分组：卷 / 条目（两表 id 可能相同，故以 kind 消歧）。 */
export type TrashSelectionKind = 'volume' | 'item'

/** 回收站选中项。 */
export interface TrashSelection {
  kind: TrashSelectionKind
  id: number
}

/** 展示文案（全部由调用方传入已翻译字符串）。 */
export interface TrashListViewMessages {
  title: string
  count: (total: number) => string
  purgeAll: string
  /** 空态标题（复用 `chapters.trash.empty`）。 */
  empty: string
  /** 首帧 / 重试加载中的提示文案（复用 `common.loading`）。 */
  loadingText: string
  groupVolumes: string
  groupItems: string
  restoreVolume: string
  purgeVolume: string
  restoreItem: string
  purgeItem: string
}

export interface TrashListViewProps {
  /** 软删的卷行（单行展示，无次要行）。 */
  volumes: TrashRow[]
  /** 软删的条目行（主名 + 原归属卷名两行展示）。 */
  items: TrashRow[]
  /**
   * 树形模式：父卷也在回收站的条目缩进到该卷行下，其余条目仍留在
   * `messages.groupItems` 残差分组。缺省 false（伏笔 / 灵感保持平铺分组）。
   */
  tree?: boolean
  /** 首帧加载中：显示加载文案并抑制空态闪现。 */
  loading?: boolean
  /** 数据读取失败（无缓存内容时显示错误态与重试入口）。 */
  loadError?: boolean
  /** 错误态重试回调（`loadError` 为 true 时展示）。 */
  onRetry?: () => void
  /** 写操作进行中：禁用全部操作按钮。 */
  busy: boolean
  messages: TrashListViewMessages
  onRestoreVolume(id: number): void
  onPurgeVolume(id: number): void
  onRestoreItem(id: number): void
  onPurgeItem(id: number): void
  onPurgeAll(): void
  /** 附加节点（确认弹窗等），挂在视图末尾。 */
  footer?: ReactNode
  /**
   * 当前选中行（`kind` + `id` 消歧）。仅在传入 `onSelect` 时参与高亮。
   * 不传 = 旧版无选中态。
   */
  selected?: TrashSelection | null
  /**
   * 点击 / 键盘（Enter / Space）选中行。传入后整行可点击、可聚焦。
   * 不传 = 旧版不可交互行。
   */
  onSelect?: (selection: TrashSelection) => void
  /** 详情面板内容（选中时展示）。与 `detailEmpty` 任一传入即启用左右分栏。 */
  detail?: ReactNode
  /** 未选中时的详情区空态。 */
  detailEmpty?: ReactNode
}

/** 行尾操作区：还原 + 彻底删除（两套回收站逐字相同）。 */
function RowActions({
  busy,
  restoreLabel,
  purgeLabel,
  onRestore,
  onPurge
}: {
  busy: boolean
  restoreLabel: string
  purgeLabel: string
  onRestore: () => void
  onPurge: () => void
}): ReactElement {
  return (
    <span
      className="trash-row-actions"
      // 行本身可点击 / 可按 Enter 选中；操作按钮的点击与键盘事件不得冒泡触发行选中。
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <IconButton
        size="sm"
        className="row-act"
        label={restoreLabel}
        tooltipPlacement="top"
        disabled={busy}
        onClick={onRestore}
      >
        <RestoreIcon />
      </IconButton>
      <IconButton
        size="sm"
        className="row-act"
        tone="danger"
        label={purgeLabel}
        tooltipPlacement="top"
        disabled={busy}
        onClick={onPurge}
      >
        <TrashIcon />
      </IconButton>
    </span>
  )
}

/** 单行：卷为单行名，条目为主名 + 次要行（嵌套子行省略次要行）；`onSelect` 存在时整行可交互。 */
function TrashRowItem({
  row,
  kind,
  selectable,
  selected,
  onSelect,
  nested = false,
  children
}: {
  row: TrashRow
  kind: TrashSelectionKind
  selectable: boolean
  selected: boolean
  onSelect?: (selection: TrashSelection) => void
  /** 树形子行：缩进一级，并省略冗余的原归属副标题。 */
  nested?: boolean
  children: ReactNode
}): ReactElement {
  const baseClassName =
    selectable && selected
      ? 'trash-row is-selectable is-selected'
      : selectable
        ? 'trash-row is-selectable'
        : 'trash-row'
  const className = nested ? `${baseClassName} is-nested` : baseClassName

  const pick = (): void => onSelect?.({ kind, id: row.id })

  const onKeyDown = selectable
    ? (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          pick()
        }
      }
    : undefined

  return (
    <div
      className={className}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-pressed={selectable ? selected : undefined}
      onClick={selectable ? pick : undefined}
      onKeyDown={onKeyDown}
    >
      {kind === 'volume' ? (
        <span className="trash-row-name">{row.name}</span>
      ) : (
        <span className="trash-row-main">
          <span className="trash-row-name">{row.name}</span>
          {nested ? null : <span className="trash-row-sub">{row.sub}</span>}
        </span>
      )}
      {children}
    </div>
  )
}

export function TrashListView({
  volumes,
  items,
  tree = false,
  loading = false,
  loadError = false,
  onRetry,
  busy,
  messages,
  onRestoreVolume,
  onPurgeVolume,
  onRestoreItem,
  onPurgeItem,
  onPurgeAll,
  footer,
  selected,
  onSelect,
  detail,
  detailEmpty
}: TrashListViewProps): ReactElement {
  const total = volumes.length + items.length
  const isEmpty = !loading && total === 0
  const selectable = onSelect !== undefined
  // 详情区（含未选中空态）存在即启用分栏；两者都不传时保持旧单列结构。
  // 首帧 / 回收站为空时回到单列：loading 期间 total 仍为 0，不能用 `!isEmpty`
  // 判断，否则会先渲染「选择条目」详情空态、再闪成有数据的双栏。
  const detailEnabled = detail !== undefined || detailEmpty !== undefined
  const split = detailEnabled && total > 0

  const isSelected = (kind: TrashSelectionKind, id: number): boolean =>
    selected !== undefined && selected !== null && selected.kind === kind && selected.id === id

  // 树形分组：仅把「父卷也在回收站」的条目挂到卷行下；无匹配父卷的条目
  // （含大纲 volumeId = null 的独立条目）留在残差分组。条目沿用后端顺序，
  // 按卷归组后组内顺序不变。非树形模式不参与计算。
  const childrenByVolume = new Map<number, TrashRow[]>()
  const residualItems: TrashRow[] = []
  if (tree) {
    const deletedVolumeIds = new Set(volumes.map((volume) => volume.id))
    for (const item of items) {
      const parentId = item.parentId
      if (parentId !== undefined && deletedVolumeIds.has(parentId)) {
        const siblings = childrenByVolume.get(parentId)
        if (siblings) siblings.push(item)
        else childrenByVolume.set(parentId, [item])
      } else {
        residualItems.push(item)
      }
    }
  }

  const volumeRow = (volume: TrashRow): ReactElement => (
    <TrashRowItem
      key={`v-${volume.id}`}
      row={volume}
      kind="volume"
      selectable={selectable}
      selected={isSelected('volume', volume.id)}
      onSelect={onSelect}
    >
      <RowActions
        busy={busy}
        restoreLabel={messages.restoreVolume}
        purgeLabel={messages.purgeVolume}
        onRestore={() => onRestoreVolume(volume.id)}
        onPurge={() => onPurgeVolume(volume.id)}
      />
    </TrashRowItem>
  )

  const itemRow = (item: TrashRow, nested = false): ReactElement => (
    <TrashRowItem
      key={`c-${item.id}`}
      row={item}
      kind="item"
      selectable={selectable}
      selected={isSelected('item', item.id)}
      onSelect={onSelect}
      nested={nested}
    >
      <RowActions
        busy={busy}
        restoreLabel={messages.restoreItem}
        purgeLabel={messages.purgeItem}
        onRestore={() => onRestoreItem(item.id)}
        onPurge={() => onPurgeItem(item.id)}
      />
    </TrashRowItem>
  )

  const head = (
    <div className="trash-head">
      <span className="trash-title">{messages.title}</span>
      <span className="trash-count">{total > 0 ? messages.count(total) : ''}</span>
      <span className="spacer" />
      {total > 0 ? (
        <Button variant="ghost" size="sm" onClick={onPurgeAll} disabled={busy}>
          {messages.purgeAll}
        </Button>
      ) : null}
    </div>
  )

  const list = (
    <div className="trash-scroll">
      <div className="trash-inner">
        {loadError && total === 0 ? (
          <LoadErrorState compact onRetry={() => onRetry?.()} />
        ) : loading && total === 0 ? (
          <div className="trash-loading">{messages.loadingText}</div>
        ) : isEmpty ? (
          <EmptyState compact title={messages.empty} />
        ) : tree ? (
          <>
            {volumes.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupVolumes}</div>
                {volumes.map((volume) => (
                  <div className="trash-tree-group" key={`tv-${volume.id}`}>
                    {volumeRow(volume)}
                    {(childrenByVolume.get(volume.id) ?? []).map((item) => itemRow(item, true))}
                  </div>
                ))}
              </section>
            ) : null}

            {residualItems.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupItems}</div>
                {residualItems.map((item) => itemRow(item))}
              </section>
            ) : null}
          </>
        ) : (
          <>
            {volumes.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupVolumes}</div>
                {volumes.map((volume) => volumeRow(volume))}
              </section>
            ) : null}

            {items.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupItems}</div>
                {items.map((item) => itemRow(item))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className={split ? 'trash-view trash-view--split' : 'trash-view'}>
      {split ? (
        <TrashSplitLayout
          list={
            <>
              {head}
              {list}
            </>
          }
          detail={detail ?? detailEmpty}
        />
      ) : (
        <>
          {head}
          {list}
        </>
      )}
      {footer}
    </div>
  )
}

export default TrashListView

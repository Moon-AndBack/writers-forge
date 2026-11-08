/**
 * 回收站列表（章节 / 大纲共用，§9 唯一实现）。
 *
 * 纯展示：不依赖 i18n，文案由调用方经 `t()` 取用后传入（对齐 `EmptyState` 约定）。
 * 旧单列路径（不传新增的可选 props）的 DOM 结构与 `.trash-*` 类名与改造前逐字一致，
 * 样式直接复用 `styles/writer-trash.css`。
 *
 * 「列表 + 详情」为可选能力：不传 `selected` / `onSelect` / `detail` / `detailEmpty`
 * 时保持旧单列行为与 DOM 完全不变（伏笔 / 灵感回收站即此路径）。
 */
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { Button, IconButton } from '../ui'
import { RestoreIcon, TrashIcon } from '../icons'
import { EmptyState } from '../EmptyState'
import { LoadErrorState } from '../LoadErrorState'

/** 回收站行：`name` 为主名，`sub` 为次要行（如原归属卷名）。 */
export interface TrashRow {
  id: number
  name: string
  sub?: string
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

/** 单行：卷为单行名，条目为主名 + 次要行；`onSelect` 存在时整行可交互。 */
function TrashRowItem({
  row,
  kind,
  selectable,
  selected,
  onSelect,
  children
}: {
  row: TrashRow
  kind: TrashSelectionKind
  selectable: boolean
  selected: boolean
  onSelect?: (selection: TrashSelection) => void
  children: ReactNode
}): ReactElement {
  const className =
    selectable && selected
      ? 'trash-row is-selectable is-selected'
      : selectable
        ? 'trash-row is-selectable'
        : 'trash-row'

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
          <span className="trash-row-sub">{row.sub}</span>
        </span>
      )}
      {children}
    </div>
  )
}

export function TrashListView({
  volumes,
  items,
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
        ) : (
          <>
            {volumes.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupVolumes}</div>
                {volumes.map((volume) => (
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
                ))}
              </section>
            ) : null}

            {items.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupItems}</div>
                {items.map((item) => (
                  <TrashRowItem
                    key={`c-${item.id}`}
                    row={item}
                    kind="item"
                    selectable={selectable}
                    selected={isSelected('item', item.id)}
                    onSelect={onSelect}
                  >
                    <RowActions
                      busy={busy}
                      restoreLabel={messages.restoreItem}
                      purgeLabel={messages.purgeItem}
                      onRestore={() => onRestoreItem(item.id)}
                      onPurge={() => onPurgeItem(item.id)}
                    />
                  </TrashRowItem>
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className={split ? 'trash-view trash-view--split' : 'trash-view'}>
      {head}
      {split ? (
        <div className="trash-body">
          {list}
          <aside className="trash-detail">{detail ?? detailEmpty}</aside>
        </div>
      ) : (
        list
      )}
      {footer}
    </div>
  )
}

export default TrashListView

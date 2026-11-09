/**
 * 回收站列表（章节 / 大纲 / 伏笔 / 灵感共用，§9 唯一实现）。
 *
 * 纯展示：不依赖 i18n，文案由调用方经 `t()` 取用后传入（对齐 `EmptyState` 约定）。
 * 样式直接复用 `styles/writer-trash.css`；树形模式（章节 / 大纲）的增补规则在
 * `styles/writer-trash-tree.css`。
 *
 * 「列表 + 详情」为可选能力：传入 `detail` / `detailEmpty` 且存在数据时，经
 * `TrashSplitLayout` 渲染「列表卡 + 分隔条 + 详情卡」两栏（宽度可拖拽并持久化）；
 * 未传详情区或首帧 / 空态 / 错误态时保持单列，head + 列表的 DOM 与改造前一致。
 */
import { useState } from 'react'
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { Button } from '../ui'
import { EmptyState } from '../EmptyState'
import { LoadErrorState } from '../LoadErrorState'
import TreeRowItem from '../tree/TreeRowItem'
import { TrashSplitLayout } from './TrashSplitLayout'
import { TrashRowActions } from './TrashRowActions'

/** 回收站行：`name` 为主名，`sub` 为非树形模式的次要行（如原归属卷名）。 */
export interface TrashRow {
  id: number
  name: string
  /** 非树形模式的原归属副标题；树形模式不渲染（原归属改到右侧详情查看）。 */
  sub?: string
  /** 父卷 id（树形模式）：命中 `volumes` 中同 id 的行时，渲染在该卷行下方。 */
  parentId?: number
  /** 树形章 / 条目行的前段（特殊章 `specialPrefix`）；普通章 / 大纲条目缺省。 */
  prefix?: string
  /** 树形行尾徽标文案（草稿）；大纲条目缺省。 */
  badge?: string
  /** 树形名段强调（自定义卷 / 特殊章）：名段由 `--text-dim` 转 `--text`。 */
  emphasis?: boolean
  /** 树形卷行计数：该卷下回收站中的章 / 条目数。 */
  count?: number
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
  /** 软删的条目行（非树形模式展示主名 + 原归属卷名）。 */
  items: TrashRow[]
  /**
   * 树形模式：父卷也在回收站的条目挂到该卷行下，其余条目仍留在
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

/**
 * 非树形模式单行（伏笔 / 灵感回收站）：保持改造前的平铺结构与类名逐字不变——
 * 卷为单行名，条目为主名 + 次要行；`onSelect` 存在时整行可交互。
 */
function FlatTrashRow({
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
  const baseClassName =
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
      className={baseClassName}
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

  // 树形卷展开态：白名单，默认空集 = 打开回收站时全部收起（与左栏默认收起一致）。
  const [openVolumes, setOpenVolumes] = useState<ReadonlySet<number>>(() => new Set<number>())
  const toggleVolume = (id: number): void => {
    setOpenVolumes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const volumeActions = (volume: TrashRow, wrapped = true): ReactElement => (
    <TrashRowActions
      busy={busy}
      restoreLabel={messages.restoreVolume}
      purgeLabel={messages.purgeVolume}
      onRestore={() => onRestoreVolume(volume.id)}
      onPurge={() => onPurgeVolume(volume.id)}
      wrapped={wrapped}
    />
  )

  const itemActions = (item: TrashRow, wrapped = true): ReactElement => (
    <TrashRowActions
      busy={busy}
      restoreLabel={messages.restoreItem}
      purgeLabel={messages.purgeItem}
      onRestore={() => onRestoreItem(item.id)}
      onPurge={() => onPurgeItem(item.id)}
      wrapped={wrapped}
    />
  )

  // 非树形（伏笔 / 灵感）：沿用改造前的平铺行组件，DOM / 类名 / 行为逐字不变。
  const flatVolumeRow = (volume: TrashRow): ReactElement => (
    <FlatTrashRow
      key={`v-${volume.id}`}
      row={volume}
      kind="volume"
      selectable={selectable}
      selected={isSelected('volume', volume.id)}
      onSelect={onSelect}
    >
      {volumeActions(volume)}
    </FlatTrashRow>
  )

  const flatItemRow = (item: TrashRow): ReactElement => (
    <FlatTrashRow
      key={`c-${item.id}`}
      row={item}
      kind="item"
      selectable={selectable}
      selected={isSelected('item', item.id)}
      onSelect={onSelect}
    >
      {itemActions(item)}
    </FlatTrashRow>
  )

  // 树形章 / 条目行：复用共享 `TreeRowItem`（圆点 + 可选特殊章前段 + 名段 + 草稿徽标 + 操作）。
  const treeItemRow = (item: TrashRow): ReactElement => (
    <TreeRowItem
      key={`c-${item.id}`}
      id={item.id}
      classPrefix="trash-row"
      activeClass="is-selected"
      active={isSelected('item', item.id)}
      stateClasses={item.emphasis ? ['is-special'] : undefined}
      interactive={selectable}
      onSelect={(id) => onSelect?.({ kind: 'item', id })}
      leading={
        item.prefix !== undefined && item.prefix !== '' ? (
          <>
            <span className="trash-row-prefix">{item.prefix}</span>
            <span className="trash-row-sep" aria-hidden="true">
              ●
            </span>
          </>
        ) : undefined
      }
      nameNode={<span className="trash-row-name">{item.name}</span>}
      badge={item.badge ? <span className="chapter-draft">{item.badge}</span> : null}
      actions={itemActions(item, false)}
    />
  )

  // 树形卷行：箭头（独立折叠）→ 卷名（x=24）→ 计数 → 操作；其余区域选中看详情。
  const treeVolumeRow = (volume: TrashRow): ReactElement => {
    const open = openVolumes.has(volume.id)
    const children = childrenByVolume.get(volume.id) ?? []
    return (
      <div className="trash-tree-group" key={`tv-${volume.id}`}>
        <TreeRowItem
          id={volume.id}
          classPrefix="trash-row"
          activeClass="is-selected"
          active={isSelected('volume', volume.id)}
          stateClasses={volume.emphasis ? ['is-special'] : undefined}
          interactive={selectable}
          showDot={false}
          chevron={{
            expanded: open,
            label: volume.name,
            onToggle: () => toggleVolume(volume.id)
          }}
          onSelect={(id) => onSelect?.({ kind: 'volume', id })}
          nameNode={<span className="trash-row-name">{volume.name}</span>}
          badge={
            volume.count !== undefined ? (
              <span className="trash-row-count">{volume.count}</span>
            ) : null
          }
          actions={volumeActions(volume, false)}
        />
        {children.length > 0 && (
          <div className={`trash-children${open ? ' is-open' : ''}`} inert={!open}>
            <div className="trash-children-inner">
              <div className="trash-children-list">{children.map((item) => treeItemRow(item))}</div>
            </div>
          </div>
        )}
      </div>
    )
  }

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
                {volumes.map((volume) => treeVolumeRow(volume))}
              </section>
            ) : null}

            {residualItems.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupItems}</div>
                <div className="trash-tree-residual">
                  {residualItems.map((item) => treeItemRow(item))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <>
            {volumes.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupVolumes}</div>
                {volumes.map((volume) => flatVolumeRow(volume))}
              </section>
            ) : null}

            {items.length > 0 ? (
              <section className="trash-group">
                <div className="trash-group-title">{messages.groupItems}</div>
                {items.map((item) => flatItemRow(item))}
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

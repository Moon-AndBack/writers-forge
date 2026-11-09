/**
 * 回收站列表（章节 / 大纲 / 伏笔 / 灵感共用，§9 唯一实现）。
 *
 * 纯展示：不依赖 i18n，文案由调用方经 `t()` 取用后传入（对齐 `EmptyState` 约定）。
 * 样式直接复用 `styles/writer-trash.css`；树形模式（大纲）的增补规则在
 * `styles/writer-trash-tree.css`。章节回收站第三批起改为**纯平铺章列表**，不传卷。
 *
 * 「列表 + 详情」为可选能力：传入 `detail` / `detailEmpty` 且存在数据时，经
 * `TrashSplitLayout` 渲染「列表卡 + 分隔条 + 详情卡」两栏（宽度可拖拽并持久化）；
 * 未传详情区或首帧 / 空态 / 错误态时保持单列，head + 列表的 DOM 与改造前一致。
 * 传 `sections` 切换为左侧三卡（标题卡固定 + 内容卡共享滚动）：每个 section 可选
 * `volumes` 自带卷树（大纲「分组大纲」），不传 / 空数组走平铺。不传 `sections` 时
 * 仍走旧单卡结构，伏笔 / 灵感回收站视觉逐字不变。
 */
import { useState } from 'react'
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { Button } from '../ui'
import { EmptyState } from '../EmptyState'
import { LoadErrorState } from '../LoadErrorState'
import { TrashSplitLayout } from './TrashSplitLayout'
import { TrashRowActions } from './TrashRowActions'
import { TrashSectionList } from './TrashSectionList'
import type { TrashSection } from './TrashSectionList'
import { TrashTreeSection } from './TrashTreeSection'

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
  /** 平铺模式行首状态圆点（章节 / 大纲单大纲）；缺省 false（伏笔 / 灵感不渲染）。 */
  showDot?: boolean
  /** 树形卷行计数：该卷下回收站中的章 / 条目数。 */
  count?: number
  /** 三卡模式的归属段 key（对应 `sections[].key`）；缺省归入第一段。 */
  sectionKey?: string
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
  /** 卷分组标题（可选：章节回收站只列章，不传）。 */
  groupVolumes?: string
  groupItems: string
  /** 卷行操作文案（可选：章节回收站只列章，不传）。 */
  restoreVolume?: string
  purgeVolume?: string
  restoreItem: string
  purgeItem: string
}

export interface TrashListViewProps {
  /** 软删的卷行（仅旧单卡树形模式使用；三卡模式改由 `sections[].volumes` 传入）。 */
  volumes?: TrashRow[]
  /** 软删的条目行（平铺模式：主名 + 可选次要行；章节不传次要行）。 */
  items: TrashRow[]
  /**
   * 旧单卡树形模式：父卷也在回收站的条目挂到该卷行下，其余条目仍留在
   * `messages.groupItems` 残差分组。缺省 false（章节 / 伏笔 / 灵感保持平铺分组）。
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
  onRestoreVolume?: (id: number) => void
  onPurgeVolume?: (id: number) => void
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
  /**
   * 左侧三卡模式（章节 / 大纲回收站）：items 按 `sectionKey` 分组，渲染「标题卡 + 各内容卡」，
   * 空段隐藏；卷行随 `sections[].volumes` 传入（section 内有卷时走树形），顶层 `volumes`
   * 不参与分组 / 计数。缺省保持旧单卡平铺 / 树形结构（伏笔 / 灵感 / 大纲旧路径）。
   */
  sections?: TrashSection[]
}

/**
 * 非树形模式单行（章节 / 伏笔 / 灵感回收站）：保持改造前的平铺结构与类名逐字不变——
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
  const baseClassName = [
    'trash-row',
    selectable ? 'is-selectable' : null,
    selectable && selected ? 'is-selected' : null,
    row.emphasis ? 'is-special' : null
  ]
    .filter(Boolean)
    .join(' ')

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
      {row.showDot ? <span className="trash-row-dot" /> : null}
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
  volumes = [],
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
  detailEmpty,
  sections = []
}: TrashListViewProps): ReactElement {
  const sectionsEnabled = sections.length > 0
  // 三卡模式的卷随 sections 自带，避免与顶层 `volumes` 重复计数。
  const sectionVolumeCount = sections.reduce(
    (sum, section) => sum + (section.volumes?.length ?? 0),
    0
  )
  const total = (sectionsEnabled ? sectionVolumeCount : volumes.length) + items.length
  const isEmpty = !loading && total === 0
  const selectable = onSelect !== undefined
  // 详情区（含未选中空态）存在即启用分栏；两者都不传时保持旧单列结构。
  // 首帧 / 回收站为空时回到单列：loading 期间 total 仍为 0，不能用 `!isEmpty`
  // 判断，否则会先渲染「选择条目」详情空态、再闪成有数据的双栏。
  const detailEnabled = detail !== undefined || detailEmpty !== undefined
  const split = detailEnabled && total > 0

  // 树形卷展开态：白名单，默认空集 = 打开回收站时全部收起（与左栏默认收起一致）。
  // 状态留在列表层，分栏切换导致子树重建时不会丢失已展开的卷。
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

  const volumeActions = (volume: TrashRow, wrapped = true): ReactElement => (
    <TrashRowActions
      busy={busy}
      restoreLabel={messages.restoreVolume ?? ''}
      purgeLabel={messages.purgeVolume ?? ''}
      onRestore={() => onRestoreVolume?.(volume.id)}
      onPurge={() => onPurgeVolume?.(volume.id)}
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

  // 非树形（章节 / 伏笔 / 灵感）：沿用改造前的平铺行组件，DOM / 类名 / 行为逐字不变。
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
          <TrashTreeSection
            volumes={volumes}
            items={items}
            openVolumes={openVolumes}
            onToggleVolume={toggleVolume}
            legacyGroups
            groupVolumesLabel={messages.groupVolumes}
            groupItemsLabel={messages.groupItems}
            selectable={selectable}
            isSelected={isSelected}
            onSelect={onSelect}
            renderVolumeActions={(volume) => volumeActions(volume, false)}
            renderItemActions={(item) => itemActions(item, false)}
          />
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

  // 三卡模式：head 作为固定标题卡，items 按 sectionKey 分入内容卡；
  // section 自带非空 volumes 时走树形，否则保持平铺。不传 sections 时继续走旧结构。
  const content = sectionsEnabled ? (
    <TrashSectionList
      head={head}
      sections={sections}
      items={items}
      loading={loading}
      loadError={loadError}
      onRetry={onRetry}
      loadingText={messages.loadingText}
      emptyText={messages.empty}
      renderRow={flatItemRow}
      renderSectionRows={(section, rows) =>
        (section.volumes?.length ?? 0) > 0 ? (
          <TrashTreeSection
            volumes={section.volumes ?? []}
            items={rows}
            openVolumes={openVolumes}
            onToggleVolume={toggleVolume}
            groupItemsLabel={messages.groupItems}
            selectable={selectable}
            isSelected={isSelected}
            onSelect={onSelect}
            renderVolumeActions={(volume) => volumeActions(volume, false)}
            renderItemActions={(item) => itemActions(item, false)}
          />
        ) : (
          rows.map((row) => flatItemRow(row))
        )
      }
    />
  ) : (
    <>
      {head}
      {list}
    </>
  )

  // 根类名按原顺序拼接：不传 sections 时与改造前逐字一致。
  const viewClassName = [
    'trash-view',
    split ? 'trash-view--split' : null,
    sectionsEnabled ? 'trash-view--sections' : null
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={viewClassName}>
      {split ? <TrashSplitLayout list={content} detail={detail ?? detailEmpty} /> : content}
      {footer}
    </div>
  )
}

export default TrashListView

/**
 * 回收站树形分组（大纲回收站）：卷行 + 其下条目（父子归组 / 独立折叠）+ 残差条目。
 *
 * 共用同一套行构造与折叠状态，两种装载方式：
 * - `legacyGroups`：旧单卡树形结构，输出「卷 / 条目」两个 `<section class="trash-group">`，
 *   与改造前 DOM 逐字一致；
 * - 缺省：作为三卡内容卡正文，只输出卷树与残差条目（卡片标题由调用方渲染）。
 */
import type { ReactElement, ReactNode } from 'react'
import TreeRowItem from '../tree/TreeRowItem'
import type { TrashRow, TrashSelection, TrashSelectionKind } from './TrashListView'

export interface TrashTreeSectionProps {
  /** 本段卷行；父卷命中此列表的条目才会缩进。 */
  volumes: TrashRow[]
  /** 本段条目行；按 `parentId` 自动归组，父卷不在 `volumes` 中则进残差。 */
  items: TrashRow[]
  /** 展开的卷 id 白名单（由调用方持有，跨分栏切换不重置）。 */
  openVolumes: ReadonlySet<number>
  onToggleVolume: (id: number) => void
  /** 旧单卡树形模式：输出「卷 / 条目」分组及标题（DOM 与改造前一致）。 */
  legacyGroups?: boolean
  groupVolumesLabel?: string
  groupItemsLabel: string
  selectable: boolean
  isSelected: (kind: TrashSelectionKind, id: number) => boolean
  onSelect?: (selection: TrashSelection) => void
  renderVolumeActions: (volume: TrashRow) => ReactNode
  renderItemActions: (item: TrashRow) => ReactNode
}

export function TrashTreeSection({
  volumes,
  items,
  openVolumes,
  onToggleVolume,
  legacyGroups = false,
  groupVolumesLabel,
  groupItemsLabel,
  selectable,
  isSelected,
  onSelect,
  renderVolumeActions,
  renderItemActions
}: TrashTreeSectionProps): ReactElement {
  // 树形分组：仅把「父卷也在本段回收站」的条目挂到卷行下；无匹配父卷的条目
  // （含大纲 volumeId = null 的独立条目）留在残差。条目沿用后端顺序，
  // 按卷归组后组内顺序不变。
  const childrenByVolume = new Map<number, TrashRow[]>()
  const residualItems: TrashRow[] = []
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

  // 树形条目行：复用共享 `TreeRowItem`（圆点 + 可选特殊章前段 + 名段 + 草稿徽标 + 操作）。
  const itemRow = (item: TrashRow): ReactElement => (
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
      actions={renderItemActions(item)}
    />
  )

  // 树形卷行：箭头（独立折叠）→ 卷名（x=24）→ 计数 → 操作；其余区域选中看详情。
  const volumeRow = (volume: TrashRow): ReactElement => {
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
            onToggle: () => onToggleVolume(volume.id)
          }}
          onSelect={(id) => onSelect?.({ kind: 'volume', id })}
          nameNode={<span className="trash-row-name">{volume.name}</span>}
          badge={
            volume.count !== undefined ? (
              <span className="trash-row-count">{volume.count}</span>
            ) : null
          }
          actions={renderVolumeActions(volume)}
        />
        {children.length > 0 && (
          <div className={`trash-children${open ? ' is-open' : ''}`} inert={!open}>
            <div className="trash-children-inner">
              <div className="trash-children-list">{children.map((item) => itemRow(item))}</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const volumeRows = volumes.map((volume) => volumeRow(volume))
  const residualRows =
    residualItems.length > 0 ? (
      <div className="trash-tree-residual">{residualItems.map((item) => itemRow(item))}</div>
    ) : null

  if (legacyGroups) {
    return (
      <>
        {volumes.length > 0 ? (
          <section className="trash-group">
            <div className="trash-group-title">{groupVolumesLabel}</div>
            {volumeRows}
          </section>
        ) : null}

        {residualItems.length > 0 ? (
          <section className="trash-group">
            <div className="trash-group-title">{groupItemsLabel}</div>
            {residualRows}
          </section>
        ) : null}
      </>
    )
  }

  return (
    <>
      {volumeRows}
      {residualRows}
    </>
  )
}

export default TrashTreeSection

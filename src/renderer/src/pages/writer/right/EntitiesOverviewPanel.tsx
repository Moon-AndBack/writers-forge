/**
 * 章节 / 大纲模块右栏「实体」页签：**全书五域实体只读总览**。
 *
 * - **数据一次拉全**：`useBookEntities` 经一次 `worldEntity.list(bookId)` 拉全书五域实体，
 *   前端按五个设定域分组（`groupBookEntities`，空组不渲染），**组标题即模块名**（`module` ns）；
 *   卡片与分组不需要逐条 `get`——只有进详情取富文本正文时才补一次；
 * - **两级视图**：列表 → 只读详情（共享 `useReadonlyOverviewSelection`，右栏内完成，
 *   不离开章节模块）；有选中行时渲染 `EntityReadonlyDetail`（无编辑 / 保存 / 删除入口，
 *   底部返回栏回列表）。列表只被 `hidden`、常驻挂载，返回时**保留滚动位置**；
 * - **卡片复用**：中栏设定档案卡 `DossierCard` 的 `compact` 变体（AGENTS §9：不复制平行
 *   组件）；不传编辑 / 关系 / 删除入口，故卡片只保留「点卡进详情」的按钮语义；
 * - **实体悬停**：整个总览共用一个 `useEntityHover` + 一个 `HoverCard`。关系胶囊经
 *   `showFor` 显式锚定，详情正文经根容器事件委托定位 `span[data-entity-id]`；
 * - **布局签名**：观察首个分组网格的单卡内容可用宽（`useStableMeasure`），拖宽右栏后
 *   触发关系胶囊容量重测（与伏笔总览同口径）；
 * - **三态**：共享 `ReadonlyOverviewList`（loading → error → empty → content）。
 */
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { readGridCardWidth } from '../../../components/cardGridMetrics'
import { useStableMeasure } from '../../../components/useStableMeasure'
import { DossierCard } from '../dossier/DossierCard'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import { EntityReadonlyDetail } from './EntityReadonlyDetail'
import { ReadonlyOverviewList } from './ReadonlyOverviewList'
import { useBookEntities } from './useBookEntities'
import { useReadonlyOverviewSelection } from './useReadonlyOverviewSelection'

export interface EntitiesOverviewPanelProps {
  /** 当前书籍 id（空串 = 未进入书籍，不拉数据）。 */
  bookId: string
  /** 页签是否可见（惰性加载：不可见时不拉数据）。 */
  active: boolean
}

/** 实体右栏总览（按五域分组；点卡片 → 右栏内只读详情；无编辑入口）。 */
export function EntitiesOverviewPanel({
  bookId,
  active
}: EntitiesOverviewPanelProps): ReactElement {
  const { t } = useTranslation('entities')
  // 组标题取模块名（同 `useModuleLabel` 的 `module` ns，循环内不能调用 hook）。
  const { t: tModule } = useTranslation('module')
  const { rows, groups, total, loading, loadError, reload } = useBookEntities(bookId, active)
  const { selectedRow, listHidden, select, back } = useReadonlyOverviewSelection(rows)
  // 布局签名：首个分组网格的单卡内容可用宽（各组同宽）。`gridNode` 变化时重建 RefObject，
  // 让 `useStableMeasure` 重新绑定观察目标（分组状态变化会让首个 `section` 换 key）。
  const [gridNode, setGridNode] = useState<HTMLDivElement | null>(null)
  const gridRef = useMemo(() => ({ current: gridNode }), [gridNode])
  const layoutKey = useStableMeasure(gridRef, rows.length > 0, readGridCardWidth)
  // 实体悬停卡：所有分组与详情共用一个控制器 + 一个 `HoverCard`。
  const entityHover = useEntityHover()

  return (
    <>
      <div className="rp-panel">
        <ReadonlyOverviewList
          hidden={listHidden}
          loading={loading && total === 0}
          loadError={loadError && total === 0}
          isEmpty={total === 0}
          emptyText={t('overview.empty')}
          onRetry={reload}
        >
          {groups.map((group, groupIndex) => (
            <section key={group.module} className="trash-group entities-overview-group">
              <h4 className="entities-overview-group__title">{tModule(group.module)}</h4>
              <div
                className="wf-card-grid entities-overview-grid"
                ref={groupIndex === 0 ? setGridNode : undefined}
                onMouseOver={entityHover.onMouseOver}
                onMouseLeave={entityHover.onMouseLeave}
              >
                {group.rows.map((row) => (
                  <DossierCard
                    key={row.id}
                    row={row}
                    bookId={bookId}
                    active={false}
                    compact
                    layoutKey={layoutKey}
                    onSelect={(id) => {
                      // 切换视图前收掉可能残留的实体悬停卡（列表即将 hidden）。
                      entityHover.close()
                      select(id)
                    }}
                    onChipEnter={(event, peerId) =>
                      entityHover.showFor(event.currentTarget, peerId)
                    }
                    onChipLeave={entityHover.onMouseLeave}
                  />
                ))}
              </div>
            </section>
          ))}
        </ReadonlyOverviewList>

        {/* 只读详情：与列表共用一个实体悬停控制器（`HoverCard` 仍只挂在本面板一次）。 */}
        {selectedRow === null ? null : (
          <EntityReadonlyDetail
            row={selectedRow}
            bookId={bookId}
            entityHover={entityHover}
            onBack={() => {
              entityHover.close()
              back()
            }}
          />
        )}
      </div>

      {/* 实体悬停卡：整个总览共用一个（数据走 `entities.get`，经 LRU 缓存）。 */}
      <HoverCard
        anchor={entityHover.anchor}
        onClose={entityHover.close}
        onPointerEnter={entityHover.cancelHide}
        onPointerLeave={entityHover.onMouseLeave}
      />
    </>
  )
}

export default EntitiesOverviewPanel

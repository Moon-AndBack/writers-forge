/**
 * 章节 / 大纲模块右栏「实体」页签：**全书五域实体只读总览**。
 *
 * - **数据一次拉全**：`useBookEntities` 经一次 `worldEntity.list(bookId)` 拉全书五域实体，
 *   卡片**不需要逐条 `get`**——只有进详情取富文本正文时才补一次；
 * - **平铺 + 名称排序**：不按设定域分组，所有实体共用一个卡片网格，顺序由
 *   `sortBookEntityRows` 按名称决定（中文拼音序，同名按 id），且在**过滤之后**确定；
 * - **两级视图**：列表 → 只读详情（共享 `useReadonlyOverviewSelection`，右栏内完成，
 *   不离开章节模块）；有选中行时渲染 `EntityReadonlyDetail`（无编辑 / 保存 / 删除入口，
 *   底部返回栏回列表）。列表只被 `hidden`、常驻挂载，返回时**保留滚动位置**；
 * - **卡片复用**：中栏设定档案卡 `DossierCard` 的 `compact` 变体（AGENTS §9：不复制平行
 *   组件）；不传编辑 / 关系 / 删除入口，故卡片只保留「点卡进详情」的按钮语义；
 * - **筛选**：列表卡上方一张独立筛选卡（模块下拉 + 子类下拉 + 搜索）。模块选项从已加载
 *   行提取（按 `DOSSIER_MODULES` 排序），子类选项只列**当前模块**下的子类且只显示纯
 *   名称；模块为「全部模块」时子类下拉禁用。关键词只匹配名称 / 别名 / 子类，不扫正文。
 *   全部无命中时在列表卡内提示「没有匹配的实体」；
 * - **实体悬停**：整个总览共用一个 `useEntityHover` + 一个 `HoverCard`。关系胶囊经
 *   `showFor` 显式锚定，详情正文经根容器事件委托定位 `span[data-entity-id]`；
 * - **布局签名**：观察网格的单卡内容可用宽（`useStableMeasure`），拖宽右栏后
 *   触发关系胶囊容量重测（与伏笔总览同口径）；
 * - **三态**：共享 `ReadonlyOverviewList`（loading → error → empty → content）。
 */
import { useCallback, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { readGridCardWidth } from '../../../components/cardGridMetrics'
import { SearchInput, Select } from '../../../components/ui'
import { VirtualCardGrid } from '../../../components/VirtualCardGrid'
import { useFilterQueryDraft } from '../../../components/useFilterQueryDraft'
import { useStableMeasure } from '../../../components/useStableMeasure'
import { DossierCard } from '../dossier/DossierCard'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import { EntityReadonlyDetail } from './EntityReadonlyDetail'
import { ReadonlyOverviewList } from './ReadonlyOverviewList'
import {
  buildEntityModuleOptions,
  buildEntitySubtypeOptions,
  filterBookEntityRows,
  sortBookEntityRows,
  useBookEntities
} from './useBookEntities'
import { useReadonlyOverviewSelection } from './useReadonlyOverviewSelection'

export interface EntitiesOverviewPanelProps {
  /** 当前书籍 id（空串 = 未进入书籍，不拉数据）。 */
  bookId: string
  /** 页签是否可见（惰性加载：不可见时不拉数据）。 */
  active: boolean
}

/** 两个筛选下拉共用的「全部」哨兵值：真实 value 为 `entityType` / 子类名，不会撞车。 */
const ALL_FILTER = 'all'

/** 实体右栏总览（平铺、按名称排序；点卡片 → 右栏内只读详情；无编辑入口）。 */
export function EntitiesOverviewPanel({
  bookId,
  active
}: EntitiesOverviewPanelProps): ReactElement {
  const { t } = useTranslation('entities')
  // 模块下拉的标签取模块名（同 `useModuleLabel` 的 `module` ns，循环内不能调用 hook）。
  const { t: tModule } = useTranslation('module')
  const { rows, total, loading, loadError, reload } = useBookEntities(bookId, active)
  // 筛选：关键词走共享草稿（防抖 + IME），两个下拉立即生效；三者都只喂给本面板列表。
  const [query, setQuery] = useState('')
  const [entityType, setEntityType] = useState<string | null>(null)
  const [subType, setSubType] = useState<string | null>(null)
  const draft = useFilterQueryDraft(query, setQuery)
  const moduleOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('filter.moduleAll') },
      ...buildEntityModuleOptions(rows, tModule)
    ],
    [rows, t, tModule]
  )
  // 子类选项只取当前模块：未选模块（「全部模块」）时下拉禁用，不跨域混列同名子类。
  const subtypeOptions = useMemo(
    () => [
      { value: ALL_FILTER, label: t('filter.subtypeAll') },
      ...buildEntitySubtypeOptions(rows, entityType)
    ],
    [rows, entityType, t]
  )
  // 切换模块必须重置子类：旧子类多半不属于新模块，残留会过滤出 0 条。
  const changeModule = (value: string): void => {
    setEntityType(value === ALL_FILTER ? null : value)
    setSubType(null)
  }
  // 先过滤再排序：模块 / 子类 / 关键词取交集，命中结果按名称升序（同名按 id）平铺。
  const filteredRows = useMemo(
    () => sortBookEntityRows(filterBookEntityRows(rows, query, entityType, subType)),
    [rows, query, entityType, subType]
  )
  const { selectedRow, listHidden, select, back } = useReadonlyOverviewSelection(rows)
  // 布局签名：网格的单卡内容可用宽。`gridNode` 变化时重建 RefObject，让
  // `useStableMeasure` 重新绑定观察目标（空态与网格切换会重挂 ref）。
  const [gridNode, setGridNode] = useState<HTMLDivElement | null>(null)
  const gridRef = useMemo(() => ({ current: gridNode }), [gridNode])
  const layoutKey = useStableMeasure(gridRef, filteredRows.length > 0, readGridCardWidth)
  // 实体悬停卡：列表与详情共用一个控制器 + 一个 `HoverCard`。
  const entityHover = useEntityHover()
  // 卡片回调保持稳定引用：`DossierCard` 已 `memo`，内联箭头会击穿记忆化。
  const handleSelect = useCallback(
    (id: number): void => {
      // 切换视图前收掉可能残留的实体悬停卡（列表即将 hidden）。
      entityHover.close()
      select(id)
    },
    [entityHover, select]
  )
  const handleChipEnter = useCallback(
    (event: ReactMouseEvent<HTMLElement>, peerId: number): void => {
      entityHover.showFor(event.currentTarget, peerId)
    },
    [entityHover]
  )

  return (
    <>
      <div className="rp-panel">
        {/* 筛选卡：与剧情页签同款独立软底卡；进详情或整本书无实体时不渲染，
            查询词 / 模块 / 子类留在 state，返回列表时恢复。 */}
        {listHidden || total === 0 ? null : (
          <div className="pane-region rp-card rp-entity-filters on-soft">
            <Select
              size="sm"
              value={entityType ?? ALL_FILTER}
              onChange={changeModule}
              options={moduleOptions}
              ariaLabel={t('filter.moduleAria')}
            />
            <Select
              size="sm"
              value={subType ?? ALL_FILTER}
              onChange={(value) => setSubType(value === ALL_FILTER ? null : value)}
              options={subtypeOptions}
              disabled={entityType === null}
              ariaLabel={t('filter.subtypeAria')}
            />
            <SearchInput
              value={draft.value}
              onChange={draft.onChange}
              onCompositionStart={draft.onCompositionStart}
              onCompositionEnd={draft.onCompositionEnd}
              onKeyDown={draft.onKeyDown}
              onBlur={draft.onBlur}
              onClear={draft.onClear}
              placeholder={t('filter.searchPlaceholder')}
              aria-label={t('filter.searchAria')}
            />
          </div>
        )}

        <ReadonlyOverviewList
          hidden={listHidden}
          loading={loading && total === 0}
          loadError={loadError && total === 0}
          isEmpty={total === 0}
          emptyText={t('overview.empty')}
          onRetry={reload}
        >
          {filteredRows.length === 0 ? (
            <div className="rp-list-empty">{t('filter.noMatch')}</div>
          ) : (
            <VirtualCardGrid
              className="wf-card-grid entities-overview-grid"
              gridRef={setGridNode}
              gridProps={{
                onMouseOver: entityHover.onMouseOver,
                onMouseLeave: entityHover.onMouseLeave
              }}
              onScroll={entityHover.close}
              items={filteredRows}
              getKey={(row) => row.id}
              renderCard={(row) => (
                <DossierCard
                  row={row}
                  bookId={bookId}
                  active={false}
                  compact
                  layoutKey={layoutKey}
                  onSelect={handleSelect}
                  onChipEnter={handleChipEnter}
                  onChipLeave={entityHover.onMouseLeave}
                />
              )}
            />
          )}
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

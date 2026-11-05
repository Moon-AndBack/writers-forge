/**
 * 章节模块右栏「伏笔」页签：**全书伏笔只读总览**。
 *
 * - 数据经 `useBookForeshadowGroups` 拉取并按派生状态分组（空组不渲染）；
 * - 分组只保留容器 `section`（复用 `.trash-group` 的块级语义），**不显示分组标题与
 *   条数**——状态已由卡片自带的胶囊（`ForeshadowItem` 内 `Tag`）表达；组间间距由
 *   本面板专属类 `.foreshadow-overview-group` 覆盖（不改进两处回收站共用的 `.trash-group`）；
 * - **两级视图**：列表 → 只读详情（`selectedId` 切换，右栏内完成，不离开章节模块）；
 *   有选中行时渲染 `ForeshadowReadonlyDetail`（无任何编辑 / 保存 / 废弃 / 删除 / 移除入口，
 *   底部独立底色返回栏回列表）。列表只被 `hidden`、常驻挂载，返回时**保留滚动位置**；
 *   选中行被删 / 刷新后 `selectedRow` 自然为 `null`，自动回落列表；
 * - 每组 = 卡片网格；卡片复用中栏 `ForeshadowItem` 的
 *   `readonly` / `compact` 变体（AGENTS §9：不复制平行组件）——`readonly` 仅隐藏删除按钮，
 *   传 `onSelect` 后卡片仍保留按钮语义（点击进只读详情）；
 * - **相关实体同中栏口径**：三组卡片先摊平成 `rows` 交 `useForeshadowEntityMatches`
 *   批量匹配（缓存共享，一次 `entities:revision` + 一次 `entities:matchMany`），
 *   每卡传自己的胶囊；悬停实体胶囊经事件委托（整组网格挂一个 `HoverCard`）显示实体卡；
 * - **布局签名**：观察首个分组网格的单卡内容可用宽（`useStableMeasure`），拖宽右栏后
 *   触发实体胶囊容量重测，否则「+N」收口会停在旧宽度；
 * - 全书无伏笔时显示空态；首次加载且无数据时显示通用加载文案。
 */
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { readGridCardWidth } from '../../../components/cardGridMetrics'
import { useStableMeasure } from '../../../components/useStableMeasure'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import ForeshadowItem from '../foreshadow/ForeshadowItem'
import ForeshadowReadonlyDetail from '../foreshadow/ForeshadowReadonlyDetail'
import type { ForeshadowRow } from '../foreshadow/foreshadowTree'
import { useForeshadowEntityMatches } from '../foreshadow/useForeshadowEntityMatches'
import type { ForeshadowEntityChip } from '../foreshadow/useForeshadowEntityMatches'
import type { OutlineItemRow } from '../outline/outlineTree'
import { useBookForeshadowGroups } from './useBookForeshadowGroups'

/** 无相关实体时的恒等空数组（引用稳定，避免卡片按长度签名做无谓重测）。 */
const EMPTY_ENTITIES: readonly ForeshadowEntityChip[] = []

export interface ForeshadowOverviewPanelProps {
  /** 当前书籍 id（空串 = 未进入书籍，不拉数据）。 */
  bookId: string
  /** 页签是否可见（惰性加载：不可见时不拉数据）。 */
  active: boolean
  /** 未删除章（卡片解析埋点 / 回收位置）。 */
  chapters: readonly ChapterRow[]
  /** 章节页可见卷（补全「卷 · 章」完整位置）。 */
  volumes: readonly VolumeRow[]
  /** 未删除大纲条目（解析大纲锚点目标名）。 */
  outlineItems: readonly OutlineItemRow[]
}

/** 伏笔右栏总览（可点卡片 → 右栏内只读详情；列表无删除入口）。 */
export function ForeshadowOverviewPanel({
  bookId,
  active,
  chapters,
  volumes,
  outlineItems
}: ForeshadowOverviewPanelProps): ReactElement {
  const { t } = useTranslation('foreshadow')
  const { t: tCommon } = useTranslation('common')
  const { groups, total, loading } = useBookForeshadowGroups(bookId, active)
  // 摊平分组：实体匹配按「行」批量计算（与中栏共用同一批量通道与段落缓存）。
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups])
  // 列表 → 只读详情：`selectedId` 只在右栏内切换；行被删 / 刷新后按 id 派生为 `null`，
  // 无需同步 effect 即自动回落列表（与中栏 `deleteRow` 同一派生口径）。
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedRow = useMemo(
    () => (selectedId === null ? null : (rows.find((row) => row.id === selectedId) ?? null)),
    [rows, selectedId]
  )
  const entityMatches = useForeshadowEntityMatches(bookId, rows)
  // 布局签名：首个分组网格的单卡内容可用宽（各组同宽）。`gridNode` 变化时重建 RefObject，
  // 让 `useStableMeasure` 重新绑定观察目标——分组状态变化会让首个 `section` 换 key，
  // 只挂固定 RefObject 会继续观察已卸载的旧网格。
  const [gridNode, setGridNode] = useState<HTMLDivElement | null>(null)
  const gridRef = useMemo(() => ({ current: gridNode }), [gridNode])
  const layoutKey = useStableMeasure(gridRef, rows.length > 0, readGridCardWidth)
  // 实体悬停卡：所有分组共用一个控制器 + 一个 `HoverCard`，胶囊经事件委托定位。
  const entityHover = useEntityHover()

  return (
    <>
      <div className="rp-panel">
        {/* 列表卡底座：`pane-region`（--soft-solid 软底 + --r-lg 圆角）与剧情 / 大纲 /
            AI 三个页签同款，缺了它 `.rp-card` 只剩一圈内描边、透出栏底（AGENTS §9：复用通用类）。
            进入详情时只加 `hidden`、不卸载：返回列表时滚动位置仍在。 */}
        <div className="pane-region rp-card rp-card--list" hidden={selectedRow !== null}>
          {loading && total === 0 ? (
            <div className="rp-list-empty">{tCommon('loading')}</div>
          ) : total === 0 ? (
            <div className="rp-list-empty">{t('overview.empty')}</div>
          ) : (
            groups.map((group, groupIndex) => {
              return (
                <section key={group.status} className="trash-group foreshadow-overview-group">
                  <div
                    className="wf-card-grid foreshadow-overview-grid"
                    ref={groupIndex === 0 ? setGridNode : undefined}
                    onMouseOver={entityHover.onMouseOver}
                    onMouseLeave={entityHover.onMouseLeave}
                  >
                    {group.rows.map((row: ForeshadowRow) => (
                      <ForeshadowItem
                        key={row.id}
                        row={row}
                        active={false}
                        readonly
                        compact
                        chapters={chapters}
                        volumes={volumes}
                        outlineItems={outlineItems}
                        entities={entityMatches.get(row.id) ?? EMPTY_ENTITIES}
                        layoutKey={layoutKey}
                        entityHover={entityHover}
                        onSelect={(id) => {
                          // 切换视图前收掉可能残留的实体悬停卡（列表即将 hidden）。
                          entityHover.close()
                          setSelectedId(id)
                        }}
                      />
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </div>

        {/* 只读详情：与列表共用一个实体悬停控制器（`HoverCard` 仍只挂在本面板一次）。 */}
        {selectedRow === null ? null : (
          <ForeshadowReadonlyDetail
            row={selectedRow}
            bookId={bookId}
            chapters={chapters}
            volumes={volumes}
            outlineItems={outlineItems}
            entities={entityMatches.get(selectedRow.id) ?? EMPTY_ENTITIES}
            entityHover={entityHover}
            onBack={() => {
              entityHover.close()
              setSelectedId(null)
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

export default ForeshadowOverviewPanel

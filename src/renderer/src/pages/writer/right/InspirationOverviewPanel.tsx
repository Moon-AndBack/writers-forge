/**
 * 章节模块右栏「灵感」页签：**全书灵感只读平铺总览**。
 *
 * - 数据经 `useBookInspirations` 拉取，保持后端顺序（`updated_at DESC, id DESC`，
 *   与灵感模块列表一致），**不分组**（标签筛选是灵感模块自己的焦点，这里显示全书）；
 * - **两级视图**：列表 → 只读详情（选中态走共享 `useReadonlyOverviewSelection`，
 *   右栏内完成，不离开章节模块）；有选中行时渲染 `InspirationReadonlyDetail`（无任何
 *   编辑 / 保存 / 删除入口，底部返回栏回列表）。列表只被 `hidden`、常驻挂载，返回时
 *   **保留滚动位置**；选中行被删 / 刷新后 `selectedRow` 自然为 `null`，自动回落列表；
 * - 列表壳与三态顺序由共享 `ReadonlyOverviewList` 提供（loading → error → empty →
 *   content，修正原先的 error-before-loading 顺序）；详情壳复用共享 `ReadonlyDetailShell`；
 * - 卡片复用中栏 `InspirationCard` 的 `readonly` / `compact` 变体（AGENTS §9：
 *   不复制平行组件）——`readonly` 仅隐藏删除按钮，传 `onSelect` 后仍保留可点 / 可键盘
 *   选中的按钮语义（点击进只读详情）。
 */
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import InspirationCard from '../inspiration/InspirationCard'
import InspirationReadonlyDetail from './InspirationReadonlyDetail'
import { ReadonlyOverviewList } from './ReadonlyOverviewList'
import { useBookInspirations } from './useBookInspirations'
import { useReadonlyOverviewSelection } from './useReadonlyOverviewSelection'

export interface InspirationOverviewPanelProps {
  /** 当前书籍 id（空串 = 未进入书籍，不拉数据）。 */
  bookId: string
  /** 页签是否可见（惰性加载：不可见时不拉数据）。 */
  active: boolean
}

/** 灵感右栏总览（可点卡片 → 右栏内只读详情；列表无删除入口）。 */
export function InspirationOverviewPanel({
  bookId,
  active
}: InspirationOverviewPanelProps): ReactElement {
  const { t } = useTranslation('inspiration')
  const { rows, loading, loadError, reload } = useBookInspirations(bookId, active)
  // 列表 → 只读详情：选中态与伏笔 / 实体总览共用（行被删 / 刷新后自动回落列表）。
  const { selectedRow, listHidden, select, back } = useReadonlyOverviewSelection(rows)

  return (
    <div className="rp-panel">
      <ReadonlyOverviewList
        hidden={listHidden}
        loading={loading && rows.length === 0}
        loadError={loadError && rows.length === 0}
        isEmpty={rows.length === 0}
        emptyText={t('overview.empty')}
        onRetry={reload}
      >
        <div className="wf-card-grid inspiration-overview-grid">
          {rows.map((row) => (
            <InspirationCard
              key={row.id}
              row={row}
              active={false}
              readonly
              compact
              onSelect={select}
            />
          ))}
        </div>
      </ReadonlyOverviewList>

      {selectedRow === null ? null : <InspirationReadonlyDetail row={selectedRow} onBack={back} />}
    </div>
  )
}

export default InspirationOverviewPanel

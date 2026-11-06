/**
 * 章节模块右栏「灵感」页签：**全书灵感只读平铺总览**。
 *
 * - 数据经 `useBookInspirations` 拉取，保持后端顺序（`updated_at DESC, id DESC`，
 *   与灵感模块列表一致），**不分组**（标签筛选是灵感模块自己的焦点，这里显示全书）；
 * - **两级视图**：列表 → 只读详情（`selectedId` 切换，右栏内完成，不离开章节模块）；
 *   有选中行时渲染 `InspirationReadonlyDetail`（无任何编辑 / 保存 / 删除入口，底部独立
 *   底色返回栏回列表）。列表只被 `hidden`、常驻挂载，返回时**保留滚动位置**；
 *   选中行被删 / 刷新后 `selectedRow` 自然为 `null`，自动回落列表；
 * - 卡片复用中栏 `InspirationCard` 的 `readonly` / `compact` 变体（AGENTS §9：
 *   不复制平行组件）——`readonly` 仅隐藏删除按钮，传 `onSelect` 后仍保留可点 / 可键盘
 *   选中的按钮语义（点击进只读详情）；
 * - 全书无灵感时显示空态；首次加载且无数据时显示通用加载文案；读取失败且无数据时
 *   显示通用失败态（可重试）。
 */
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import LoadErrorState from '../../../components/LoadErrorState'
import InspirationCard from '../inspiration/InspirationCard'
import InspirationReadonlyDetail from './InspirationReadonlyDetail'
import { useBookInspirations } from './useBookInspirations'

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
  const { t: tCommon } = useTranslation('common')
  const { rows, loading, loadError, reload } = useBookInspirations(bookId, active)
  // 列表 → 只读详情：`selectedId` 只在右栏内切换；行被删 / 刷新后按 id 派生为 `null`，
  // 无需同步 effect 即自动回落列表（与伏笔总览同一派生口径）。
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedRow = useMemo(
    () => (selectedId === null ? null : (rows.find((row) => row.id === selectedId) ?? null)),
    [rows, selectedId]
  )

  return (
    <div className="rp-panel">
      {/* 列表卡底座：`pane-region`（软底 + 圆角）与剧情 / 大纲 / AI / 伏笔页签同款。
          进入详情时只加 `hidden`、不卸载：返回列表时滚动位置仍在。 */}
      <div className="pane-region rp-card rp-card--list" hidden={selectedRow !== null}>
        {loadError && rows.length === 0 ? (
          <LoadErrorState compact onRetry={reload} />
        ) : loading && rows.length === 0 ? (
          <div className="rp-list-empty">{tCommon('loading')}</div>
        ) : rows.length === 0 ? (
          <div className="rp-list-empty">{t('overview.empty')}</div>
        ) : (
          <div className="wf-card-grid inspiration-overview-grid">
            {rows.map((row) => (
              <InspirationCard
                key={row.id}
                row={row}
                active={false}
                readonly
                compact
                onSelect={(id) => setSelectedId(id)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedRow === null ? null : (
        <InspirationReadonlyDetail row={selectedRow} onBack={() => setSelectedId(null)} />
      )}
    </div>
  )
}

export default InspirationOverviewPanel

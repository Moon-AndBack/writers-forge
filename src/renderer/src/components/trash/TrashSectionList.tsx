/**
 * 回收站左侧三卡结构（仅 `TrashListView` 传入 `sections` 时启用）。
 *
 * 结构：固定标题卡（`.trash-head`）+ 内容卡各自滚动。内容卡按 `TrashRow.sectionKey`
 * 分组，空段不渲染；卡内不再渲染分组标题，直接展示行。section 可选自带卷行：
 * 有卷时由 `renderSectionRows` 走树形，无卷时沿用调用方传入的平铺行渲染器，
 * 保证选中 / 操作行为与旧单卡模式一致。
 * 样式见 `styles/writer-trash-sections.css`。
 */
import type { ReactElement, ReactNode } from 'react'
import { EmptyState } from '../EmptyState'
import { LoadErrorState } from '../LoadErrorState'
import type { TrashRow } from './TrashListView'

/** 内容卡定义：`key` 对应 `TrashRow.sectionKey`。 */
export interface TrashSection {
  key: string
  /**
   * 卡片分组标题。内容卡已不渲染标题；字段保留以免改动调用方签名与 i18n key，
   * 可作未来无障碍标签等用途。
   */
  title: string
  /**
   * 该段卷行：非空时按树形渲染（卷行 + 其下条目 + 残差）；缺省 / 空数组走平铺。
   * 大纲「分组大纲」传入全部回收站卷，章节回收站不传。
   */
  volumes?: TrashRow[]
}

/** 分组后的内容卡：卷行与条目行均已按 `section` 归位。 */
export interface TrashGroupedSection extends TrashSection {
  volumes: TrashRow[]
  rows: TrashRow[]
}

export interface TrashSectionListProps {
  /** 固定标题卡内容（现有 `.trash-head`：标题 / 计数 / 清空）。 */
  head: ReactNode
  /** 内容卡定义（顺序即渲染顺序）。 */
  sections: TrashSection[]
  /** 待分组行（平铺模式）。 */
  items: TrashRow[]
  /** 首帧加载中：仅在无任何行时展示加载文案。 */
  loading: boolean
  /** 数据读取失败：仅在无任何行时展示错误态，已有数据保留。 */
  loadError: boolean
  onRetry?: () => void
  loadingText: string
  emptyText: string
  /** 调用方提供的行渲染器（复用旧平铺行的 DOM / 类名 / 行为）。 */
  renderRow: (row: TrashRow) => ReactElement
  /**
   * 内容卡正文渲染器（可选）：传入后替代默认的 `rows.map(renderRow)`，
   * 供调用方在 `section.volumes` 非空时切换为树形渲染。
   */
  renderSectionRows?: (section: TrashGroupedSection, rows: TrashRow[]) => ReactNode
}

/**
 * 按 `sectionKey` 把行分到各内容卡；缺省或未知 key 回退到第一段，避免静默丢行。
 * 返回顺序与 `sections` 一致；有卷或有行的段保留，空段过滤。
 */
function groupRows(sections: TrashSection[], items: TrashRow[]): TrashGroupedSection[] {
  const fallbackKey = sections[0]?.key
  const knownKeys = new Set(sections.map((section) => section.key))
  const rowsBySection = new Map<string, TrashRow[]>()

  for (const item of items) {
    const key =
      item.sectionKey !== undefined && knownKeys.has(item.sectionKey)
        ? item.sectionKey
        : fallbackKey
    if (key === undefined) continue
    const rows = rowsBySection.get(key)
    if (rows) rows.push(item)
    else rowsBySection.set(key, [item])
  }

  return sections
    .map((section) => ({
      ...section,
      volumes: section.volumes ?? [],
      rows: rowsBySection.get(section.key) ?? []
    }))
    .filter((section) => section.volumes.length > 0 || section.rows.length > 0)
}

export function TrashSectionList({
  head,
  sections,
  items,
  loading,
  loadError,
  onRetry,
  loadingText,
  emptyText,
  renderRow,
  renderSectionRows
}: TrashSectionListProps): ReactElement {
  const hasRows = items.length > 0 || sections.some((section) => (section.volumes?.length ?? 0) > 0)
  const visibleSections = hasRows ? groupRows(sections, items) : []

  return (
    <div className="trash-sections">
      <div className="trash-section trash-section--head">{head}</div>

      {/* 标题卡固定，内容卡各自滚动（滚动条落在卡片底色内）。 */}
      <div className="trash-sections-scroll">
        {loadError && !hasRows ? (
          <div className="trash-section trash-section--state">
            <LoadErrorState compact onRetry={() => onRetry?.()} />
          </div>
        ) : loading && !hasRows ? (
          <div className="trash-section trash-section--state">
            <div className="trash-loading">{loadingText}</div>
          </div>
        ) : !hasRows ? (
          <div className="trash-section trash-section--state">
            <EmptyState compact title={emptyText} />
          </div>
        ) : (
          visibleSections.map((section) => (
            <div className="trash-section" key={section.key}>
              {renderSectionRows !== undefined
                ? renderSectionRows(section, section.rows)
                : section.rows.map((row) => renderRow(row))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default TrashSectionList

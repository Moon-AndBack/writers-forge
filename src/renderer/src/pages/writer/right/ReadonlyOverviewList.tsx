/**
 * 右栏只读总览的**列表壳**（伏笔 / 灵感 / 实体三个页签共用，AGENTS §9）。
 *
 * 只负责两件公共事：
 * - **三态顺序固定 loading → error → empty → content**（AGENTS §8.6）。修正灵感页签原先
 *   error-before-loading 的顺序：首次读取先显示加载文案，失败后才落到失败态；
 * - 外壳沿用 `pane-region rp-card rp-card--list`（与剧情 / 大纲 / AI 页签同款软底 + 滚动）。
 *
 * `loading` / `loadError` 由调用方按「无可用数据」门控（已有旧数据时保留旧列表，不闪三态）；
 * 列表只被 `hidden`、常驻挂载，返回时保留滚动位置。
 */
import type { ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadErrorState } from '../../../components/LoadErrorState'

export interface ReadonlyOverviewListProps {
  /** 是否隐藏（进入详情时为真；只加 `hidden`，不卸载）。 */
  hidden?: boolean
  /** 首次加载且无数据（显示通用加载文案）。 */
  loading: boolean
  /** 读取失败且无数据（显示失败态 + 重试）。 */
  loadError: boolean
  /** 无数据（且非加载 / 失败）。 */
  isEmpty: boolean
  /** 空态文案（调用方取本域 i18n）。 */
  emptyText: string
  /** 失败态「重试」。 */
  onRetry: () => void
  /** 有数据时的内容（分组容器 / 卡片网格）。 */
  children: ReactNode
}

/** 只读总览列表壳：三态 + 软底列表卡。 */
export function ReadonlyOverviewList({
  hidden = false,
  loading,
  loadError,
  isEmpty,
  emptyText,
  onRetry,
  children
}: ReadonlyOverviewListProps): ReactElement {
  const { t } = useTranslation('common')
  return (
    <div className="pane-region rp-card rp-card--list" hidden={hidden}>
      {loading ? (
        <div className="rp-list-empty">{t('loading')}</div>
      ) : loadError ? (
        <LoadErrorState compact onRetry={onRetry} />
      ) : isEmpty ? (
        <div className="rp-list-empty">{emptyText}</div>
      ) : (
        children
      )}
    </div>
  )
}

export default ReadonlyOverviewList

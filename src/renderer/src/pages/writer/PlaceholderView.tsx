import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export interface PlaceholderViewProps {
  /** 模块中文名，作为占位提示主文案。 */
  label: string
  /** 紧凑变体（左 / 右栏内使用），字号与留白更小。 */
  compact?: boolean
}

/**
 * 模块占位视图：骨架阶段为「剧情 / 角色 / 势力 / 物品功法 / 时间线 / 伏笔 / 灵感」模块提供空白面板。
 * 结构极简（图标 + 模块名 + 提示），由 `compact` 适配中栏与侧栏两种容器宽度。
 */
export function PlaceholderView({ label, compact }: PlaceholderViewProps): ReactElement {
  const { t } = useTranslation('common')
  return (
    <div className={`placeholder-view${compact ? ' is-compact' : ''}`} role="note">
      <svg
        className="placeholder-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
      <div className="placeholder-title">{label}</div>
      <div className="placeholder-desc">{t('comingSoonDesc')}</div>
    </div>
  )
}

export default PlaceholderView

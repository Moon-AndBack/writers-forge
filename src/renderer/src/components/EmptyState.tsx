import type { ReactElement, ReactNode } from 'react'
import '../styles/components/empty-state.css'

export interface EmptyStateProps {
  /** 空态主文案（由调用方传入已翻译字符串）。 */
  title: ReactNode
  /** 补充说明（由调用方传入已翻译字符串）。 */
  description?: ReactNode
  /** 图标节点（由调用方传入 `<Icon />`），统一包裹为 `.placeholder-icon`。 */
  icon?: ReactNode
  /** 紧凑变体（中栏 / 侧栏内使用），字号与留白更小。 */
  compact?: boolean
  /** 语义角色，默认 `note`。 */
  role?: string
  /** 追加类名，供调用方补充。 */
  className?: string
}

/**
 * 通用空态：图标（可选）+ 主文案 + 说明（可选）。
 *
 * 结构与 className 沿用既有 `.placeholder-view` 约定，保证替换后视觉零变化；
 * 文案一律由调用方经 `t()` 取用后传入，组件本身不依赖 i18n。
 */
export function EmptyState({
  title,
  description,
  icon,
  compact = false,
  role = 'note',
  className
}: EmptyStateProps): ReactElement {
  const classes = ['placeholder-view', compact ? 'is-compact' : null, className ?? null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} role={role}>
      {icon !== undefined ? (
        <span className="placeholder-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="placeholder-title">{title}</div>
      {description !== undefined ? <div className="placeholder-desc">{description}</div> : null}
    </div>
  )
}

export default EmptyState

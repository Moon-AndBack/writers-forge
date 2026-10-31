import type { HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react'
import '../../styles/components/display-extras.css'

export interface ListItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onClick'> {
  /** 左侧头像位（可放 <Avatar>）。 */
  avatar?: ReactNode
  /** 主标题。 */
  title?: ReactNode
  /** 副标题。 */
  subtitle?: ReactNode
  /** 右侧附加内容（可放 <Tag> / <Badge>）。 */
  extra?: ReactNode
  /** 选中态。 */
  active?: boolean
  /** 禁用态。 */
  disabled?: boolean
  /** 点击回调；提供后整行可聚焦并支持键盘（Enter / Space）激活。 */
  onClick?: (event: SyntheticEvent<HTMLDivElement>) => void
  /** 合并到根节点的类名。 */
  className?: string
}

/**
 * 列表行（本域额外控件）。
 * 原型：template/index.html 的 .list-item 与 .chapter；avatar/title/subtitle/extra
 * 分别对应 .list-avatar / .list-name / .list-sub / .list-tag。
 */
export function ListItem({
  avatar,
  title,
  subtitle,
  extra,
  active = false,
  disabled = false,
  className,
  onClick,
  children,
  ...rest
}: ListItemProps) {
  const classes = [
    'wf-listitem',
    active ? 'is-active' : '',
    disabled ? 'is-disabled' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  const interactive = Boolean(onClick) && !disabled

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick?.(event)
    }
  }

  return (
    <div
      className={classes}
      role={onClick ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={disabled || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {avatar !== undefined ? <span className="wf-listitem__avatar">{avatar}</span> : null}
      <span className="wf-listitem__body">
        {title !== undefined ? <span className="wf-listitem__title">{title}</span> : null}
        {subtitle !== undefined ? <span className="wf-listitem__subtitle">{subtitle}</span> : null}
        {children}
      </span>
      {extra !== undefined ? <span className="wf-listitem__extra">{extra}</span> : null}
    </div>
  )
}

ListItem.displayName = 'ListItem'

export default ListItem

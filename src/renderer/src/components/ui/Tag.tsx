import type { HTMLAttributes, MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import '../../styles/components/surface.css'

export type TagTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger'

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** 色调，默认 neutral */
  tone?: TagTone
  /** 提供后显示关闭按钮 */
  onClose?: () => void
  /** 关闭按钮的无障碍标签，缺省用 common.remove */
  closeLabel?: string
  /** 可选附加操作（渲染在标签文字与关闭按钮之间），如展开编辑。 */
  action?: ReactNode
  children?: ReactNode
}

export function Tag({
  tone = 'neutral',
  onClose,
  closeLabel,
  action,
  className,
  children,
  ...rest
}: TagProps) {
  const { t } = useTranslation('common')
  const classes = ['wf-tag', `wf-tag--${tone}`, className ?? ''].filter(Boolean).join(' ')

  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onClose?.()
  }

  return (
    <span className={classes} {...rest}>
      <span className="wf-tag__label">{children}</span>
      {action}
      {onClose ? (
        <button
          type="button"
          className="wf-tag__close"
          aria-label={closeLabel ?? t('remove')}
          onClick={handleClose}
        >
          ×
        </button>
      ) : null}
    </span>
  )
}

Tag.displayName = 'Tag'

export default Tag

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import '../../styles/components/button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉变体，默认 secondary。 */
  variant?: ButtonVariant
  /** 尺寸，默认 md（md 不额外输出尺寸类）。 */
  size?: ButtonSize
  /** 方形图标按钮（内容为单个图标）。 */
  iconOnly?: boolean
  /** 加载中：展示指示器并禁用交互。 */
  loading?: boolean
  /** 图标或文本内容。 */
  children?: ReactNode
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * 通用按钮。透传原生 <button> 属性，支持 ref 转发。
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    iconOnly = false,
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  const isDisabled = disabled === true || loading

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cn(
        'wf-btn',
        `wf-btn--${variant}`,
        size !== 'md' && `wf-btn--${size}`,
        iconOnly && 'wf-btn--icon',
        loading && 'is-loading',
        className
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="wf-btn__spinner" aria-hidden="true" /> : null}
      {children === undefined || children === null ? null : (
        <span className="wf-btn__content">{children}</span>
      )}
    </button>
  )
})

export default Button

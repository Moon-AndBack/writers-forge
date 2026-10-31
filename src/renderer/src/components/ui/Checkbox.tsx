import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import '../../styles/components/form.css'

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  /** 标签文本（可省略，保留纯控件用法） */
  label?: ReactNode
  /** 控件尺寸，默认 md */
  size?: 'sm' | 'md' | 'lg'
  /** 错误态标记 */
  invalid?: boolean
}

function sizeModifier(size: CheckboxProps['size']): string {
  return size && size !== 'md' ? `wf-checkbox--${size}` : ''
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, size, invalid = false, className, disabled, ...rest },
  ref
) {
  const classes = [
    'wf-checkbox',
    sizeModifier(size),
    disabled ? 'is-disabled' : '',
    invalid ? 'is-invalid' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classes}>
      <input
        ref={ref}
        type="checkbox"
        className="wf-checkbox__input"
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        {...rest}
      />
      <span className="wf-checkbox__box" aria-hidden="true">
        <svg
          className="wf-checkbox__tick"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 8.5 6.5 11.5 12.5 5" />
        </svg>
      </span>
      {label != null ? <span className="wf-checkbox__label">{label}</span> : null}
    </label>
  )
})

Checkbox.displayName = 'Checkbox'

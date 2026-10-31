import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import '../../styles/components/form.css'

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** 标签文本（可省略，保留纯控件用法） */
  label?: ReactNode
  /** 控件尺寸，默认 md */
  size?: 'sm' | 'md' | 'lg'
  /** 错误态标记 */
  invalid?: boolean
}

function sizeModifier(size: RadioProps['size']): string {
  return size && size !== 'md' ? `wf-radio--${size}` : ''
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, size, invalid = false, className, disabled, ...rest },
  ref
) {
  const classes = [
    'wf-radio',
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
        type="radio"
        className="wf-radio__input"
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        {...rest}
      />
      <span className="wf-radio__dot" aria-hidden="true" />
      {label != null ? <span className="wf-radio__label">{label}</span> : null}
    </label>
  )
})

Radio.displayName = 'Radio'

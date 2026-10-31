import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import '../../styles/components/form.css'

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** 标签文本（可省略，保留纯控件用法） */
  label?: ReactNode
  /** 控件尺寸，默认 md */
  size?: 'sm' | 'md' | 'lg'
}

function sizeModifier(size: SwitchProps['size']): string {
  return size && size !== 'md' ? `wf-switch--${size}` : ''
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, size, className, disabled, ...rest },
  ref
) {
  const classes = ['wf-switch', sizeModifier(size), disabled ? 'is-disabled' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <label className={classes}>
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        className="wf-switch__input"
        disabled={disabled}
        {...rest}
      />
      <span className="wf-switch__track" aria-hidden="true">
        <span className="wf-switch__thumb" />
      </span>
      {label != null ? <span className="wf-switch__label">{label}</span> : null}
    </label>
  )
})

Switch.displayName = 'Switch'

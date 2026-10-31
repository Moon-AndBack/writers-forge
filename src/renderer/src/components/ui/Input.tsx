import { forwardRef, type InputHTMLAttributes } from 'react'
import '../../styles/components/form.css'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 控件尺寸，默认 md */
  size?: 'sm' | 'md' | 'lg'
  /** 错误态：写入 aria-invalid 并附加 is-invalid */
  invalid?: boolean
}

function sizeModifier(size: InputProps['size']): string {
  return size && size !== 'md' ? `wf-input--${size}` : ''
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size, invalid = false, className, type = 'text', ...rest },
  ref
) {
  const classes = ['wf-input', sizeModifier(size), invalid ? 'is-invalid' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <input
      ref={ref}
      type={type}
      className={classes}
      aria-invalid={invalid ? true : undefined}
      {...rest}
    />
  )
})

Input.displayName = 'Input'

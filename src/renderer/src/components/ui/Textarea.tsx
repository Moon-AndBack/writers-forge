import { forwardRef, type TextareaHTMLAttributes } from 'react'
import '../../styles/components/form.css'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 控件尺寸，默认 md */
  size?: 'sm' | 'md' | 'lg'
  /** 错误态：写入 aria-invalid 并附加 is-invalid */
  invalid?: boolean
}

function sizeModifier(size: TextareaProps['size']): string {
  return size && size !== 'md' ? `wf-textarea--${size}` : ''
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size, invalid = false, className, ...rest },
  ref
) {
  const classes = ['wf-textarea', sizeModifier(size), invalid ? 'is-invalid' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <textarea ref={ref} className={classes} aria-invalid={invalid ? true : undefined} {...rest} />
  )
})

Textarea.displayName = 'Textarea'

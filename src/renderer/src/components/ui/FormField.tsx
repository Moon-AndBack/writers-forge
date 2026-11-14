import { cloneElement, isValidElement, useId } from 'react'
import type { HTMLAttributes, ReactElement, ReactNode } from 'react'
import '../../styles/components/form-extras.css'

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  /** 字段标签。 */
  label?: ReactNode
  /** 关联控件的 id（写入 <label htmlFor>）。 */
  htmlFor?: string
  /** 辅助说明，未提供 error 时展示。 */
  hint?: ReactNode
  /** 错误信息，提供时进入错误态并优先于 hint 展示。 */
  error?: ReactNode
  /** 必填标记。 */
  required?: boolean
  children?: ReactNode
}

/**
 * 字段容器：包裹任意表单控件，统一 label / hint / error / required 布局。
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
  ...rest
}: FormFieldProps) {
  const generatedId = useId()
  const messageId = `${htmlFor ?? generatedId}-message`
  const hasError = error !== undefined && error !== null && error !== ''
  const hasHint = hint !== undefined && hint !== null
  const hasMessage = hasError || hasHint
  // 把错误 / 提示节点的 id 关联到子控件（A 方案：调用方零改动）。只处理单个非 Fragment
  // 元素；子控件已有 `aria-describedby` 时以空格合并，并按 id 去重（调用方可能已手动关联）。
  let control = children
  if (hasMessage && isValidElement(children) && typeof children.type !== 'symbol') {
    const element = children as ReactElement<{ 'aria-describedby'?: string }>
    const existing = element.props['aria-describedby']
    const ids = Array.from(
      new Set(`${existing ?? ''} ${messageId}`.split(/\s+/).filter((id) => id !== ''))
    )
    control = cloneElement(element, { 'aria-describedby': ids.join(' ') })
  }

  const classes = ['wf-field', hasError ? 'is-invalid' : '', className].filter(Boolean).join(' ')

  return (
    <div className={classes} {...rest}>
      {label !== undefined && label !== null ? (
        <label className="wf-field__label" htmlFor={htmlFor}>
          {label}
          {required ? (
            <span className="wf-field__required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div className="wf-field__control">{control}</div>

      {hasError ? (
        <div className="wf-field__error" id={messageId} role="alert">
          {error}
        </div>
      ) : hasHint ? (
        <div className="wf-field__hint" id={messageId}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

FormField.displayName = 'FormField'

export default FormField

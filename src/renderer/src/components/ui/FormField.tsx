import { useId } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
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

      <div className="wf-field__control">{children}</div>

      {hasError ? (
        <div className="wf-field__error" id={messageId} role="alert">
          {error}
        </div>
      ) : hint !== undefined && hint !== null ? (
        <div className="wf-field__hint" id={messageId}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

FormField.displayName = 'FormField'

export default FormField

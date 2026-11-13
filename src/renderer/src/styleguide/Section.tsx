import type { ReactNode } from 'react'

export interface SectionProps {
  /** 锚点 id，左侧导航直接跳转。 */
  id: string
  title: string
  description: ReactNode
  children: ReactNode
}

/** 分区壳：h2 + 说明 + 内容槽。 */
export function Section({ id, title, description, children }: SectionProps) {
  return (
    <section id={id} className="sg-section">
      <header className="sg-section__head">
        <h2 className="sg-section__title">{title}</h2>
        <p className="sg-section__desc">{description}</p>
      </header>
      <div className="sg-section__body">{children}</div>
    </section>
  )
}

export interface DemoProps {
  /** 组件名 + 展示范围，如 `Button · primary / secondary / ghost / danger`。 */
  name: string
  /** 交互说明 / 实现备注。 */
  note?: ReactNode
  /** 可复制类名，如 `wf-btn wf-btn--primary`。 */
  classes?: string
  children: ReactNode
}

/** 示例块：标题行（组件名 + 类名）+ 备注 + 展示台。 */
export function Demo({ name, note, classes, children }: DemoProps) {
  return (
    <div className="sg-demo">
      <div className="sg-demo__head">
        <h3 className="sg-demo__name">{name}</h3>
        {classes ? <code className="sg-code sg-demo__cls">{classes}</code> : null}
      </div>
      {note ? <p className="sg-demo__note">{note}</p> : null}
      <div className="sg-demo__stage">{children}</div>
    </div>
  )
}

export interface SampleProps {
  /** 该示例的状态 / 尺寸 / 变体名。 */
  label: string
  children: ReactNode
}

/** 展示台内的小样本：上方状态标签 + 下方真实组件。 */
export function Sample({ label, children }: SampleProps) {
  return (
    <div className="sg-sample">
      <span className="sg-label">{label}</span>
      <div className="sg-sample__body">{children}</div>
    </div>
  )
}

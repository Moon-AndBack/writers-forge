import type { ReactNode } from 'react'
import { Card } from '../../components/ui'

export interface SectionCardProps {
  /** 分区标题（如「基础偏好」）。 */
  title: ReactNode
  /** 分区标题下的补充说明。 */
  description?: ReactNode
  /** 分区内设置行。 */
  children: ReactNode
}

/**
 * 设置分区卡片：分组标题 + 一组设置行，复用组件库 `Card`（--pane 底 +
 * --sh-sm + --panel-ring），行间用细分隔线区隔（对齐项目卡片语言，而非模板
 * 的块中块灰底方案）。
 */
export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <Card className="settings-group" bodyClassName="settings-group__body">
      <div className="settings-group__head">
        <h2 className="settings-group__title">{title}</h2>
        {description !== undefined ? <p className="settings-group__desc">{description}</p> : null}
      </div>
      <div className="settings-group__rows">{children}</div>
    </Card>
  )
}

SectionCard.displayName = 'SectionCard'

export default SectionCard

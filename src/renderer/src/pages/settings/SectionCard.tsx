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
 * 设置分区卡片：分组标题 + 一组设置行，复用组件库 `Card` 与 `SettingRow`。
 *
 * - 卡片底色 / 投影由 `Card` 的 `.wf-card` 提供（--soft-solid + --sh-sm），
 *   本组件不叠加描边或底色；
 * - 行间分隔线由 settings.css 的 `.settings-row + .settings-row` 提供；
 * - 内容行容器挂 `.on-soft`：卡片本身是 --soft-solid 软底，内部 Input / Select
 *   改用 --control-on-soft + --control-on-soft-line（见 form.css），避免控件与
 *   卡片同色糊平。该类只作用于内部表单控件，不改卡片自身背景。
 */
export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <Card className="settings-group" bodyClassName="settings-group__body">
      <div className="settings-group__head">
        <h2 className="settings-group__title">{title}</h2>
        {description !== undefined ? <p className="settings-group__desc">{description}</p> : null}
      </div>
      <div className="settings-group__rows on-soft">{children}</div>
    </Card>
  )
}

SectionCard.displayName = 'SectionCard'

export default SectionCard

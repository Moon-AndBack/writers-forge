import type { ReactNode } from 'react'
import { Card } from '../../components/ui'

export interface SectionCardProps {
  /** 分区内设置行。 */
  children: ReactNode
}

/**
 * 设置分区卡片：一组设置行，复用组件库 `Card` 与 `SettingRow`。
 *
 * - 卡片直接以设置行开始，不再渲染分区标题与描述（导航已表明当前分区）；
 * - 卡片底色 / 投影由 `Card` 的 `.wf-card` 提供（--soft-solid + --sh-sm），
 *   本组件不叠加描边或底色；
 * - 行间不再画分隔线，靠 settings.css 的 `.settings-row` 14/10 内衬与间距分组；
 * - 内容行容器挂 `.on-soft`：卡片本身是 --soft-solid 软底，内部 Input / Select
 *   改用 --control-on-soft（见 form.css；默认态无描边），避免控件与卡片同色糊平。
 *   该类只作用于内部表单控件，不改卡片自身背景。
 */
export function SectionCard({ children }: SectionCardProps) {
  return (
    <Card className="settings-group" bodyClassName="settings-group__body">
      <div className="settings-group__rows on-soft">{children}</div>
    </Card>
  )
}

SectionCard.displayName = 'SectionCard'

export default SectionCard

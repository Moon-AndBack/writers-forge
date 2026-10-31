import type { ReactNode } from 'react'

export interface SettingRowProps {
  /** 设置项名称（左槽）。 */
  label: ReactNode
  /** 说明文案（左槽，名称下方）。 */
  description?: ReactNode
  /** 控件（右槽）。 */
  children: ReactNode
  /** 合并到根节点的类名。 */
  className?: string
}

/**
 * 设置项行：左「名称 + 说明」、右「控件」三槽布局（对齐 template/settings.html
 * 的 .setting-row，但为项目内复用的小组件，配色全部走 theme.css 令牌）。
 * 行本身非交互元素（hover 仅轻微底色反馈，无位移 / 缩放，遵守 §8）。
 */
export function SettingRow({ label, description, children, className }: SettingRowProps) {
  const classes = ['settings-row', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <div className="settings-row__info">
        <span className="settings-row__label">{label}</span>
        {description !== undefined ? (
          <span className="settings-row__desc">{description}</span>
        ) : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}

SettingRow.displayName = 'SettingRow'

export default SettingRow

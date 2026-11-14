import { useId } from 'react'
import type { ReactNode } from 'react'
import { settingRowDescriptionId } from './settingRowIds'

export interface SettingRowProps {
  /** 设置项名称（左槽）。 */
  label: ReactNode
  /** 说明文案（左槽，名称下方）。 */
  description?: ReactNode
  /** 控件（右槽）。 */
  children: ReactNode
  /** 合并到根节点的类名。 */
  className?: string
  /**
   * 行内主控件的 id：显式传入时标签渲染为 `<label htmlFor>` 与控件关联，说明
   * 文案以 `${controlId}-desc` 作 id；调用方需把同一 id 传给控件，并用
   * `settingRowDescriptionId()` 设置 `aria-describedby`。
   * 省略时（控件槽是动作按钮组，无可关联控件）标签渲染为 `<span>`，不再用
   * `useId()` 回退生成悬空的 `htmlFor`。
   */
  controlId?: string
}

/**
 * 设置项行：左「名称 + 说明」、右「控件」三槽布局，复用 `SectionCard` 的行容器
 * 与 settings.css 的 `.settings-row` 排版；配色全部走 theme.css 令牌。
 * 行本身非交互元素：不设 hover 底色，靠 `.settings-row` 的 14/10 内衬与间距区隔
 * （无位移 / 缩放，遵守 §8）。
 *
 * 无障碍：仅当显式下传 `controlId` 时，标签为 `<label htmlFor>`，与行内主控件
 * 显式关联；省略时控件槽是动作按钮组，标签用 `<span>`，避免指向不存在的 id。
 * 说明文案带 id，由控件经 `aria-describedby` 关联（见 `settingRowDescriptionId`）。
 * id 一律由调用方显式下传，不做 `cloneElement` 隐式注入。
 */
export function SettingRow({
  label,
  description,
  children,
  className,
  controlId
}: SettingRowProps) {
  const generatedId = useId()
  /* 未传 controlId 时，生成的 id 只用于说明文案（行内无可关联控件）。 */
  const descriptionId = settingRowDescriptionId(controlId ?? generatedId)
  const classes = ['settings-row', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <div className="settings-row__info">
        {controlId !== undefined ? (
          <label className="settings-row__label" htmlFor={controlId}>
            {label}
          </label>
        ) : (
          <span className="settings-row__label">{label}</span>
        )}
        {description !== undefined ? (
          <span className="settings-row__desc" id={descriptionId}>
            {description}
          </span>
        ) : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}

SettingRow.displayName = 'SettingRow'

export default SettingRow

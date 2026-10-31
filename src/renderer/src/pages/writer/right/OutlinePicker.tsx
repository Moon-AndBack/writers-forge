import type { CSSProperties, ReactElement } from 'react'
import ReadonlyRichText from '../../../components/editor/ReadonlyRichText'
import { Select, type SelectOption } from '../../../components/ui'
import type { OutlinePreview } from './useOutlinePreview'

/**
 * 右栏「大纲」页签的单栏单元：**一个下拉 + 一片只读正文**。
 *
 * 同一组件复用两次（§9，无平行实现）：
 * - 主栏：独立条目 / 卷 / 分组下拉 + 对应正文（选卷或分组时显示其卷纲）；
 * - 细纲栏：仅当选「卷 / 分组」时出现，下拉只列其下条目 + 条目正文。
 *
 * 下拉**不显示文字标签**（按产品要求只留下拉控件本身）；无障碍名称由 `ariaLabel`
 * 交给 `Select`（仅 `aria-label`，视觉不可见）。差异全部由 props 表达
 * （`ariaLabel` / `options` / `emptyText`），不另写变体组件；
 * 展示区固定只读（`ReadonlyRichText` 无编辑入口、无工具栏）。
 *
 * 底座完全复用通用类（§9）：`pane-region`（软底 + 圆角 + 6px 内衬）+
 * `rp-card`（内描边 + 卡片内衬）+ `on-soft`（软底上的控件改 --control-on-soft
 * 底 + 描边）；域类 `rp-outline__pane` 只补纵向布局与最小高度，上下栏比例由调用方经
 * `style.flexGrow` 传入（默认各半，可拖动分隔条调节）。
 */
export interface OutlinePickerProps {
  /** 下拉的无障碍名称（i18n 文案，由调用方取；**不渲染为可见标签**）。 */
  ariaLabel: string
  /** 扁平下拉选项（条目 / 卷已由调用方编码为 `entry:{id}` / `volume:{id}`）。 */
  options: SelectOption[]
  /** 当前值（须与某个选项 value 相等，否则下拉显示占位文案）。 */
  value: string
  /** 选中回调，回传选项 value。 */
  onChange: (value: string) => void
  /** 当前选中目标的正文预读结果。 */
  preview: OutlinePreview
  /** 无正文 / 无条目时的空态文案。 */
  emptyText: string
  /** 可选内联样式（承载上下分栏的 `flex-grow` 比例；不覆盖卡片底座类）。 */
  style?: CSSProperties
}

export default function OutlinePicker({
  ariaLabel,
  options,
  value,
  onChange,
  preview,
  emptyText,
  style
}: OutlinePickerProps): ReactElement {
  return (
    <div className="pane-region rp-card rp-outline__pane on-soft" style={style}>
      {/* 下拉行：无可见标签，下拉独占整行（可访问名只走 aria-label）。 */}
      <div className="rp-outline__head">
        <Select
          size="sm"
          options={options}
          value={value}
          onChange={onChange}
          ariaLabel={ariaLabel}
        />
      </div>

      {/* 展示区：加载中留白（不显示上一条正文）；其余状态交给只读富文本组件。 */}
      {preview.status === 'loading' ? (
        <div className="rp-read" aria-busy="true" />
      ) : (
        <ReadonlyRichText json={preview.contentJson} emptyText={emptyText} />
      )}
    </div>
  )
}

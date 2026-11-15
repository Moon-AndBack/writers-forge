/**
 * 横排控件组内的竖分隔线（通用共享组件）。
 *
 * 标题栏模块操作组（`.tb-module-actions`）与富文本工具栏（`RichTextToolbar`）共用：
 * 以 2px 宽、16px 高的实线分隔按钮组，左右各留 4px 外边距。
 * 纯装饰，不承载语义（`aria-hidden`）；样式见 `styles/titlebar.css` 的 `.tb-sep`
 * （由 `TitleBar` 导入，标题栏与写作页工具栏始终同域加载）。
 */
export function ActionSeparator() {
  return <span className="tb-sep" aria-hidden="true" />
}

ActionSeparator.displayName = 'ActionSeparator'

export default ActionSeparator

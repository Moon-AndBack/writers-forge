/**
 * 设置行 id 约定（配合 `SettingRow.tsx`）。
 *
 * 说明文案 id 由行内主控件的 id 派生：`SettingRow` 用它作说明文案的 id，
 * 调用方把它传给控件的 `aria-describedby`，二者因此保持一致。
 *
 * 独立成模块，避免组件文件额外导出非组件符号（`react-refresh/only-export-components`）。
 */
export function settingRowDescriptionId(controlId: string): string {
  return `${controlId}-desc`
}

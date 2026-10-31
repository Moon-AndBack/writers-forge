import type { ChangeEvent, KeyboardEvent } from 'react'

/**
 * 编辑头标题行（纯受控共享块）：前段只读 + 空隙 + 名段输入。
 *
 * 样式复用 `writer-editor-head.css` 的 `.doc-title-row / .doc-title-prefix /
 * .doc-title-input`（零新增 CSS）。前缀显示与否由调用方以 `showPrefix` 显式控制
 * （大纲侧按目标前缀有无派生；章节侧 `DocTitleRow` 薄壳恒传 true——普通章编号
 * 前缀恒显，与卷行「卷X · 名」同构，特殊章前段本就恒显）。
 */
export interface DocTitleFieldProps {
  /** 行同步 key（null = 无目标；作为 input key 供切换目标时重建焦点态）。 */
  rowKey: string | null
  /** 前缀只读段（`showPrefix` 为 false 时不渲染）。 */
  prefix: string
  /** 是否渲染前缀段。 */
  showPrefix: boolean
  /** 前缀段的 aria-label（可选；缺省时前缀段以 aria-hidden 纯展示）。 */
  prefixAria?: string
  /** 前缀段附加类（可选；如章节侧特殊章的 `doc-title-prefix--special` 语义标记）。 */
  prefixClassName?: string
  /** 名段受控值。 */
  value: string
  /** 名段占位（无占位传空串）。 */
  placeholder: string
  /** 无目标 / 不可编辑时禁用输入。 */
  disabled: boolean
  /** 名段输入 change。 */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  /** 失焦提交（Enter 亦复用）。 */
  onCommit: () => void
  /** 键盘处理（Enter 提交 / Escape 还原）。 */
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  /** 名段输入的 aria-label（文案由调用方经 t() 提供）。 */
  titleAria: string
}

export default function DocTitleField({
  rowKey,
  prefix,
  showPrefix,
  prefixAria,
  prefixClassName,
  value,
  placeholder,
  disabled,
  onChange,
  onCommit,
  onKeyDown,
  titleAria
}: DocTitleFieldProps) {
  return (
    <div className="doc-title doc-title-row">
      {showPrefix && prefix !== '' && (
        <span
          className={`doc-title-prefix${prefixClassName ? ` ${prefixClassName}` : ''}`}
          aria-label={prefixAria}
          aria-hidden={prefixAria === undefined ? true : undefined}
        >
          {prefix}
        </span>
      )}
      <input
        className="doc-title-input"
        type="text"
        value={value}
        placeholder={placeholder}
        key={rowKey ?? 'none'}
        spellCheck={false}
        aria-label={titleAria}
        disabled={disabled}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        onChange={onChange}
      />
    </div>
  )
}

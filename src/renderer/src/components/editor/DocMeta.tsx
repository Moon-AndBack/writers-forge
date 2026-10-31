import type { ReactNode } from 'react'

/**
 * 编辑头元信息行（`DocMeta`，纯展示共享块）。
 *
 * 统一渲染 `.doc-meta` 容器（样式见 `writer-editor-head.css` 的 `.editor-head .doc-meta` /
 * `.doc-meta`），供章节页 / 大纲页 / 世界观等复用（§9 通用组件优先）。三处能力均为**可选**，
 * 由调用方按目标域传参：
 * - `lastEdited`：已渲染的「最后编辑」文案（调用方负责 `t()` 与相对时间格式化；空串不渲染）；
 * - `status`：状态按钮（仅章节页有状态概念；大纲 / 世界观无状态，不传）；
 * - `children`：附加元信息节点（如世界观静态演示文本）。
 *
 * 本组件不取 i18n、不做时间格式化——保持与领域无关，差异一律由调用处表达。
 */

/** 状态按钮契约（章节页两态：草稿 / 定稿）。 */
export interface DocMetaStatus {
  /** 状态值：决定 `.is-draft` / `.is-done` 配色类。 */
  value: 'draft' | 'done'
  /** 按钮可见文案（调用方经 `t()` 提供）。 */
  label: string
  /** 无障碍标签（调用方经 `t()` 提供）。 */
  ariaLabel: string
  /** 不可切换时禁用（如无选中章）。 */
  disabled?: boolean
  /** 点击切换回调。 */
  onClick: () => void
}

export interface DocMetaProps {
  /** 已渲染的「最后编辑」文案；空串 / 缺省 → 不渲染该 span。 */
  lastEdited?: string
  /** 状态按钮（章节页用；大纲页 / 世界观不传）。 */
  status?: DocMetaStatus
  /** 附加元信息节点（渲染在「最后编辑」与状态按钮之间）。 */
  children?: ReactNode
}

export default function DocMeta({ lastEdited, status, children }: DocMetaProps) {
  return (
    <div className="doc-meta">
      {lastEdited ? <span>{lastEdited}</span> : null}
      {children}
      {status && (
        <button
          type="button"
          className={`doc-status is-${status.value}`}
          onClick={status.onClick}
          disabled={status.disabled}
          aria-label={status.ariaLabel}
        >
          {status.label}
        </button>
      )}
    </div>
  )
}

import type { ReactElement } from 'react'
import { EditorContent } from '@tiptap/react'
import { RICH_TEXT_EXTENSIONS } from './richTextExtensions'
import { useRichTextBodyEditor } from './useRichTextBodyEditor'

/**
 * 只读富文本正文（块级 Tiptap JSON 的**纯展示**形态）。
 *
 * 与可编辑正文共用同一套底座（§9）：
 * - `useRichTextBodyEditor({ editable: false })` —— 只读走 hook 的 `editable` 项
 *   （`useEditor` 的 `editable` 恒为字面量 `true`，见 `RICH_TEXT_EXTENSIONS` 说明）；
 * - `RICH_TEXT_EXTENSIONS` —— 模块级恒等引用，保证标题 / 列表 / 引用 / 代码块 /
 *   表格 / 高亮 / 字色 / 行内图片的渲染口径与编辑态一致；
 * - 无工具栏、无占位提示、无 `onChange` 出口 —— 展示区不存在任何编辑入口。
 *
 * 组件分两层：外层按 `json` 作 `key`，内容一变即**重建**内层实例——hook 的
 * `initialJson` 只在挂载时读取一次，不重建会把上一段正文留在编辑器里。
 */
export interface ReadonlyRichTextProps {
  /** 整条块级 Tiptap JSON 串（`null` = 空正文）。 */
  json: string | null
  /** 空正文时的占位文案（i18n，由调用方取）。 */
  emptyText: string
  /** 追加类名（宽度 / 间距等布局差异由调用方覆写）。 */
  className?: string
}

/** 只读实例不产生变更，`onChange` 恒为空实现（hook 的必填项）。 */
const NOOP = (): void => {}

export function ReadonlyRichText({
  json,
  emptyText,
  className
}: ReadonlyRichTextProps): ReactElement {
  return (
    <ReadonlyRichTextBody
      // 内容切换即重建（`initialJson` 只读一次）；同内容不重建，避免无谓地重挂实例。
      key={json ?? ''}
      json={json}
      emptyText={emptyText}
      className={className}
    />
  )
}

/** 只读正文实例（按 `json` 的 key 由外层重建）。 */
function ReadonlyRichTextBody({ json, emptyText, className }: ReadonlyRichTextProps): ReactElement {
  const { editor, isEmpty } = useRichTextBodyEditor({
    initialJson: json,
    extensions: RICH_TEXT_EXTENSIONS,
    onChange: NOOP,
    editable: false
  })

  const rootClass = className === undefined || className === '' ? 'rp-read' : `rp-read ${className}`

  return (
    <div className={rootClass}>
      {isEmpty ? (
        <div className="rp-read__empty">{emptyText}</div>
      ) : (
        // 只读容器：`.rp-read` 作用域内已禁用光标与段落 hover 底色
        // （见 styles/writer-right-outline.css）。
        <EditorContent editor={editor} className="rp-read__doc" />
      )}
    </div>
  )
}

export default ReadonlyRichText

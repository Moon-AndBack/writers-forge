import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Extensions } from '@tiptap/core'
import { EditorContent } from '@tiptap/react'
import { toCssString } from './richTextExtensions'
import { SHORT_TEXT_EXTENSIONS } from './shortTextExtensions'
import { useRichTextBodyEditor, type RichTextBodyValue } from './useRichTextBodyEditor'
import '../../styles/components/short-rich-field.css'

export interface ShortRichTextFieldProps {
  /**
   * 初始正文（库内 JSON 串；`null` = 空）。**仅在挂载时读取一次**——切换目标时
   * 调用方须按 `key` 重建组件（与 `useRichTextBodyEditor` 口径一致）。
   */
  initialJson: string | null
  /** 正文变更：已归一值（空文档 → `text: ''` / `json: null`）。 */
  onChange: (value: RichTextBodyValue) => void
  /** 空态占位文案（调用方经 `t()` 传入）。 */
  placeholder: string
  /** 无障碍标签（容器 `role="group"`）；富文本区不是原生 labelable 控件，故不走 htmlFor。 */
  ariaLabel?: string
  /** 只读（内部走 `editor.setEditable(false)`）。 */
  disabled?: boolean
  /**
   * 追加扩展（如 `EntityHighlight.configure({ getBookId })`）。
   * ⚠️ 必须是**模块级常量或 `useMemo` 恒等引用**：`useEditor` 按引用比对选项，每次渲染
   * 新建会触发 `setOptions` → 选区回搬，导致同页其它输入框中文组合串被丢弃。
   */
  extensions?: Extensions
  /**
   * 高度策略：`true` = 撑满父容器剩余高度（右栏可伸缩字段）；默认按内容高度，
   * 最小 82px、最大 200px，超出后内部滚动（弹窗等短字段场景）。
   */
  fill?: boolean
  /**
   * 根元素标签：默认 `div`；右栏可为 `section`，让字段自身承担区块 + 输入框语义
   * （如时间线起点内容卡）。`EditorContent` 仍固定多一层 `div` 承载 `.ProseMirror`。
   */
  as?: 'div' | 'section'
  /** 附加类名（样式覆写用）。 */
  className?: string
}

/**
 * 「短文本字段」富文本薄壳（§9：通用组件，不含任何域专有逻辑）。
 *
 * 与 `PlotBodyEditor` / `DossierBodyEditor` 同源：状态与副作用复用通用 hook
 * `useRichTextBodyEditor`，本组件只负责**界面**——轻量扩展底座（`SHORT_TEXT_EXTENSIONS`）
 * + 占位文案 + 高度 / 滚动 + 只读同步。实体高亮等域扩展由调用方经 `extensions` 注入
 * （按实例 `configure` 的 `bookId` 闭包无法放进模块级常量）。
 *
 * 样式见 `styles/components/short-rich-field.css`：外观对齐 `.wf-textarea`（含 `.on-soft`
 * 底色容器适配），但不引入 `.doc-body` 的版心 / 首行缩进等长文排版。
 */
export function ShortRichTextField({
  initialJson,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  extensions,
  fill = false,
  as = 'div',
  className
}: ShortRichTextFieldProps) {
  // 底座 + 调用方追加扩展：`useEditor` 需恒等引用，故按 `extensions` 引用缓存。
  const mergedExtensions = useMemo(
    () =>
      extensions !== undefined && extensions.length > 0
        ? [...SHORT_TEXT_EXTENSIONS, ...extensions]
        : SHORT_TEXT_EXTENSIONS,
    [extensions]
  )

  const { editor, isEmpty } = useRichTextBodyEditor({
    initialJson,
    extensions: mergedExtensions,
    onChange,
    editable: !disabled
  })

  const classes = [
    'short-rich-field',
    fill ? 'short-rich-field--fill' : '',
    isEmpty ? 'is-empty' : '',
    disabled ? 'is-disabled' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  const Root = as ?? 'div'

  return (
    <Root className={classes} role="group" aria-label={ariaLabel} aria-disabled={disabled}>
      <EditorContent
        editor={editor}
        className="short-rich-field__body"
        style={
          {
            '--editor-placeholder': toCssString(placeholder)
          } as CSSProperties
        }
      />
    </Root>
  )
}

export default ShortRichTextField

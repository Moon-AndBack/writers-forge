import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../ui'
import { BoldIcon, CodeIcon, ItalicIcon, StrikeIcon, UnderlineIcon } from '../icons'
import { EditorColorButton } from './EditorColorButton'

/**
 * 富文本行内格式操作按钮组（标题栏共享块）：
 * 加粗 · 斜体 · 下划线 · 删除线 · 行内代码 · 字色 · 高亮。
 *
 * 由「大纲」模块标题栏引用；「章节」侧将来复用（§9 通用化）。与 `EditorActionGroup`
 * 同层：开关类按钮沿用标题栏 ghost 图标按钮（`.tb-action`），激活态走 `is-active`
 * 底色语义；颜色类（字色 / 高亮）由 `EditorColorButton` 渲染为同款图标触发 + 色板下拉。
 * 文案统一取 `common` ns。
 *
 * 注：「清除格式」已从本组末尾移出，作为独立组件 `EditorClearFormat`（R10b）——
 * 本组只保留作用于选区 mark 的开关，整组结构与用户要求的顺序对齐。
 *
 * 可用态：editor 为 null 或只读时整组禁用；有 editor 但**无选区不禁用**
 * （stored mark 标准行为——先点格式再输入同样生效）。激活态 / 可用态经
 * `useEditorState`（`@tiptap/react` 官方响应式 hook）派生，随 editor transaction
 * 自行重渲染，调用方无需透传状态。
 *
 * ⚠️ 命令链必须在 `onClick` 回调内 `editor.chain().focus()` 现建：选择器只返回上列
 * mark 布尔量，纯文本选区变化不触发重渲染，若在渲染期建链会冻结旧选区快照，
 * 导致点击格式按钮对选中文字无效（只在折叠光标处写 stored mark）。
 */
export interface EditorFormatGroupProps {
  /** Tiptap 编辑器实例；null（编辑器未就绪 / 挂载中）时整组禁用。 */
  editor: Editor | null
}

interface FormatGroupState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  editable: boolean
}

const DISABLED_STATE: FormatGroupState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  editable: false
}

export function EditorFormatGroup({ editor }: EditorFormatGroupProps): ReactNode {
  const { t: tCommon } = useTranslation('common')

  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }): FormatGroupState | null =>
        instance === null
          ? null
          : {
              bold: instance.isActive('bold'),
              italic: instance.isActive('italic'),
              underline: instance.isActive('underline'),
              strike: instance.isActive('strike'),
              code: instance.isActive('code'),
              editable: instance.isEditable
            }
    }) ?? DISABLED_STATE

  const toggleDisabled = !state.editable

  return (
    <>
      <IconButton
        className={`tb-action${state.bold ? ' is-active' : ''}`}
        label={tCommon('bold')}
        tooltipPlacement="bottom"
        disabled={toggleDisabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <BoldIcon />
      </IconButton>
      <IconButton
        className={`tb-action${state.italic ? ' is-active' : ''}`}
        label={tCommon('italic')}
        tooltipPlacement="bottom"
        disabled={toggleDisabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </IconButton>
      <IconButton
        className={`tb-action${state.underline ? ' is-active' : ''}`}
        label={tCommon('underline')}
        tooltipPlacement="bottom"
        disabled={toggleDisabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon />
      </IconButton>
      <IconButton
        className={`tb-action${state.strike ? ' is-active' : ''}`}
        label={tCommon('strike')}
        tooltipPlacement="bottom"
        disabled={toggleDisabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        <StrikeIcon />
      </IconButton>
      <IconButton
        className={`tb-action${state.code ? ' is-active' : ''}`}
        label={tCommon('format.inlineCode')}
        tooltipPlacement="bottom"
        disabled={toggleDisabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      >
        <CodeIcon />
      </IconButton>
      {/* 字色（前景）· 高亮（背景）：两套独立、可叠加，共用同一色板。 */}
      <EditorColorButton editor={editor} role="text" />
      <EditorColorButton editor={editor} role="highlight" />
    </>
  )
}

export default EditorFormatGroup

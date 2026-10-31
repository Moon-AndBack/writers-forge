import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../ui'
import { RemoveFormatIcon } from '../icons'
import { EditorActionSep } from './EditorActionGroup'

/**
 * 标题栏「清除格式」独立按钮（自 `EditorFormatGroup` 末尾移出，R10b）。
 *
 * 从行内格式组拆出的原因：用户要求的标题栏顺序把「清除格式」与「行内组」
 * （加粗 … 字色 / 高亮）分开——行内组只保留「作用于选区 mark 的开关」，
 * 清除格式作为**组结束后的独立项**呈现。首部自带一条竖分隔线（`EditorActionSep`），
 * 使视觉分组为「… 高亮 ｜ 清除格式」，与拆分前的分隔位置一致。
 *
 * 命令：`unsetAllMarks()`（连同行内颜色 / 高亮一并清除）。editor 为 null 或只读时禁用；
 * 命令链在 `onClick` 内 `editor.chain().focus()` 现建（见 EditorBlockGroup 说明）。
 */
export interface EditorClearFormatProps {
  /** Tiptap 编辑器实例；null（编辑器未就绪 / 挂载中）时禁用。 */
  editor: Editor | null
}

export function EditorClearFormat({ editor }: EditorClearFormatProps): ReactNode {
  const { t } = useTranslation('common')

  const editable =
    useEditorState({
      editor,
      selector: ({ editor: instance }): boolean => instance?.isEditable ?? false
    }) ?? false

  return (
    <>
      <EditorActionSep />
      <IconButton
        className="tb-action"
        label={t('clearFormat')}
        tooltipPlacement="bottom"
        disabled={!editable}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor?.chain().focus().unsetAllMarks().run()}
      >
        <RemoveFormatIcon />
      </IconButton>
    </>
  )
}

export default EditorClearFormat

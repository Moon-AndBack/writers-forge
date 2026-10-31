import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { ParagraphIcon } from '../icons'
import { FormatButton, FormatPopover } from './FormatPopover'

/**
 * 大纲页「段落」分组：无序列表 / 有序列表 / 引用 / 代码块 / 分隔线（**竖向**排列）。
 *
 * 由原「段落格式」面板拆分而来（R8-B）：块级容器类命令留在本组，标题类命令
 * （正文 / H1–H6）移入 `EditorHeadingGroup`。两组各自独立触发器与面板。
 *
 * 全部命令均为 Tiptap 3 内置（bulletList / orderedList / blockquote / codeBlock /
 * horizontalRule 由 StarterKit 提供，见 OutlineEditor 的 `EDITOR_BASE_EXTENSIONS`）。
 * 面板经 `FormatPopover` portal 逃生标题栏 overflow。
 *
 * ⚠️ 所有命令链在 `onClick` 回调内 `editor.chain().focus()` **现建**——渲染期建链会
 * 冻结旧选区快照，导致「选中文字点按钮无效」（与 EditorFormatGroup 同口径）；
 * 按钮态由 `useEditorState` 订阅 editor transaction 派生。
 */
export interface EditorBlockGroupProps {
  /** Tiptap 编辑器实例；null 时触发器禁用。 */
  editor: Editor | null
}

interface BlockGroupState {
  bulletList: boolean
  orderedList: boolean
  blockquote: boolean
  codeBlock: boolean
  editable: boolean
}

const DISABLED_STATE: BlockGroupState = {
  bulletList: false,
  orderedList: false,
  blockquote: false,
  codeBlock: false,
  editable: false
}

export function EditorBlockGroup({ editor }: EditorBlockGroupProps): ReactNode {
  const { t } = useTranslation('common')

  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }): BlockGroupState | null =>
        instance === null
          ? null
          : {
              bulletList: instance.isActive('bulletList'),
              orderedList: instance.isActive('orderedList'),
              blockquote: instance.isActive('blockquote'),
              codeBlock: instance.isActive('codeBlock'),
              editable: instance.isEditable
            }
    }) ?? DISABLED_STATE

  const toggleDisabled = !state.editable

  return (
    <FormatPopover
      editor={editor}
      icon={<ParagraphIcon />}
      label={t('format.paragraphGroup')}
      panelLabel={t('format.paragraphGroup')}
      width={196}
    >
      {() => (
        <>
          <div className="wf-format-pop__title">{t('format.paragraphGroup')}</div>
          {/* 竖向：每项独占一行（--stack 单列网格）。 */}
          <div className="wf-format-pop__grid wf-format-pop__grid--stack">
            <FormatButton
              label={t('format.bulletList')}
              active={state.bulletList}
              disabled={toggleDisabled}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            />
            <FormatButton
              label={t('format.orderedList')}
              active={state.orderedList}
              disabled={toggleDisabled}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            />
            <FormatButton
              label={t('format.blockquote')}
              active={state.blockquote}
              disabled={toggleDisabled}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            />
            <FormatButton
              label={t('format.codeBlock')}
              active={state.codeBlock}
              disabled={toggleDisabled}
              onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            />
            <FormatButton
              label={t('format.horizontalRule')}
              disabled={toggleDisabled}
              onClick={() => editor?.chain().focus().setHorizontalRule().run()}
            />
          </div>
        </>
      )}
    </FormatPopover>
  )
}

export default EditorBlockGroup

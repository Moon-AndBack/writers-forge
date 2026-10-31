import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { HeadingIcon } from '../icons'
import { FormatButton, FormatPopover } from './FormatPopover'

/**
 * 大纲页「标题」分组：正文（paragraph）+ H1–H6（**竖向**排列）。
 *
 * 由原「段落格式」面板拆分而来（R8-B）：标题类命令独立成组，与「段落」组
 * （列表 / 引用 / 代码块 / 分隔线，见 `EditorBlockGroup`）各自独立触发器与面板。
 *
 * 命令均由 StarterKit 的 heading（默认 `levels: [1..6]`）与 paragraph 提供
 * （见 OutlineEditor 的 `EDITOR_BASE_EXTENSIONS`）；面板经 `FormatPopover`
 * portal 逃生标题栏 overflow。
 *
 * ⚠️ 所有命令链在 `onClick` 回调内 `editor.chain().focus()` **现建**（见
 * EditorBlockGroup 说明）；按钮态由 `useEditorState` 订阅 editor transaction 派生。
 */
export interface EditorHeadingGroupProps {
  /** Tiptap 编辑器实例；null 时触发器禁用。 */
  editor: Editor | null
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const

interface HeadingGroupState {
  paragraph: boolean
  levels: boolean[]
  editable: boolean
}

const DISABLED_STATE: HeadingGroupState = {
  paragraph: false,
  levels: [false, false, false, false, false, false],
  editable: false
}

export function EditorHeadingGroup({ editor }: EditorHeadingGroupProps): ReactNode {
  const { t } = useTranslation('common')

  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }): HeadingGroupState | null =>
        instance === null
          ? null
          : {
              paragraph: instance.isActive('paragraph'),
              levels: HEADING_LEVELS.map((level) => instance.isActive('heading', { level })),
              editable: instance.isEditable
            }
    }) ?? DISABLED_STATE

  const toggleDisabled = !state.editable

  return (
    <FormatPopover
      editor={editor}
      icon={<HeadingIcon />}
      label={t('format.headingGroup')}
      panelLabel={t('format.headingGroup')}
      width={196}
    >
      {() => (
        <>
          <div className="wf-format-pop__title">{t('format.headingGroup')}</div>
          {/* 竖向：每项独占一行（--stack 单列网格）。 */}
          <div className="wf-format-pop__grid wf-format-pop__grid--stack">
            <FormatButton
              label={t('format.paragraph')}
              active={state.paragraph}
              disabled={toggleDisabled}
              onClick={() => editor?.chain().focus().setParagraph().run()}
            />
            {HEADING_LEVELS.map((level) => (
              <FormatButton
                key={level}
                label={t(`format.h${level}`)}
                active={state.levels[level - 1] ?? false}
                disabled={toggleDisabled}
                onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
              />
            ))}
          </div>
        </>
      )}
    </FormatPopover>
  )
}

export default EditorHeadingGroup

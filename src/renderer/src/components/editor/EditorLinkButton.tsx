import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { LinkIcon } from '../icons'
import { FormatButton, FormatPopover } from './FormatPopover'
import { clearLinkSelectionMirror, showLinkSelectionMirror } from './linkSelectionMirror'

/**
 * 大纲页「链接」独立按钮（`setLink` / `unsetLink`，StarterKit 内置 `@tiptap/extension-link`）。
 *
 * - 自 `EditorInsertGroup` 拆出，与表格 / 图片同级顶层（顺序：表格 · 链接 · 图片）。
 * - URL 输入框在面板打开时以当前链接属性预填（`editor.getAttributes('link').href`）。
 * - 面板经 `FormatPopover` 渲染函数每次展开重挂（关闭即卸载），`useState` 初始值随打开重算。
 * - 命令链在 `onClick` 内 `editor.chain().focus()` 现建（与其它分组同口径）。
 */
export interface EditorLinkButtonProps {
  /** Tiptap 编辑器实例；null 时触发器禁用。 */
  editor: Editor | null
}

interface LinkState {
  link: boolean
  editable: boolean
}

const DISABLED_STATE: LinkState = { link: false, editable: false }

export function EditorLinkButton({ editor }: EditorLinkButtonProps): ReactNode {
  const { t } = useTranslation('common')

  return (
    <FormatPopover
      editor={editor}
      icon={<LinkIcon />}
      label={t('format.link')}
      panelLabel={t('format.link')}
      width={240}
    >
      {(close) => <LinkBody editor={editor} onDone={close} />}
    </FormatPopover>
  )
}

interface LinkBodyProps {
  editor: Editor | null
  /** 提交后收起面板。 */
  onDone: () => void
}

function LinkBody({ editor, onDone }: LinkBodyProps): ReactNode {
  const { t } = useTranslation('common')
  const [url, setUrl] = useState<string>(
    () => (editor?.getAttributes('link').href as string | undefined) ?? ''
  )
  // 面板挂载（即每次打开）时快照选区：input 点击经 preventDefault + 编程聚焦，
  // 编辑器会 blur，无参 focus() 找不回原选区；提交时先 setTextSelection 恢复。
  const [range] = useState<{ from: number; to: number } | null>(() => {
    const sel = editor?.state.selection
    return sel ? { from: sel.from, to: sel.to } : null
  })
  // 链接面板打开期间：以饰带镜像快照选区（失焦期浅蓝常驻；空选区不画）。
  // 插件经首开注入（`ensureLinkSelectionMirror` 内 `reconfigure` 追加），饰带随文档
  // 事务 map 跟随；卸载（关闭 / 提交 / Esc / 点外）即清，无残留；全程不抢焦点，IME 安全。
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.isInitialized) return undefined
    if (!range || range.to <= range.from) return undefined
    showLinkSelectionMirror(editor, range)
    return () => {
      clearLinkSelectionMirror(editor)
    }
  }, [editor, range])

  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }): LinkState | null =>
        instance === null
          ? null
          : { link: instance.isActive('link'), editable: instance.isEditable }
    }) ?? DISABLED_STATE

  const disabled = !state.editable
  const trimmed = url.trim()

  const applyLink = (): void => {
    if (disabled || !editor) return
    let chain = editor.chain().focus()
    if (range) chain = chain.setTextSelection(range)
    if (trimmed === '') chain.extendMarkRange('link').unsetLink().run()
    else chain.extendMarkRange('link').setLink({ href: trimmed }).run()
    onDone()
  }

  const removeLink = (): void => {
    if (disabled || !editor) return
    let chain = editor.chain().focus()
    if (range) chain = chain.setTextSelection(range)
    chain.extendMarkRange('link').unsetLink().run()
    onDone()
  }

  return (
    <div className="wf-format-pop__section">
      <div className="wf-format-pop__title">{t('format.link')}</div>
      <input
        className="wf-format-pop__url"
        type="text"
        value={url}
        placeholder={t('format.linkPlaceholder')}
        aria-label={t('format.linkUrl')}
        disabled={disabled}
        onMouseDown={(event) => {
          // 阻止默认抢焦点致编辑器选区丢失；再编程聚焦保证可打字与中文 IME。
          // 不用 autoFocus：面板打开时不牵动 blur 链路（见 EditorInsertGroup 注释）。
          event.preventDefault()
          event.currentTarget.focus()
        }}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            applyLink()
          }
        }}
      />
      <div className="wf-format-pop__actions">
        <FormatButton
          label={t('format.linkApply')}
          active={state.link}
          disabled={disabled}
          onClick={applyLink}
        />
        <FormatButton
          label={t('format.linkRemove')}
          disabled={disabled || !state.link}
          onClick={removeLink}
        />
      </div>
    </div>
  )
}

export default EditorLinkButton

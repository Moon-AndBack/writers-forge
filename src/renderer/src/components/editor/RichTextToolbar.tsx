import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { EditorActionSep, EditorUndoRedoGroup } from './EditorActionGroup'
import { EditorFormatGroup } from './EditorFormatGroup'
import { EditorHeadingGroup } from './EditorHeadingGroup'
import { EditorBlockGroup } from './EditorBlockGroup'
import { EditorInsertGroup } from './EditorInsertGroup'
import { EditorLinkButton } from './EditorLinkButton'
import { EditorImageButton } from './EditorImageButton'
import { EditorClearFormat } from './EditorClearFormat'

/**
 * 富文本正文**工具栏**（剧情页标题栏 / 设定库正文共用，§9）：撤销 · 重做 ｜ 行内格式
 * （加粗 / 斜体 / 下划线 / 删除线 / 行内代码 / 字色 / 高亮）｜ 标题 ▾ · 段落 ▾ · 表格 ▾ ·
 * 链接 ▾ · 图片 ▾ ｜ 清除格式。
 *
 * 本组件只做**组合**：各按钮 / 分组仍复用 `components/editor/*` 既有实现（不复制），
 * 撤销重做可用态在此统一订阅 editor `transaction`（原先由剧情页标题栏动作各自维护，
 * 抽出后调用方无需再重复一遍）。
 *
 * ⚠️ 选区保持：容器 `onMouseDown` 统一 `preventDefault`——否则点击任一按钮会先使编辑器
 * 失焦，外层若按聚焦态显隐工具栏，会在 click 派发前卸载组件导致命令无从执行
 * （与 `FormatPopover` / `EditorFormatGroup` 的选区保持同口径）。
 *
 * ⚠️ 本组件**不含**保存 / 搜索 / 回收站等页面级入口，也不感知任何域专有扩展与数据层。
 */
export interface RichTextToolbarProps {
  /** Tiptap 编辑器实例（`null` 时各分组自行置灰）。 */
  editor: Editor | null
  /** 归属书 id（图片按书隔离入库）；空 / undefined → 插图入口禁用。 */
  bookId?: string
  /** 容器 class（如标题栏工具栏的 `.tb-editor-actions`，`display: contents`）；不传则不挂 class。 */
  className?: string
  /**
   * 是否渲染**组首**竖分隔线（默认 `true`）：标题栏工具区以此线与左侧按钮分界；
   * 独立成行（非标题栏）的工具栏可传 `false`。
   */
  leadingSeparator?: boolean
}

/** 撤销 / 重做可用态（随 editor transaction 同步；与大纲编辑器同口径）。 */
interface UndoRedoState {
  canUndo: boolean
  canRedo: boolean
}

const INITIAL_UNDO_STATE: UndoRedoState = { canUndo: false, canRedo: false }

export function RichTextToolbar({
  editor,
  bookId,
  className,
  leadingSeparator = true
}: RichTextToolbarProps): ReactNode {
  // 撤销 / 重做可用态：`useEditorState` 订阅 editor transaction 派生（挂载首帧即准确，
  // 不经过「先禁用、effect 后同步」的一帧空窗；与其它分组同口径）。
  const undoState =
    useEditorState({
      editor,
      selector: ({ editor: instance }): UndoRedoState =>
        instance === null
          ? INITIAL_UNDO_STATE
          : { canUndo: instance.can().undo(), canRedo: instance.can().redo() }
    }) ?? INITIAL_UNDO_STATE

  const handleUndo = useCallback((): void => {
    editor?.chain().focus().undo().run()
  }, [editor])
  const handleRedo = useCallback((): void => {
    editor?.chain().focus().redo().run()
  }, [editor])

  return (
    /* 容器 onMouseDown 阻止默认，保编辑器选区 / 聚焦。 */
    <div className={className} onMouseDown={(event) => event.preventDefault()}>
      {leadingSeparator && <EditorActionSep />}
      <EditorUndoRedoGroup
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
      />
      <EditorActionSep />
      <EditorFormatGroup editor={editor} />
      <EditorActionSep />
      <EditorHeadingGroup editor={editor} />
      <EditorBlockGroup editor={editor} />
      <EditorInsertGroup editor={editor} />
      <EditorLinkButton editor={editor} />
      <EditorImageButton editor={editor} bookId={bookId} />
      {/* 清除格式自带组首竖分隔线（「… 图片 ｜ 清除格式」），故此处不再另挂。 */}
      <EditorClearFormat editor={editor} />
    </div>
  )
}

export default RichTextToolbar

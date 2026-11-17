import type { CSSProperties } from 'react'
import type { Editor } from '@tiptap/core'
import { EditorContent } from '@tiptap/react'
import { docCharCount } from '../docWordLimit'
import DocCharCount from '../DocCharCount'
import type { ContentSwapPhase } from '../../../components/editor/useContentSwap'
import ChapterEditorHead from './ChapterEditorHead'
import { SaveStatus, type ChapterSaveState } from './SaveStatus'
import type { ChapterStatus } from './chapterTree'
import type { UseChapterNameResult } from './useChapterName'

export interface ChapterEditorPaneProps {
  /** 当前章节 id（null = 无选中）。 */
  chapterId: number | null
  /** 章节名编辑状态（`useChapterName`）。 */
  name: UseChapterNameResult
  /** 已渲染的「最后编辑」文案（空串不渲染）。 */
  lastEdited: string
  /** 当前章节状态（状态按钮两态配色）。 */
  chapterStatus: ChapterStatus
  /** 是否定稿（正文只读 + 状态切换反相）。 */
  isDone: boolean
  /** 状态按钮点击（两态切换）。 */
  onToggleStatus: () => void
  /** 「复制全文」点击。 */
  onCopyAll: () => void
  /** 「复制全文」禁用（无章节 / 正文加载中；只读定稿仍可复制）。 */
  copyDisabled: boolean
  /** 正文编辑器实例。 */
  editor: Editor | null
  /** 正文是否空态（挂 `.is-empty` 展示占位诗句）。 */
  isEmpty: boolean
  /** 空态诗句的样式变量（`useDocPlaceholder` 透传）。 */
  docBodyStyle: CSSProperties
  /** 占位淡入相位（0 / 1 交替）。 */
  phase: number
  /** 正文更换后的淡入相位（null = 首次载入不淡入）。 */
  swapPhase: ContentSwapPhase | null
  /** 脚注保存状态（`useChapterDoc` 的 status + dirty 归并）。 */
  saveState: ChapterSaveState
}

/**
 * 章节中栏：编辑头（标题 / 元信息）+ 正文滚动区 + 字数脚注。
 *
 * 自 `ChaptersView` 原样拆出（AGENTS §3 单文件行数约束），渲染结构与类名不变；
 * 编辑器实例、空态判定与保存态仍由视图层持有，经 props 传入。
 */
export default function ChapterEditorPane({
  chapterId,
  name,
  lastEdited,
  chapterStatus,
  isDone,
  onToggleStatus,
  onCopyAll,
  copyDisabled,
  editor,
  isEmpty,
  docBodyStyle,
  phase,
  swapPhase,
  saveState
}: ChapterEditorPaneProps) {
  return (
    <>
      {/* 标题 / 信息头部：置于滚动区之外，始终固定显示，仅正文滚动。
          标题行右侧承载「复制全文」胶囊；元信息行为「最后编辑 + 状态」胶囊（见 ChapterEditorHead / DocMeta）。 */}
      <ChapterEditorHead
        chapterId={chapterId}
        name={name}
        lastEdited={lastEdited}
        chapterStatus={chapterStatus}
        onToggleStatus={onToggleStatus}
        onCopyAll={onCopyAll}
        copyDisabled={copyDisabled}
      />
      {/* 正文滚动区：无外边框（聚焦框已移除），仅正文滚动；标题/元信息在滚动区之外固定。
          data-swap-phase 交替两档别名关键帧 → 切章后正文淡入重播（useContentSwap；null = 首次载入不挂属性、不淡入）。 */}
      <div className="editor-scroll" data-swap-phase={swapPhase ?? undefined}>
        <div className="editor-inner">
          {/* Tiptap 渲染为 .doc-body > .ProseMirror > p（阶段② DOM 层级）。
              空态时追加 .is-empty 并经 CSS 变量传入当前诗句，由 CSS 伪元素渲染光标处占位提示；
              data-placeholder-phase 交替驱动两段同名不同名的淡入动画，实现轮换时柔和淡入。
              定稿只读时追加 .is-readonly 轻提示（见 writer-editor.css）。 */}
          <EditorContent
            editor={editor}
            className={`doc-body${isEmpty ? ' is-empty' : ''}${isDone ? ' is-readonly' : ''}`}
            style={docBodyStyle}
            data-placeholder-phase={phase}
          />
        </div>
      </div>
      <div className="editor-foot">
        {/* 左侧保存状态（数据来自 useChapterDoc 的 status + dirty，只读展示）。 */}
        <SaveStatus state={saveState} />
        {/* 单篇正文有效字数 / 上限：读数与输入拦截同源（`docCharCount` 读块级缓存）。 */}
        <DocCharCount count={docCharCount(editor)} scope="chapter" />
      </div>
    </>
  )
}

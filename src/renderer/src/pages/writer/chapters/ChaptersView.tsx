import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { DocWordLimit, docCharCount } from '../docWordLimit'
import DocCharCount from '../DocCharCount'
import { EntityHighlight } from '../entities/entityHighlight'
import { HoverCard } from '../entities/HoverCard'
import { getQuotePool, randomQuoteIndex } from '../quotes'
import { SaveStatus, type ChapterSaveState } from './SaveStatus'
import ChapterActivityActions from './ChapterActivityActions'
import ChaptersSearchView from './ChaptersSearchView'
import { CleanWordMark } from './proofreadMark'
import NewVolumeDialog from '../../../components/dialogs/NewVolumeDialog'
import { useChapterSearch, type ChapterSearchHit } from './useChapterSearch'
import { useChapterDoc } from './useChapterDoc'
import { useSyncFlushHandler } from '../../../shell/beforeCloseFlush'
import { useEntityHover } from '../entities/useEntityHover'
import DocTitleRow from './DocTitleRow'
import DocMeta from '../../../components/editor/DocMeta'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import { useChapterName } from './useChapterName'
import {
  formatRelativeTime,
  STATUS_LABELS,
  type ChapterRow,
  type ChapterStatus,
  type CreateVolumeInput,
  type RenameChapterPatch
} from './chapterTree'

/**
 * StarterKit 裁剪说明：
 * - 保留 document / paragraph / text（骨架）+ bold / italic（快捷键）
 *   + history（撤销重做）；
 * - 剔除 heading / blockquote / bulletList / orderedList / listItem / codeBlock /
 *   horizontalRule / hardBreak / dropcursor / gapcursor：
 *   正文为「每段一个 paragraph」的纯段落口径（paragraphs 表按段存储），
 *   保留这些块级扩展会让 doc 出现非 paragraph 顶层节点，破坏 doc ↔ texts 一一对应。
 */
const EDITOR_BASE_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    codeBlock: false,
    horizontalRule: false,
    hardBreak: false,
    dropcursor: false,
    gapcursor: false
  }),
  // 单篇正文有效字数上限（20 万；输入时拦截），与大纲编辑器共用同一扩展。
  DocWordLimit,
  // 违禁词命中标注（波浪下划线，只提示不阻断；词表与扫描调度见 proofreadMark.ts）。
  CleanWordMark
]

/**
 * `useEditor` 选项**逐字恒等**用的模块级常量（W11 中文输入法焦点修复）：
 *
 * `useEditor` 默认 `deps = []`，其 `EditorInstanceManager.onRender` 会在**每次渲染**时
 * `compareOptions`，不相等即 `editor.setOptions()` → `view.updateState()` →
 * **`selectionToDOM` 把 DOM Selection 强行搬回 `.ProseMirror`**。若 `content` 每次渲染新建，
 * 章节名输入框的每次按键都会令 DOM 焦点被搬回正文，中文输入法（IME）组合串随之丢弃。
 * 故 `content` 必须为模块级恒等引用。
 */
const EMPTY_CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] }

/** 空态提示轮换间隔（毫秒）：空状态停留时每 ~10s 换一条。 */
const EMPTY_HINT_ROTATE_MS = 10000

/**
 * 正文是否「空」：doc 仅一个顶层段落且该段无文本（`doc.childCount === 1`
 * 且首段 text 为空），与章节正文「每段一个 paragraph」的存储口径一致。
 * 多段（含多个空段）时不算空——用户已产生换行 / 结构，不再展示提示。
 */
function isEmptyDoc(editor: Editor): boolean {
  const doc = editor.state.doc
  if (doc.childCount !== 1) return false
  const first = doc.child(0)
  return first.type.name === 'paragraph' && first.textContent.length === 0
}

/** 把任意文本包成合法 CSS 字符串字面量，供 `content: var(--editor-placeholder)` 使用。 */
function toCssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export interface ChaptersViewProps {
  /** 书籍 id（路由参数），实体匹配按书隔离。 */
  bookId?: string
  /** 当前选中章节行（左栏章节树共享状态）；null = 无选中 / 未加载。 */
  chapter: ChapterRow | null
  /** 同书全部未删除章（搜索 / 定位上下文）。 */
  chapters: ChapterRow[]
  /** 状态切换回调（点击编辑头状态文字，两态：草稿 ↔ 定稿）。 */
  onStatusChange: (id: number, status: ChapterStatus) => void
  /** 章节名落库回调（字段直映射）。 */
  onRenameChapter: (id: number, patch: RenameChapterPatch) => void
  /** 搜索命中跳转的其它章：切换页面选中章（当前章由本视图直接处理）。 */
  onSelectChapter: (id: number) => void
  /** 替换后回调（刷新章节树 / 统计等）。 */
  onContentChanged: (chapterIds: number[]) => void
  /** 切换中栏回收站视图。 */
  onToggleTrash: () => void
  /** 回收站视图是否打开（标题栏「回收站」按钮激活态）。 */
  trashOpen: boolean
  /** 新建卷（标题栏「新建卷」弹窗提交，页面层调 `createVolume`）。 */
  onCreateVolume: (input: CreateVolumeInput) => void
  /** 立即落盘入口（写入本视图 `flush`，卸载置空）：页面层关闭前统一 flush 用。 */
  flushRef?: RefObject<(() => Promise<void>) | null>
}

/**
 * 章节视图：标题/元信息（固定头部）+ Tiptap 正文（滚动） + 字数脚注。
 * 无工具栏、无正文聚焦外框；标题/元信息固定在滚动区之外，正文独立滚动。
 * 正文持久化走 paragraphs 表（useChapterDoc，按章节 id）；实体高亮与悬停弹窗见 entities/ 目录。
 * 定稿（done）时正文只读（`editor.setEditable(false)`），保留滚动与实体高亮 / 悬停弹窗。
 */
export default function ChaptersView({
  bookId,
  chapter,
  chapters,
  onStatusChange,
  onRenameChapter,
  onSelectChapter,
  onContentChanged,
  onToggleTrash,
  trashOpen,
  onCreateVolume,
  flushRef
}: ChaptersViewProps) {
  const { t, i18n } = useTranslation('chapters')
  const safeBookId = bookId ?? ''
  const chapterId = chapter?.id ?? null
  const chapterStatus: ChapterStatus = chapter?.status ?? 'draft'
  const isDone = chapterStatus === 'done'

  // 编辑头章节名（v2 字段直映射）：普通章固定前缀 + 空隙 + 名输入；特殊章前段只读 + 名输入。
  const name = useChapterName({ chapter, renameChapter: onRenameChapter })

  const hover = useEntityHover()
  // hover 方法进 editorProps 闭包：useEditor 仅创建一次，
  // 借 useEffect 把最新 hover 写入 ref（渲染期不触碰 ref）
  const hoverRef = useRef(hover)
  useEffect(() => {
    hoverRef.current = hover
  }, [hover])

  // ⚠️ EntityHighlight 的 `getBookId` 闭包**必须**捕获当前 `safeBookId`（不可提到模块级常量）：
  // `entityHighlight.scheduleRematch` 在每次防抖到期时运行时调用 `options.getBookId()` 取当前
  // bookId；若固化首次渲染的 id，路由切书后 `getBookId()` 永远返回旧 id → 跨书错匹配数据。
  const editorExtensions = useMemo(
    () => [...EDITOR_BASE_EXTENSIONS, EntityHighlight.configure({ getBookId: () => safeBookId })],
    [safeBookId]
  )
  // `hoverRef` 是 useRef 的**容器**：此处固化容器引用（`useMemo([])`）而非其指向的值，
  // hover 回调经 `hoverRef.current` 始终读到最新值（既有正确设计）。
  const editorProps = useMemo(
    () => ({
      attributes: { spellcheck: 'false' },
      handleDOMEvents: {
        mouseover: (_view: unknown, event: MouseEvent) => {
          const target = event.target as HTMLElement
          if (target.closest('span[data-entity-id]')) {
            hoverRef.current.onMouseOver(event as unknown as React.MouseEvent<HTMLElement>)
          }
          return false
        },
        mouseout: (_view: unknown, event: MouseEvent) => {
          const target = event.target as HTMLElement
          if (target.closest('span[data-entity-id]')) hoverRef.current.onMouseLeave()
          return false
        }
      }
    }),
    []
  )

  const editor = useEditor({
    // `extensions` 经 `useMemo([safeBookId])` 恒等：仅在切书时重建（`getBookId` 闭包须捕获
    // 当前书 id，**不可**提到模块级常量）。
    extensions: editorExtensions,
    content: EMPTY_CONTENT,
    // 可编辑性走下方 setEditable effect（本处**必须**为字面量 `true`，见 W11 说明）。
    editable: true,
    autofocus: false,
    // editorProps 经 useMemo([]) 恒等：`hoverRef` 是 useRef 容器，固化容器引用即可读到最新 hover。
    editorProps: editorProps
  })

  // 章正文编辑器注册进共享注册表（右栏 AI 面板按选区取正文，槽位 'chapter'）。
  const { registerEditor } = useRichTextEditor('chapter')
  useEffect(() => {
    registerEditor(editor)
    return () => registerEditor(null)
  }, [editor, registerEditor])

  // 只读态同步：状态切换（草稿 ↔ 定稿）时更新可编辑性；保留滚动与实体高亮 / 悬停弹窗。
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!isDone)
  }, [editor, isDone])

  const {
    status: docStatus,
    dirty,
    lastSavedAt,
    onUpdate,
    flush,
    reload,
    swapPhase
  } = useChapterDoc({
    chapterId,
    editor
  })
  useSyncFlushHandler(flushRef, flush)

  /* ---------- 搜索 / 替换浮窗（右上侧） ---------- */
  const [searchOpen, setSearchOpen] = useState(false)
  // 定位重试定时器（跨章跳转后目标章 doc 仍在异步加载时的有限重试）。
  const locateTimerRef = useRef<number | null>(null)

  // 在编辑器内定位命中：按段落 idx 求 ProseMirror 绝对 pos，选中命中范围并滚动入视。
  const locateHit = useCallback(
    (hit: ChapterSearchHit): void => {
      if (!editor || !editor.isInitialized) return
      if (hit.paragraphIdx < 0 || hit.paragraphIdx >= editor.state.doc.childCount) return
      const node = editor.state.doc.child(hit.paragraphIdx)
      if (node.type.name !== 'paragraph') return
      if (hit.end > node.nodeSize - 2) return
      // 段落绝对起点：doc 起点 1 + 前置段落 nodeSize 之和；再 +1 越过段落开标记得文本起点。
      let from = 1
      for (let i = 0; i < hit.paragraphIdx; i += 1) {
        from += editor.state.doc.child(i).nodeSize
      }
      const start = from + 1 + hit.start
      const end = from + 1 + hit.end
      const { tr } = editor.state
      tr.setSelection(TextSelection.create(tr.doc, start, end))
      tr.scrollIntoView()
      editor.view.dispatch(tr)
      editor.view.focus()
    },
    [editor]
  )

  // 定位（带有限重试）：仅当编辑器当前文档与命中同一 document 且已加载完成时才定位，
  // 否则短延时重试（跨章跳转后目标章 doc 仍在异步加载 / 旧章内容尚未替换）。
  const scheduleLocate = useCallback(
    (hit: ChapterSearchHit): void => {
      const attempt = (tries: number): void => {
        if (!editor || !editor.isInitialized) return
        if (chapterId !== hit.chapterId || docStatus === 'loading') {
          if (tries > 0) locateTimerRef.current = window.setTimeout(() => attempt(tries - 1), 120)
          return
        }
        locateHit(hit)
        if (tries > 0 && editor.state.doc.childCount <= hit.paragraphIdx) {
          locateTimerRef.current = window.setTimeout(() => attempt(tries - 1), 120)
        }
      }
      attempt(10)
    },
    [editor, locateHit, chapterId, docStatus]
  )

  // 卸载清理定位定时器。
  useEffect(
    () => () => {
      if (locateTimerRef.current !== null) window.clearTimeout(locateTimerRef.current)
    },
    []
  )

  const search = useChapterSearch({
    bookId: safeBookId,
    chapterId,
    onSelectChapter,
    onLocate: scheduleLocate,
    beforeReplace: flush,
    afterReplace: async (chapterIds) => {
      if (chapterId !== null && chapterIds.includes(chapterId)) await reload()
      onContentChanged(chapterIds)
    }
  })

  // 撤销 / 重做可用态：随 editor transaction 同步（仅在能力变化的事务下更新，
  // 空闲时返回同一引用，避免重复渲染）。
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false })
  useEffect(() => {
    if (!editor) return undefined
    const sync = (): void => {
      const next = { canUndo: editor.can().undo(), canRedo: editor.can().redo() }
      setUndoState((prev) =>
        prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next
      )
    }
    sync()
    editor.on('transaction', sync)
    return () => {
      editor.off('transaction', sync)
    }
  }, [editor])

  // 空态判定：监听 editor 的 transaction（覆盖输入 / 选区 / setContent 切章等一切状态变更）。
  const [isEmpty, setIsEmpty] = useState(true)

  useEffect(() => {
    if (!editor) return undefined
    const sync = (): void => setIsEmpty(isEmptyDoc(editor))
    sync()
    editor.on('transaction', sync)
    editor.on('update', sync)
    return () => {
      editor.off('transaction', sync)
      editor.off('update', sync)
    }
  }, [editor])

  // 空态提示轮换：进入空态 / 切换章节时随机一条；空状态停留期间每 ~10s 换一条。
  // 定时器只在空态存在：isEmpty 转 false（有内容）或组件卸载 / 切章时清除，避免泄漏。
  const [rotateTick, setRotateTick] = useState(0)

  useEffect(() => {
    if (!isEmpty) return undefined
    const timer = window.setInterval(() => setRotateTick((tick) => tick + 1), EMPTY_HINT_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [isEmpty])

  // 当前提示：依赖 [isEmpty, chapterId, rotateTick, i18n.language] 派生——进入空态 / 换章 /
  // 每次轮换 / 切换界面语言都会按当前语言池重新随机一条；phase 随 rotateTick 翻转，
  // 令 ::before 的 animation-name 变更以重启淡入。
  // （isEmpty / chapterId 虽不直接参与取样，但必须在依赖中：切章或由「有内容」回归空态时
  //   需重新随机，故此处显式引用以满足 exhaustive-deps。语言同理：切语言须换池重取。）
  const quote = useMemo(() => {
    void isEmpty
    void chapterId
    const pool = getQuotePool(i18n.language)
    return { index: randomQuoteIndex(-1, pool), pool, phase: rotateTick % 2 }
  }, [isEmpty, chapterId, rotateTick, i18n.language])

  const activeQuote = quote.pool[quote.index] ?? quote.pool[0]
  const placeholder = `${activeQuote.text} —— ${activeQuote.source}`
  const docBodyStyle = {
    '--editor-placeholder': toCssString(placeholder)
  } as CSSProperties

  // 保存状态 → 编辑器脚注左侧（.editor-foot 内，与「本章共 X 字」同行）。
  // 归并为显示态：loading / saving / error 直接映射；ready 时按 dirty 分「未保存 / 已保存」。
  const saveState: ChapterSaveState =
    docStatus === 'saving'
      ? 'saving'
      : docStatus === 'error'
        ? 'error'
        : docStatus === 'loading'
          ? 'loading'
          : dirty
            ? 'dirty'
            : 'saved'

  /* ---------- 标题栏按钮组（章节模块专属） ----------
     保存 / 撤销 / 重做指向**本视图**的 editor 与保存链路；
     新建卷 / 回收站由页面层处理（onNewVolume / onToggleTrash）。
     定稿只读时撤销 / 重做不可用（readOnly 下 history 不产生可撤销事务）。
     三个处理器以 useCallback 稳定引用：按钮节点经 useMemo 缓存并注册到标题栏插槽，
     若每次渲染都重建引用，会引起「注册 → Provider 更新 → 重渲染 → 再注册」的循环。 */
  const handleSave = useCallback((): void => {
    flush()
  }, [flush])
  const handleUndo = useCallback((): void => {
    editor?.chain().focus().undo().run()
  }, [editor])
  const handleRedo = useCallback((): void => {
    editor?.chain().focus().redo().run()
  }, [editor])
  // 搜索浮窗开关：稳定引用，供浮窗「点外关 / Esc」监听与按钮复用（避免每次渲染重挂监听）。
  const closeSearch = useCallback((): void => setSearchOpen(false), [])
  const toggleSearch = useCallback((): void => setSearchOpen((prev) => !prev), [])

  // 「新建卷」弹窗开关（v2：入口在标题栏按钮组，弹窗挂载于本视图）。
  const [newVolumeOpen, setNewVolumeOpen] = useState(false)

  // 绑定 update 事件（引用稳定，useEffect 保证只挂一次、卸载时解除）
  useEffect(() => {
    if (!editor) return undefined
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [editor, onUpdate])

  // 组件卸载（含切走章节视图）前 flush 挂起保存
  useEffect(() => {
    return () => {
      void flush()
    }
  }, [flush])

  // 编辑头「最后编辑」相对时间：优先用本次会话最近落盘时间，回退章节行 `updatedAt`。
  const editedAt = lastSavedAt ?? chapter?.updatedAt ?? null
  const editedLabel = formatRelativeTime(editedAt)

  return (
    <>
      <ChapterActivityActions
        onSave={handleSave}
        saveDisabled={
          !(chapterId !== null && docStatus !== 'loading' && docStatus !== 'saving' && dirty)
        }
        dirty={dirty}
        saving={docStatus === 'saving'}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
        onToggleSearch={toggleSearch}
        searchOpen={searchOpen}
        onNewVolume={() => setNewVolumeOpen(true)}
        onToggleTrash={onToggleTrash}
        trashOpen={trashOpen}
      />
      {/* 「新建卷」弹窗：标题栏按钮触发（Modal 内部经 createPortal 挂 body）。 */}
      {newVolumeOpen && (
        <NewVolumeDialog
          bookId={safeBookId}
          onClose={() => setNewVolumeOpen(false)}
          onSubmit={(input) => {
            setNewVolumeOpen(false)
            onCreateVolume(input)
          }}
        />
      )}
      {/* 查找与替换浮窗：右上侧，浮于正文之上（.ep-search 绝对定位于本视图内）。 */}
      <ChaptersSearchView
        controller={search}
        open={searchOpen}
        onClose={closeSearch}
        chapters={chapters}
      />
      {/* 标题 / 信息头部：置于滚动区之外，始终固定显示，仅正文滚动。 */}
      <div className="editor-head">
        <div className="editor-inner">
          {/* 章节名（v2：前段只读 + 名段单输入，见 DocTitleRow）：
              · 普通章：固定编号前缀「第X章」（span）+ 空隙（容器 gap）+ 可编辑名（input）；
              · 特殊章：前段（创建时已设置，只读 span）+ 空隙 + 名段输入。
              失焦 / Enter 提交落库，Escape 还原；不做按键逐次写库。 */}
          <DocTitleRow chapterId={chapterId} name={name} />
          <DocMeta
            lastEdited={editedLabel !== '' ? t('editor.lastEdited', { time: editedLabel }) : ''}
            status={{
              value: chapterStatus,
              label: t(STATUS_LABELS[chapterStatus]),
              ariaLabel: t('statusToggleAria', { label: t(STATUS_LABELS[chapterStatus]) }),
              disabled: chapterId === null,
              onClick: () => {
                if (chapterId === null) return
                onStatusChange(chapterId, isDone ? 'draft' : 'done')
              }
            }}
          />
        </div>
      </div>
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
            data-placeholder-phase={quote.phase}
          />
        </div>
      </div>
      <div className="editor-foot">
        {/* 左侧保存状态（数据来自 useChapterDoc 的 status + dirty，只读展示）。 */}
        <SaveStatus state={saveState} />
        {/* 单篇正文有效字数 / 上限：读数与输入拦截同源（`docCharCount` 读块级缓存）。 */}
        <DocCharCount count={docCharCount(editor)} scope="chapter" />
      </div>
      <HoverCard
        anchor={hover.anchor}
        onClose={hover.close}
        onPointerEnter={hover.cancelHide}
        onPointerLeave={hover.onMouseLeave}
      />
    </>
  )
}

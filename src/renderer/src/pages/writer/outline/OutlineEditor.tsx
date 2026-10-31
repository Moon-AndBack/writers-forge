import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import {
  EMPTY_RICH_TEXT_CONTENT,
  RICH_TEXT_EDITOR_PROPS,
  RICH_TEXT_EXTENSIONS,
  toCssString
} from '../../../components/editor/richTextExtensions'
import { formatRelativeTime } from '@renderer/lib/relativeTime'
import DocMeta from '../../../components/editor/DocMeta'
import DocTitleField from '../../../components/editor/DocTitleField'
import DocCharCount from '../DocCharCount'
import { DocWordLimit, docCharCount } from '../docWordLimit'
import { SaveStatus, type ChapterSaveState } from '../chapters/SaveStatus'
import { getQuotePool, randomQuoteIndex } from '../quotes'
import { OutlineSearchHighlight } from './outlineSearch'
import type { OutlineEditorTarget } from './outlineTree'
import OutlineActivityActions from './OutlineActivityActions'
import OutlineCreateDialog from './OutlineCreateDialog'
import OutlineSearchView from './OutlineSearchView'
import OutlineTrashView from './OutlineTrashView'
import { TableContextMenu } from '../../../components/editor/TableContextMenu'
import { useOutlineDoc } from './useOutlineDoc'
import { useOutlineSearch } from './useOutlineSearch'
import { useOutlineTitle } from './useOutlineTitle'

/**
 * 大纲编辑器扩展集：**通用块级富文本底座**（`RICH_TEXT_EXTENSIONS`，与剧情场景正文共用，§9）
 * + 两枚大纲专属扩展：
 * - `OutlineSearchHighlight`：查找高亮 Decoration（仅当前条目；不涉及 entities / IPC）；
 * - `DocWordLimit`：单篇正文有效字数上限（20 万；输入时拦截），与章节编辑器共用同一扩展。
 *
 * ⚠️ 本数组必须为**模块级常量引用**（`useEditor` 按引用比对选项，理由见 `RICH_TEXT_EXTENSIONS`），
 * 故此处展开一次、不再内联到 `useEditor` 调用处。
 */
const EDITOR_BASE_EXTENSIONS = [...RICH_TEXT_EXTENSIONS, OutlineSearchHighlight, DocWordLimit]

/** 空态诗词提示轮换间隔（与章节视图同口径）。 */
const EMPTY_HINT_ROTATE_MS = 10000

/**
 * 正文是否「空」：doc 仅一个顶层段落，且该段**既无文本也无行内节点**（与章节视图同口径）。
 *
 * ⚠️ 必须同时判 `childCount === 0`：段落内可能只有**行内图片**（`image`），
 * 此时 `textContent` 为空串但块并非空——若只看文本会把「只插图」的正文误判为空态、
 * 叠加诗词占位（且与主进程 `isEmptyParagraphDoc` 的「有内容」口径相悖）。
 */
function isEmptyDoc(editor: Editor): boolean {
  const doc = editor.state.doc
  if (doc.childCount !== 1) return false
  const first = doc.child(0)
  return first.type.name === 'paragraph' && first.textContent.length === 0 && first.childCount === 0
}

export interface OutlineEditorProps {
  /**
   * 当前编辑目标（由页面层从 `OutlineSelection` 解析派生）；null = 未选中 /
   * 目标行已删除（渲染空态提示）。
   */
  target: OutlineEditorTarget | null
  /** 题名提交：条目 → 条目通道 `renameChapter`；卷 / 分组 → 共享卷通道 `renameVolume`。 */
  onCommitTitle: (target: OutlineEditorTarget, title: string) => void
  /** 新建正文卷（创建弹窗提交；`title` 可空 = 自动编号）。 */
  onCreateVolume: (title: string) => void
  /** 书籍 id（路由参数）；回收站视图据此按书拉取已删卷 / 条目。 */
  bookId?: string
  /** 回收站视图内还原 / 彻底删除 / 清空后回调（页面刷新大纲树）。 */
  onTrashChanged: () => void
  /** 回收站还原卷后回调（页面重取可见卷与卷纲载体行）。 */
  onRefreshVolumes: () => void
  /** 新建置顶独立条目（创建弹窗提交；`title` 可空 = 空名条目）。 */
  onCreateNonVolumeChapter: (title: string) => void
  /** 新建分组容器（创建弹窗提交；`title` 可空 = 默认名分组）。 */
  onCreateGroup: (title: string) => void
}

/**
 * 大纲条目中栏编辑器：Tiptap 正文（paragraph + heading / 列表 / 表格块）+ 防抖落库。
 *
 * - 正文真源 = 正文载体行（`outline_items.content_json`）：条目 = 条目行；正文卷 / 分组容器 =
 *   各自的卷级大纲行（`scope='volume'`，由 `EditorPane` 解析为 `target.contentId`；分组卷建卷
 *   即带卷纲行，故同样可编辑）；载体缺失（`contentId === null`）→ 只读占位；
 * - 标题栏按钮组（添加 / 保存 / 撤销 / 重做 / 搜索 / 回收站）经模块级 action 插槽注册；
 * - 编辑头与章节视图同款（前缀只读 + 可编辑题名）；题名提交经 `onCommitTitle` 落库；
 * - 回收站视图打开时替代编辑区，操作后经 `onTrashChanged` 通知页面刷新左栏大纲树；
 * - 搜索为**仅当前条目正文**的查找 / 替换（见 `useOutlineSearch`）；
 * - 不接入实体高亮等章节域专属能力。
 */
export default function OutlineEditor({
  target,
  onCommitTitle,
  onCreateVolume,
  bookId,
  onTrashChanged,
  onRefreshVolumes,
  onCreateNonVolumeChapter,
  onCreateGroup
}: OutlineEditorProps) {
  const { t, i18n } = useTranslation('outline')
  // 「最后编辑」文案复用 `chapters` ns 现有 key（`editor.lastEdited`）——避免语义重复的并列 key（§10 明确允许组件内多次 useTranslation 跨 ns 取用）。
  const { t: tChapters } = useTranslation('chapters')
  const contentId = target?.contentId ?? null
  // 有编辑目标且其正文载体存在时才可编辑；否则正文只读（不落库）。
  const canEdit = target !== null && contentId !== null

  // 编辑头题名：目标切换重置输入值；失焦 / Enter 提交、Escape 还原。
  const titleField = useOutlineTitle({
    targetKey: target ? `${target.kind}\u0000${target.id}` : null,
    initialTitle: target?.title ?? '',
    onCommitTitle: (title) => {
      if (target) onCommitTitle(target, title)
    }
  })

  const editor = useEditor({
    extensions: EDITOR_BASE_EXTENSIONS,
    content: EMPTY_RICH_TEXT_CONTENT,
    // 可编辑性走下方 setEditable effect（本处**必须**为字面量 `true`，见 W11 说明）。
    editable: true,
    autofocus: false,
    editorProps: RICH_TEXT_EDITOR_PROPS
  })

  // 可编辑性同步：切换条目 / 载体缺失时更新（缺失载体 → 只读）。
  useEffect(() => {
    if (!editor) return
    editor.setEditable(canEdit)
  }, [editor, canEdit])

  const { status, dirty, lastSavedAt, onUpdate, flush, swapPhase } = useOutlineDoc({
    contentId,
    editor
  })

  // 绑定 update：引用稳定，effect 保证只挂一次、卸载时解除。
  useEffect(() => {
    if (!editor) return undefined
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [editor, onUpdate])

  // 卸载（切走大纲视图）前 flush 挂起保存。
  useEffect(() => {
    return () => {
      void flush()
    }
  }, [flush])

  // 空态判定：监听 transaction（覆盖输入 / setContent 切条目等一切状态变更）。
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

  // 空态诗词轮换：与章节视图同款——进入空态 / 切换条目时随机一条；空态停留期间每 ~10s 换一条。
  const [rotateTick, setRotateTick] = useState(0)
  useEffect(() => {
    if (!isEmpty) return undefined
    const timer = window.setInterval(() => setRotateTick((tick) => tick + 1), EMPTY_HINT_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [isEmpty])

  // 依赖含 `i18n.language`：切换界面语言后按新语言池重新取一条。
  const quote = useMemo(() => {
    void isEmpty
    void contentId
    const pool = getQuotePool(i18n.language)
    return { index: randomQuoteIndex(-1, pool), pool, phase: rotateTick % 2 }
  }, [isEmpty, contentId, rotateTick, i18n.language])

  const activeQuote = quote.pool[quote.index] ?? quote.pool[0]
  const placeholder = `${activeQuote.text} —— ${activeQuote.source}`
  const docBodyStyle = {
    '--editor-placeholder': toCssString(placeholder)
  } as CSSProperties

  // 编辑头「最后编辑」相对时间：优先用本次会话最近落盘时间，回退载体行 `updatedAt`
  // （条目 = 条目行；卷 / 分组 = 卷纲行）。目标为空时回退 null（不展示）。
  const lastEditedAt = lastSavedAt ?? target?.updatedAt ?? null
  const lastEditedLabel = formatRelativeTime(lastEditedAt)

  // 保存态归并（与章节视图同一展示口径）。
  const saveState: ChapterSaveState =
    status === 'saving'
      ? 'saving'
      : status === 'error'
        ? 'error'
        : status === 'loading'
          ? 'loading'
          : dirty
            ? 'dirty'
            : 'saved'

  /* ---------- 撤销 / 重做可用态（随 editor transaction 同步） ---------- */
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

  const handleUndo = useCallback((): void => {
    editor?.chain().focus().undo().run()
  }, [editor])
  const handleRedo = useCallback((): void => {
    editor?.chain().focus().redo().run()
  }, [editor])

  /* ---------- 保存（立即落盘挂起改动） ---------- */
  const handleSave = useCallback((): void => {
    void flush()
  }, [flush])
  // 与章节口径一致：无选中条目 / 无载体 / 加载中 / 保存中 / 无改动时禁用。
  const saveDisabled = !(canEdit && status !== 'loading' && status !== 'saving' && dirty)

  /* ---------- 搜索浮窗（仅当前条目正文）与「新建」创建弹窗 ---------- */
  const [searchOpen, setSearchOpen] = useState(false)
  const closeSearch = useCallback((): void => setSearchOpen(false), [])
  const toggleSearch = useCallback((): void => setSearchOpen((prev) => !prev), [])
  // 「新建」创建弹窗（标题栏「添加」按钮）：单弹窗三形态（条目 / 分组 / 正文卷）。
  const [createOpen, setCreateOpen] = useState(false)

  // 回收站视图开关（标题栏「回收站」按钮）：切换时关闭搜索浮窗（两个视图互斥展示）。
  const [trashOpen, setTrashOpen] = useState(false)
  const toggleTrash = useCallback((): void => {
    setTrashOpen((prev) => !prev)
    setSearchOpen(false)
  }, [])

  const search = useOutlineSearch({ editor, open: searchOpen })

  return (
    <>
      {/* 标题栏按钮组（大纲模块专属）：编辑器实例在此持有，故直接装配回调。 */}
      <OutlineActivityActions
        onSave={handleSave}
        saveDisabled={saveDisabled}
        dirty={dirty}
        saving={status === 'saving'}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
        onToggleSearch={toggleSearch}
        searchOpen={searchOpen}
        onAdd={() => setCreateOpen(true)}
        onToggleTrash={toggleTrash}
        trashOpen={trashOpen}
        editor={editor}
        bookId={bookId}
      />
      {/* 「新建」创建弹窗：标题栏「添加」按钮触发，三形态（条目 / 分组 / 正文卷）+ 名称输入。 */}
      {createOpen && (
        <OutlineCreateDialog
          onClose={() => setCreateOpen(false)}
          onCreateVolume={onCreateVolume}
          onCreateEntry={onCreateNonVolumeChapter}
          onCreateGroup={onCreateGroup}
        />
      )}
      {/* 查找与替换浮窗：仅当前条目正文，浮于正文之上（.ep-search 绝对定位于本视图内）。
          回收站打开时不渲染（两视图互斥）。 */}
      {!trashOpen && (
        <OutlineSearchView controller={search} open={searchOpen} onClose={closeSearch} />
      )}

      {trashOpen ? (
        /* 回收站视图：替代编辑区（编辑区隐藏 / 让位）；操作后经 onChanged 刷新左栏大纲树，
           还原卷时另需重取可见卷与卷纲载体（onRefreshVolumes）。 */
        <OutlineTrashView
          bookId={bookId ?? ''}
          onChanged={() => {
            onTrashChanged()
            onRefreshVolumes()
          }}
        />
      ) : (
        <>
          {/* 编辑头（与章节视图同款）：前缀只读 + 可编辑题名；置于滚动区之外固定显示。
              分组目标（无载体）仅展示题名行，正文区仍走空态占位。 */}
          {target !== null && (
            <div className="editor-head">
              <div className="editor-inner">
                <DocTitleField
                  rowKey={`${target.kind}\u0000${target.id}`}
                  prefix={target.prefix}
                  showPrefix={target.prefix !== ''}
                  value={titleField.value}
                  placeholder={
                    target.kind === 'volume'
                      ? t('unnamedVolume')
                      : target.kind === 'group'
                        ? t('unnamedGroup')
                        : t('unnamedChapter')
                  }
                  disabled={false}
                  onChange={titleField.onChange}
                  onCommit={titleField.commit}
                  onKeyDown={titleField.onKeyDown}
                  titleAria={t('titleAria')}
                />
                {/* 「最后编辑」相对时间：优先本次会话落盘时间（lastSavedAt），回退载体行 `updatedAt`
                    （条目 / 卷纲行均在正文保存时刷新）。大纲无草稿 / 定稿状态，故不渲染状态按钮。 */}
                <DocMeta
                  lastEdited={
                    lastEditedLabel !== ''
                      ? tChapters('editor.lastEdited', { time: lastEditedLabel })
                      : ''
                  }
                />
              </div>
            </div>
          )}

          {/* data-swap-phase 交替两档别名关键帧，令「切换条目 / 载体」后的正文淡入重播
              （相位来自 useOutlineDoc → useContentSwap；null = 首次载入，不挂属性、不淡入）。
              与章节视图共用同一套 CSS（见 writer-editor-doc.css）。 */}
          <div className="editor-scroll" data-swap-phase={swapPhase ?? undefined}>
            <div className="editor-inner">
              {target === null ? (
                /* 未选中目标：明确空态，指引从左侧大纲树选择。 */
                <div className="placeholder-view" role="note">
                  <div className="placeholder-title">{t('emptySelect')}</div>
                  <div className="placeholder-desc">{t('emptySelectHint')}</div>
                </div>
              ) : (
                /* 正文区：空态（含未选条目后的空文档 / 载体缺失兜底）时追加 .is-empty，
                    诗词文案经 CSS 变量传入，由首段 p::before 渲染——与章节视图同款占位。
                    载体缺失（卷纲行缺失）时 canEdit=false → 编辑器只读，不落库。 */
                <>
                  <EditorContent
                    editor={editor}
                    className={`doc-body${isEmpty ? ' is-empty' : ''}`}
                    style={docBodyStyle}
                    data-placeholder-phase={quote.phase}
                  />
                  {/* 表格增强（仅大纲）：表内右键弹上下文菜单（菜单项定义见 tableMenu）。 */}
                  {canEdit && <TableContextMenu editor={editor} />}
                </>
              )}
            </div>
          </div>

          {canEdit && (
            <div className="editor-foot">
              <SaveStatus state={saveState} />
              {/* 单篇正文有效字数 / 上限：读数与输入拦截同源（`docCharCount` 读块级缓存）。 */}
              <DocCharCount count={docCharCount(editor)} scope="entry" />
            </div>
          )}
        </>
      )}
    </>
  )
}

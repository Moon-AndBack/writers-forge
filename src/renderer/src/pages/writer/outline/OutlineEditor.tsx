import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import {
  EMPTY_RICH_TEXT_CONTENT,
  RICH_TEXT_EDITOR_PROPS,
  RICH_TEXT_EXTENSIONS
} from '../../../components/editor/richTextExtensions'
import { formatRelativeTime } from '@renderer/lib/relativeTime'
import { EmptyState } from '../../../components/EmptyState'
import DocMeta from '../../../components/editor/DocMeta'
import DocTitleField from '../../../components/editor/DocTitleField'
import DocCharCount from '../DocCharCount'
import { DocWordLimit, docCharCount } from '../docWordLimit'
import { SaveStatus, type ChapterSaveState } from '../chapters/SaveStatus'
import { OutlineSearchHighlight } from './outlineSearch'
import type { OutlineEditorTarget } from './outlineTree'
import OutlineActivityActions from './OutlineActivityActions'
import OutlineCreateDialog from './OutlineCreateDialog'
import OutlineSearchView from './OutlineSearchView'
import OutlineTrashView from './OutlineTrashView'
import { TableContextMenu } from '../../../components/editor/TableContextMenu'
import { SelectionContextMenu } from '../SelectionContextMenu'
import { ForeshadowMark } from '../../../components/editor/foreshadowMarks'
import { MarkHoverTip } from '../../../components/editor/MarkHoverTip'
import { useMarkHover } from '../../../components/editor/useMarkHover'
import { EntityHighlight } from '../entities/entityHighlight'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import {
  useForeshadowMarks,
  type ForeshadowLabelResolver
} from '../../../components/editor/useForeshadowMarks'
import { useDocPlaceholder } from '../useDocPlaceholder'
import { useOutlineDoc } from './useOutlineDoc'
import { useSyncFlushHandler } from '../../../shell/beforeCloseFlush'
import { useOutlineSearch } from './useOutlineSearch'
import { useOutlineTitle } from './useOutlineTitle'

/**
 * 大纲编辑器扩展集：**通用块级富文本底座**（`RICH_TEXT_EXTENSIONS`，与剧情场景正文共用，§9）
 * + 三枚大纲专属扩展：
 * - `OutlineSearchHighlight`：查找高亮 Decoration（仅当前条目；不涉及 entities / IPC）；
 * - `DocWordLimit`：单篇正文有效字数上限（20 万；输入时拦截），与章节编辑器共用同一扩展；
 * - `ForeshadowMark`：锚定当前**条目行**的伏笔正文标记（数据经 meta 事务写入）。
 *   ⚠️ 只加在本数组，**不得**塞进共享的 `RICH_TEXT_EXTENSIONS`（否则污染剧情场景编辑器）。
 *
 * ⚠️ 本数组必须为**模块级常量引用**（`useEditor` 按引用比对选项，理由见 `RICH_TEXT_EXTENSIONS`），
 * 故此处展开一次、不再内联到 `useEditor` 调用处。
 */
const EDITOR_BASE_EXTENSIONS = [
  ...RICH_TEXT_EXTENSIONS,
  OutlineSearchHighlight,
  DocWordLimit,
  ForeshadowMark
]

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
  /** 正文右键「添加伏笔」弹窗的关联展示串（卷 / 分组 / 所属卷 + 条目；空串 = 未关联）。 */
  foreshadowContextLabel?: string
  /** 伏笔正文标记的位置名解析（页面层注入；标记层不依赖具体数据源）。 */
  resolveForeshadowTargetLabel?: ForeshadowLabelResolver
  /** 立即落盘入口（写入本视图 `flush`，卸载置空）：页面层关闭前统一 flush 用。 */
  flushRef?: RefObject<(() => Promise<void>) | null>
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
 * - 接入实体高亮（`EntityHighlight`，按书匹配）与实体悬停卡，口径与章节正文一致。
 */
export default function OutlineEditor({
  target,
  onCommitTitle,
  onCreateVolume,
  bookId,
  onTrashChanged,
  onRefreshVolumes,
  onCreateNonVolumeChapter,
  onCreateGroup,
  foreshadowContextLabel = '',
  resolveForeshadowTargetLabel,
  flushRef
}: OutlineEditorProps) {
  const { t, i18n } = useTranslation('outline')
  // 「最后编辑」文案复用 `chapters` ns 现有 key（`editor.lastEdited`）——避免语义重复的并列 key（§10 明确允许组件内多次 useTranslation 跨 ns 取用）。
  const { t: tChapters } = useTranslation('chapters')
  const contentId = target?.contentId ?? null
  const safeBookId = bookId ?? ''
  // 有编辑目标且其正文载体存在时才可编辑；否则正文只读（不落库）。
  const canEdit = target !== null && contentId !== null
  // 伏笔锚点的大纲载体：**仅条目行**（`outline_items.id`，`scope='entry'`）可作为 `outlineItemId`；
  // 卷 / 分组目标编辑的是卷纲行（`scope='volume'`），不属条目锚点 → null（锚点降级为未锚定）。
  const outlineItemId = target?.kind === 'entry' ? contentId : null

  // 编辑头题名：目标切换重置输入值；失焦 / Enter 提交、Escape 还原。
  const titleField = useOutlineTitle({
    targetKey: target ? `${target.kind}\u0000${target.id}` : null,
    initialTitle: target?.title ?? '',
    onCommitTitle: (title) => {
      if (target) onCommitTitle(target, title)
    }
  })

  // ⚠️ EntityHighlight 的 `getBookId` 闭包**必须**捕获当前 `safeBookId`；数组经
  // `useMemo` 恒等（仅切书重建）。正文经 `useOutlineDoc` 的 `setContent` 载入
  // （产生 docChanged 事务），故不设 `matchOnCreate`（避免重复整篇匹配）。
  const editorExtensions = useMemo(
    () => [...EDITOR_BASE_EXTENSIONS, EntityHighlight.configure({ getBookId: () => safeBookId })],
    [safeBookId]
  )

  const editor = useEditor({
    extensions: editorExtensions,
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

  // 伏笔正文标记：仅条目行有锚点（卷 / 分组目标传 null → 清空标记）；埋设点与回收点一并加载。
  useForeshadowMarks(editor, null, outlineItemId, resolveForeshadowTargetLabel)
  // 伏笔标记悬停浮层：事件委托挂在 editor.view.dom（不改 RICH_TEXT_EDITOR_PROPS），切条目即收起。
  const markTip = useMarkHover(editor, contentId)
  // 实体悬停卡：事件委托挂在 `.editor-scroll`（与伏笔标记的 DOM 监听互不覆盖）。
  const entityHover = useEntityHover()

  const { status, dirty, lastSavedAt, onUpdate, flush, swapPhase } = useOutlineDoc({
    contentId,
    editor
  })
  useSyncFlushHandler(flushRef, flush)

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

  // 空态判定 + 诗词占位：与章节编辑器共用（逻辑见 useDocPlaceholder）。
  const { isEmpty, docBodyStyle, phase } = useDocPlaceholder(
    editor,
    isEmptyDoc,
    contentId,
    i18n.language
  )

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

  // 右键「搜索选中文字」：预填查询词并打开查找浮窗（大纲搜索只覆盖当前条目正文，无范围概念）。
  const openSearchWith = useCallback(
    (text: string): void => {
      search.setQuery(text)
      setSearchOpen(true)
    },
    [search]
  )

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
          <div
            className="editor-scroll"
            data-swap-phase={swapPhase ?? undefined}
            onMouseOver={entityHover.onMouseOver}
            onMouseLeave={entityHover.onMouseLeave}
          >
            <div className="editor-inner">
              {target === null ? (
                /* 未选中目标：明确空态，指引从左侧大纲树选择。 */
                <EmptyState title={t('emptySelect')} description={t('emptySelectHint')} />
              ) : (
                /* 正文区：空态（含未选条目后的空文档 / 载体缺失兜底）时追加 .is-empty，
                    诗词文案经 CSS 变量传入，由首段 p::before 渲染——与章节视图同款占位。
                    载体缺失（卷纲行缺失）时 canEdit=false → 编辑器只读，不落库。 */
                <>
                  <EditorContent
                    editor={editor}
                    className={`doc-body${isEmpty ? ' is-empty' : ''}`}
                    style={docBodyStyle}
                    data-placeholder-phase={phase}
                  />
                  {/* 表格增强（仅大纲）：表内右键弹上下文菜单（菜单项定义见 tableMenu）。 */}
                  {canEdit && (
                    <>
                      <TableContextMenu editor={editor} />
                      {/* 正文右键「选区菜单」：表格内让给表格菜单；卷 / 分组目标无条目锚点 → 未锚定。
                          不传 `chapterId` → 不出现「回收伏笔」（回收只在正文发生，大纲是规划层）；
                          只传 `onSearchText`（大纲无 `CleanWordMark`，不提供「加入违禁词库」，避免加了看不到标记）。 */}
                      <SelectionContextMenu
                        editor={editor}
                        bookId={bookId ?? ''}
                        outlineItemId={outlineItemId}
                        contextLabel={foreshadowContextLabel}
                        resolveForeshadowTargetLabel={resolveForeshadowTargetLabel}
                        shouldOpenExtra={(instance) => !instance.isActive('table')}
                        onSearchText={openSearchWith}
                      />
                    </>
                  )}
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
      {/* 伏笔标记悬停提示（自绘浮层，替代原生 title；pointer-events: none 不挡鼠标）。 */}
      <MarkHoverTip tip={markTip} />
      {/* 实体悬停卡：高亮 span 经 `.editor-scroll` 事件委托定位（portal 定位，不受滚动容器裁剪）。 */}
      <HoverCard
        anchor={entityHover.anchor}
        onClose={entityHover.close}
        onPointerEnter={entityHover.cancelHide}
        onPointerLeave={entityHover.onMouseLeave}
      />
    </>
  )
}

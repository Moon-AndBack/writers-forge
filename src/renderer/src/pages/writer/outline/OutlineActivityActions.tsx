import { useMemo } from 'react'
import type { Editor } from '@tiptap/core'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { useSetActivityActions } from '../../../shell/activityActions'
import {
  EditorActionSep,
  EditorHistoryGroup,
  EditorSearchButton,
  EditorTrashButton
} from '../../../components/editor/EditorActionGroup'
import { EditorFormatGroup } from '../../../components/editor/EditorFormatGroup'
import { EditorClearFormat } from '../../../components/editor/EditorClearFormat'
import { EditorHeadingGroup } from '../../../components/editor/EditorHeadingGroup'
import { EditorBlockGroup } from '../../../components/editor/EditorBlockGroup'
import { EditorInsertGroup } from '../../../components/editor/EditorInsertGroup'
import { EditorLinkButton } from '../../../components/editor/EditorLinkButton'
import { EditorImageButton } from '../../../components/editor/EditorImageButton'
import { PlusIcon } from '../icons'

export interface OutlineActivityActionsProps {
  /** 立即落盘当前大纲条目正文。 */
  onSave: () => void
  /** 保存按钮禁用（无选中条目 / 无文档 / 加载中 / 保存中 / 无改动）。 */
  saveDisabled: boolean
  /** 有未保存改动（用于 tooltip 文案）。 */
  dirty: boolean
  /** 正在保存（按钮呈禁用 + 进行中文案）。 */
  saving: boolean
  /** 撤销正文。 */
  onUndo: () => void
  /** 重做正文。 */
  onRedo: () => void
  /** 是否可撤销。 */
  canUndo: boolean
  /** 是否可重做。 */
  canRedo: boolean
  /** 切换搜索浮窗。 */
  onToggleSearch: () => void
  /** 搜索浮窗是否打开（按钮呈激活态）。 */
  searchOpen: boolean
  /** 打开「添加」聚合弹窗（新建卷 / 条目 / 分组；弹窗本体挂载在大纲编辑器内）。 */
  onAdd: () => void
  /** 切换回收站视图。 */
  onToggleTrash: () => void
  /** 回收站视图是否打开（按钮呈激活态）。 */
  trashOpen: boolean
  /** Tiptap 编辑器实例（驱动富文本格式按钮组）；编辑器未就绪时为 null（整组禁用）。 */
  editor: Editor | null
  /** 书籍 id（路由参数）：图片插入按书隔离入库所需；空 / undefined → 插图入口禁用。 */
  bookId?: string
}

/**
 * 大纲页标题栏操作按钮组：经模块级 action 插槽（useSetActivityActions）注册，
 * 由外壳标题栏在「返回书架」图标右侧渲染（`.tb-module-actions`）。
 * 顺序（左 → 右，R10d 按用户指定顺序重排）：
 * ｜ 添加 ｜ 保存 · 撤销 · 重做 ｜ 加粗 · 斜体 · 下划线 · 删除线 · 行内代码 · 字色 · 高亮
 * ｜ 标题 ▾ · 段落 ▾ · 表格 ▾ · 链接 ▾ · 图片 ▾ ｜ 清除格式 ｜ 搜索 ｜ 回收站，
 * 横排以竖分隔线（`.tb-sep`）分组；组首另有一条分隔线，与左侧「返回书架」图标分隔。
 * 仅当活动模块为「大纲」时由标题栏渲染（本组件挂载在大纲视图内，模块切换时随视图隐藏）。
 *
 * 保存 / 撤销 / 重做 / 搜索 / 回收站区块与章节模块**逐字同构**，抽为共享组件
 * `components/editor/EditorActionGroup`（R10d 已拆为 `EditorHistoryGroup` /
 * `EditorSearchButton` / `EditorTrashButton` 三个小组，本页按用户顺序**分散挂载**，
 * 章节页仍整体引用三者组合）；富文本格式区块抽为共享组件
 * `components/editor/EditorFormatGroup`（行内开关 + 字色 / 高亮下拉；章节侧将来复用），
 * 「清除格式」另由 `EditorClearFormat` 独立渲染（自格式组移出，R10b，自带组首分隔线）；
 * 块级 / 表格 / 链接三组抽为 `EditorHeadingGroup`（正文 + H1–H6）/ `EditorBlockGroup`
 * （列表 / 引用 / 代码块 / 分隔线）/ `EditorInsertGroup`（表格插入，经 FormatPopover
 * portal 逃生标题栏 overflow，仅大纲页挂载）/ `EditorLinkButton`（链接独立顶层，
 * 与表格 · 图片同级）；此处仅保留「添加」为首个按钮，
 * 并负责挂载各区块之间的竖分隔线（行内组 / 标题组前各一条）。
 */
export default function OutlineActivityActions({
  onSave,
  saveDisabled,
  dirty,
  saving,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onToggleSearch,
  searchOpen,
  onAdd,
  onToggleTrash,
  trashOpen,
  editor,
  bookId
}: OutlineActivityActionsProps) {
  const { t: tOutline } = useTranslation('outline')
  // useEditor 的 deps 为空、实例恒定；保留该依赖以覆盖将来 immediatelyRender:false 的场景。
  const node = useMemo(
    () => (
      <>
        <EditorActionSep />
        <IconButton
          className="tb-action"
          label={tOutline('add')}
          tooltip={tOutline('add')}
          tooltipPlacement="bottom"
          onClick={onAdd}
        >
          <PlusIcon />
        </IconButton>
        <EditorHistoryGroup
          onSave={onSave}
          saveDisabled={saveDisabled}
          dirty={dirty}
          saving={saving}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <EditorActionSep />
        <EditorFormatGroup editor={editor} />
        <EditorActionSep />
        <EditorHeadingGroup editor={editor} />
        <EditorBlockGroup editor={editor} />
        <EditorInsertGroup editor={editor} />
        <EditorLinkButton editor={editor} />
        <EditorImageButton editor={editor} bookId={bookId} />
        <EditorClearFormat editor={editor} />
        <EditorSearchButton onToggleSearch={onToggleSearch} searchOpen={searchOpen} />
        <EditorTrashButton onToggleTrash={onToggleTrash} trashOpen={trashOpen} />
      </>
    ),
    [
      tOutline,
      onSave,
      saveDisabled,
      dirty,
      saving,
      onUndo,
      onRedo,
      canUndo,
      canRedo,
      onToggleSearch,
      searchOpen,
      onAdd,
      onToggleTrash,
      trashOpen,
      editor,
      bookId
    ]
  )

  // 注册到模块级 action 插槽（'outline'）：外壳标题栏读取并在返回图标右侧渲染。
  useSetActivityActions('outline', node)

  return null
}

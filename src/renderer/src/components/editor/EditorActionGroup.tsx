import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../ui'
import { RedoIcon, SaveIcon, SearchIcon, TrashIcon, UndoIcon } from '../icons'

/**
 * 标题栏操作按钮（编辑器共享块）：保存 · 撤销 · 重做 ｜ 搜索 ｜ 回收站。
 *
 * 由「章节」「大纲」「剧情」三个模块各自的顶部操作区引用（章节 / 大纲两处此前**逐字同构**，
 * 故抽为共享组件）。R10d 起为满足用户指定的标题栏顺序，把原先**一整段**的 `EditorActionGroup`
 * 拆为若干**各自带组首竖分隔线**（`EditorActionSep`）的独立小组：
 *
 * - `EditorHistoryGroup`：保存 · 撤销 · 重做（大纲页第 ④ 段）
 * - `EditorUndoRedoGroup`：撤销 · 重做（**不自带**组首线；被历史组内嵌，另供剧情页
 *   「聚焦编辑」工具栏单独复用——该处无保存按钮，保存仍在右栏）
 * - `EditorSearchButton`：搜索（第 ⑫ 段）
 * - `EditorTrashButton`：回收站（第 ⑭ 段）
 *
 * **不复制组件**（§9）：`EditorActionGroup` 保留为上述三者的**组合**
 * （历史组 + 搜索 + 回收站），章节页仍整体引用它——渲染树与拆分前**逐字一致**
 * （顺序、分隔线位置、props 传递均不变）；大纲页在 `OutlineActivityActions` 内
 * 按用户顺序分别挂载三个小组。
 *
 * 全部按钮沿用标题栏 ghost 图标按钮（`.tb-action`）与竖分隔线（`.tb-sep`），
 * 文案统一取 `common` ns；搜索 / 回收站按钮以 `is-active` 呈激活态，
 * 搜索按钮带 `data-search-toggle` 供浮窗定位锚点使用。
 *
 * 注：本组只渲染按钮块，注册到模块级 action 插槽的时机由调用方把握
 * （调用方以 `useMemo` 缓存包含本组件的节点，避免注册循环）。
 */

/** 分组竖分隔线：横排按钮组内的竖向 1px 线（`.tb-sep`）。 */
export function EditorActionSep(): ReactNode {
  return <span className="tb-sep" aria-hidden="true" />
}

export interface EditorUndoRedoGroupProps {
  /** 撤销正文。 */
  onUndo: () => void
  /** 重做正文。 */
  onRedo: () => void
  /** 是否可撤销。 */
  canUndo: boolean
  /** 是否可重做。 */
  canRedo: boolean
}

/**
 * 撤销 · 重做按钮组（**不自带**组首竖分隔线）：
 * 历史组内嵌时由 `EditorHistoryGroup` 提供组首线；剧情页「聚焦编辑」工具栏单独复用
 * （该处无保存按钮，保存仍在右栏），组首线由调用方按需另挂 `EditorActionSep`。
 */
export function EditorUndoRedoGroup({
  onUndo,
  onRedo,
  canUndo,
  canRedo
}: EditorUndoRedoGroupProps): ReactNode {
  const { t: tCommon } = useTranslation('common')

  return (
    <>
      <IconButton
        className="tb-action"
        label={tCommon('undo')}
        tooltipPlacement="bottom"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <UndoIcon />
      </IconButton>
      <IconButton
        className="tb-action"
        label={tCommon('redo')}
        tooltipPlacement="bottom"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <RedoIcon />
      </IconButton>
    </>
  )
}

export interface EditorHistoryGroupProps extends EditorUndoRedoGroupProps {
  /** 立即落盘当前正文。 */
  onSave: () => void
  /** 保存按钮禁用（无未保存改动 / 无选中 / 加载中 / 保存中）。 */
  saveDisabled: boolean
  /** 有未保存改动（用于 tooltip 文案）。 */
  dirty: boolean
  /** 正在保存（按钮呈禁用 + 进行中文案）。 */
  saving: boolean
}

/** 历史按钮组：保存 · 撤销 · 重做（组首自带竖分隔线）。 */
export function EditorHistoryGroup({
  onSave,
  saveDisabled,
  dirty,
  saving,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}: EditorHistoryGroupProps): ReactNode {
  const { t: tCommon } = useTranslation('common')

  return (
    <>
      <EditorActionSep />
      <IconButton
        className="tb-action"
        label={tCommon('save')}
        tooltip={saving ? tCommon('saving') : dirty ? tCommon('saveDirty') : tCommon('save')}
        tooltipPlacement="bottom"
        disabled={saveDisabled}
        onClick={onSave}
      >
        <SaveIcon />
      </IconButton>
      <EditorUndoRedoGroup onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo} />
    </>
  )
}

export interface EditorSearchButtonProps {
  /** 切换搜索浮窗。 */
  onToggleSearch: () => void
  /** 搜索浮窗是否打开（按钮呈激活态）。 */
  searchOpen: boolean
}

/** 搜索按钮（组首自带竖分隔线；`data-search-toggle` 供搜索浮窗定位锚点使用）。 */
export function EditorSearchButton({
  onToggleSearch,
  searchOpen
}: EditorSearchButtonProps): ReactNode {
  const { t: tCommon } = useTranslation('common')

  return (
    <>
      <EditorActionSep />
      <IconButton
        className={`tb-action${searchOpen ? ' is-active' : ''}`}
        label={tCommon('searchButton')}
        tooltipPlacement="bottom"
        aria-pressed={searchOpen}
        data-search-toggle=""
        onClick={onToggleSearch}
      >
        <SearchIcon />
      </IconButton>
    </>
  )
}

export interface EditorTrashButtonProps {
  /** 切换回收站视图。 */
  onToggleTrash: () => void
  /** 回收站视图是否打开（按钮呈激活态）。 */
  trashOpen: boolean
}

/** 回收站按钮（组首自带竖分隔线）。 */
export function EditorTrashButton({ onToggleTrash, trashOpen }: EditorTrashButtonProps): ReactNode {
  const { t: tCommon } = useTranslation('common')

  return (
    <>
      <EditorActionSep />
      <IconButton
        className={`tb-action${trashOpen ? ' is-active' : ''}`}
        label={tCommon('trashButton')}
        tooltipPlacement="bottom"
        aria-pressed={trashOpen}
        onClick={onToggleTrash}
      >
        <TrashIcon />
      </IconButton>
    </>
  )
}

/** `EditorActionGroup` 全量 props = 三个小组 props 的并集。 */
export type EditorActionGroupProps = EditorHistoryGroupProps &
  EditorSearchButtonProps &
  EditorTrashButtonProps

/**
 * 操作按钮组（章节页整体引用）：历史（保存 · 撤销 · 重做）+ 搜索 + 回收站，
 * 即上述三个小组的**组合**——渲染结果与拆分前逐字一致（分隔线含在各小组组首）。
 */
export function EditorActionGroup({
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
  onToggleTrash,
  trashOpen
}: EditorActionGroupProps): ReactNode {
  return (
    <>
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
      <EditorSearchButton onToggleSearch={onToggleSearch} searchOpen={searchOpen} />
      <EditorTrashButton onToggleTrash={onToggleTrash} trashOpen={trashOpen} />
    </>
  )
}

export default EditorActionGroup

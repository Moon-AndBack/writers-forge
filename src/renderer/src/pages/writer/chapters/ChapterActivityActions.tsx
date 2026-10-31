import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionGroup, EditorActionSep } from '../../../components/editor/EditorActionGroup'
import {
  CleanWordsDialog,
  setCleanWordsDialogOpen,
  useCleanWordsDialogOpen
} from '../../../components/dialogs/CleanWordsDialog'
import { PlusIcon } from '../icons'

/** 违禁词（盾牌 + 感叹号）：标题栏「违禁词库」。描边口径与共享操作图标一致。 */
function CleanWordsIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  )
}

export interface ChapterActivityActionsProps {
  /** 立即落盘当前章节正文。 */
  onSave: () => void
  /** 保存按钮禁用（无未保存改动 / 无章节 / 加载中 / 保存中）。 */
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
  /** 打开「新建卷」弹窗（弹窗本体挂载在章节视图内）。 */
  onNewVolume: () => void
  /** 切换回收站视图。 */
  onToggleTrash: () => void
  /** 回收站视图是否打开（按钮呈激活态）。 */
  trashOpen: boolean
}

/**
 * 章节页标题栏操作按钮组：经模块级 action 插槽（useSetActivityActions）注册，
 * 由外壳标题栏在「返回书架」图标右侧渲染（`.tb-module-actions`）。
 * 顺序（左 → 右）：｜ 新建卷 ｜ 保存 · 撤销 · 重做 ｜ 搜索 ｜ 回收站 ｜ 违禁词库，
 * 横排以竖分隔线（`.tb-sep`）分组；组首另有一条分隔线，与左侧「返回书架」
 * 图标分隔。
 * 仅当活动模块为「章节」时由标题栏渲染（本组件挂载在章节视图内，模块切换时随视图隐藏）。
 * 「新建卷」点击后打开 NewVolumeDialog（弹窗挂载在 ChaptersView，正文卷 / 自定义卷二选一）。
 * 保存 / 撤销 / 重做 / 搜索 / 回收站区块与大纲模块**逐字同构**，抽为共享组件
 * `components/editor/EditorActionGroup`；此处仅保留「新建卷」为首个按钮。
 *
 * 「违禁词库」（末位，回收站右侧）：开关存于 `CleanWordsDialog` 的模块级订阅，
 * 状态栏「N 处违禁词」胶囊与本按钮共用同一开关；弹窗本体在此挂载（本组件虽
 * `return` 弹窗节点而非 null，但仍随章节视图常驻，Modal 内部再 portal 到 body，
 * 不依赖标题栏 DOM 容器）。
 */
export default function ChapterActivityActions({
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
  onNewVolume,
  onToggleTrash,
  trashOpen
}: ChapterActivityActionsProps) {
  const { t } = useTranslation('chapters')
  const cleanWordsOpen = useCleanWordsDialogOpen()
  const node = useMemo(
    () => (
      <>
        <EditorActionSep />
        <IconButton
          className="tb-action"
          label={t('newVolume')}
          tooltip={t('newVolumeTooltip')}
          tooltipPlacement="bottom"
          onClick={onNewVolume}
        >
          <PlusIcon />
        </IconButton>
        <EditorActionGroup
          onSave={onSave}
          saveDisabled={saveDisabled}
          dirty={dirty}
          saving={saving}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onToggleSearch={onToggleSearch}
          searchOpen={searchOpen}
          onToggleTrash={onToggleTrash}
          trashOpen={trashOpen}
        />
        <EditorActionSep />
        <IconButton
          className={`tb-action${cleanWordsOpen ? ' is-active' : ''}`}
          label={t('cleanWords.button')}
          tooltip={t('cleanWords.buttonTooltip')}
          tooltipPlacement="bottom"
          aria-pressed={cleanWordsOpen}
          onClick={() => setCleanWordsDialogOpen(!cleanWordsOpen)}
        >
          <CleanWordsIcon />
        </IconButton>
      </>
    ),
    [
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
      onNewVolume,
      onToggleTrash,
      trashOpen,
      cleanWordsOpen,
      t
    ]
  )

  // 注册到模块级 action 插槽（'chapters'）：外壳标题栏读取并在返回图标右侧渲染。
  useSetActivityActions('chapters', node)

  // 弹窗挂在本组件内（Modal 经 portal 挂 body）：状态栏胶囊也能通过模块级开关打开它。
  return <CleanWordsDialog open={cleanWordsOpen} onClose={() => setCleanWordsDialogOpen(false)} />
}

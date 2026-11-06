/**
 * 伏笔模块标题栏动作：注册「新建伏笔」加号（经模块级 action 插槽，
 * 由外壳标题栏在活动模块为 `foreshadow` 时渲染）。
 *
 * 主创建流程仍是正文右键「添加伏笔」（带锚点快照）；此处入口用于手动新建
 * **未锚定**伏笔（复用 `ForeshadowCreateDialog`，锚点传 `{ kind: 'none' }`），
 * 之后可在正文 / 大纲右键「关联伏笔」补上正文埋点 / 大纲埋点。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionSep, EditorTrashButton } from '../../../components/editor/EditorActionGroup'
import { PlusIcon } from '../icons'

export interface ForeshadowActivityActionsProps {
  /** 打开「新建伏笔」弹窗（弹窗本体挂载在中栏视图内）。 */
  onCreate: () => void
  /** 切换中栏回收站视图。 */
  onToggleTrash: () => void
  /** 回收站视图是否打开（按钮呈激活态）。 */
  trashOpen: boolean
}

export default function ForeshadowActivityActions({
  onCreate,
  onToggleTrash,
  trashOpen
}: ForeshadowActivityActionsProps) {
  const { t } = useTranslation('foreshadow')

  const node = useMemo(
    () => (
      <>
        <EditorActionSep />
        <IconButton
          className="tb-action"
          label={t('dialog.createTitle')}
          tooltip={t('dialog.createTitle')}
          tooltipPlacement="bottom"
          onClick={onCreate}
        >
          <PlusIcon />
        </IconButton>
        {/* 回收站入口与章节 / 大纲标题栏同款（共享 `EditorTrashButton`，自带分隔线）。 */}
        <EditorTrashButton onToggleTrash={onToggleTrash} trashOpen={trashOpen} />
      </>
    ),
    [onCreate, onToggleTrash, trashOpen, t]
  )

  useSetActivityActions('foreshadow', node)

  return null
}

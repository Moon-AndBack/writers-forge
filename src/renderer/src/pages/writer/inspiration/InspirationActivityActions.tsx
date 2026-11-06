/**
 * 灵感模块标题栏动作：注册「新建灵感」加号（经模块级 action 插槽，
 * 由外壳标题栏在活动模块为 `inspiration` 时渲染）。
 *
 * 新建为空白条目（标题 / 正文 / 标签均可后补），成功后由中栏视图选中并展开右栏详情。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionSep, EditorTrashButton } from '../../../components/editor/EditorActionGroup'
import { PlusIcon } from '../icons'

export interface InspirationActivityActionsProps {
  /** 新建一条空白灵感（有未保存草稿时由装配包挂起两态确认）。 */
  onCreate: () => void
  /** 切换中栏回收站视图。 */
  onToggleTrash: () => void
  /** 回收站视图是否打开（按钮呈激活态）。 */
  trashOpen: boolean
}

export default function InspirationActivityActions({
  onCreate,
  onToggleTrash,
  trashOpen
}: InspirationActivityActionsProps) {
  const { t } = useTranslation('inspiration')

  const node = useMemo(
    () => (
      <>
        <EditorActionSep />
        <IconButton
          className="tb-action"
          label={t('action.create')}
          tooltip={t('action.create')}
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

  useSetActivityActions('inspiration', node)

  return null
}

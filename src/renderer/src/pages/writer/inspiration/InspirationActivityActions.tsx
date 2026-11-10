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
import { EditorActionSep } from '../../../components/editor/EditorActionGroup'
import { PlusIcon } from '../icons'

export interface InspirationActivityActionsProps {
  /** 新建一条空白灵感（有未保存草稿时由装配包挂起两态确认）。 */
  onCreate: () => void
}

export default function InspirationActivityActions({ onCreate }: InspirationActivityActionsProps) {
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
      </>
    ),
    [onCreate, t]
  )

  useSetActivityActions('inspiration', node)

  return null
}

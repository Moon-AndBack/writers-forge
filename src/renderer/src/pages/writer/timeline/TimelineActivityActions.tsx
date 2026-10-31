import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionSep } from '../../../components/editor/EditorActionGroup'
import { PlusIcon } from '../icons'

export interface TimelineActivityActionsProps {
  /** 打开「新建时间线」弹窗。 */
  onAdd: () => void
}

export default function TimelineActivityActions({ onAdd }: TimelineActivityActionsProps) {
  const { t } = useTranslation('timeline')

  const node = useMemo(
    () => (
      <>
        <EditorActionSep />
        <IconButton
          className="tb-action"
          label={t('newTimeline')}
          tooltip={t('newTimeline')}
          tooltipPlacement="bottom"
          onClick={onAdd}
        >
          <PlusIcon />
        </IconButton>
      </>
    ),
    [t, onAdd]
  )

  useSetActivityActions('timeline', node)
  return null
}
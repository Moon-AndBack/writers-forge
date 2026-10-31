import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui'

export interface SaveBarProps {
  /** 是否有未保存改动（无改动禁用保存按钮）。 */
  dirty: boolean
  /** 是否正在保存（按钮呈 loading，避免连点重复下发）。 */
  saving: boolean
  /** 立即保存当前草稿（仅变更字段）。 */
  onSave: () => void
  /**
   * 容器样式类：剧情节点用 `plot-save-bar`、设定库用 `dossier-save-bar`
   * （均为右栏底部独立底色卡片，取值口径一致）。
   */
  className: string
}

/**
 * 手动保存操作条（剧情节点 / 设定库右栏共用，§9 通用组件优先）。
 *
 * 口径统一：无未保存改动时按钮禁用；保存中呈 loading；文案取 `common` ns
 * （`save` / `saving` / `saveDirty`），差异只用 `className` 表达，不复制第二份按钮 JSX。
 */
export default function SaveBar({ dirty, saving, onSave, className }: SaveBarProps) {
  const { t } = useTranslation('common')
  return (
    <div className={className}>
      <Button
        variant="primary"
        style={{ marginLeft: 'auto' }}
        disabled={!dirty}
        loading={saving}
        title={saving ? t('saving') : dirty ? t('saveDirty') : t('save')}
        onClick={onSave}
      >
        {t('save')}
      </Button>
    </div>
  )
}

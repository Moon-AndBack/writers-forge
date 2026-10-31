import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'

/**
 * 通用设置 · 数据备份组。
 *
 * 落地策略（本批次）：主进程当前**无**「打开数据目录」「导出全部数据」能力，
 * 为避免扩大范围与新增 IPC，两个操作按钮渲染为**禁用占位**（`disabled`），
 * 由外层 `title` 提示「即将推出」（`common.comingSoon`）。后续实现主进程能力时再接入点击逻辑。
 */
export default function DataSection() {
  const { t } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')

  return (
    <SectionCard title={t('data.title')} description={t('data.description')}>
      <SettingRow label={t('data.location.label')} description={t('data.location.description')}>
        <span className="settings-soon" title={tCommon('comingSoon')}>
          <Button variant="secondary" disabled>
            {t('data.location.action')}
          </Button>
        </span>
      </SettingRow>

      <SettingRow label={t('data.export.label')} description={t('data.export.description')}>
        <span className="settings-soon" title={tCommon('comingSoon')}>
          <Button variant="primary" disabled>
            {t('data.export.action')}
          </Button>
        </span>
      </SettingRow>
    </SectionCard>
  )
}

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, useTooltip } from '../../components/ui'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'

/**
 * 「即将推出」占位操作：禁用按钮外包一层 span 承载自绘 Tooltip。
 *
 * 禁用按钮在部分浏览器不派发 mouseenter / focus 事件，无法直接作 Tooltip 锚点，
 * 故沿用 `settings-soon` 的 span 包裹层——span 本身可正常触发 hover / focus，
 * 同时保留原有内联布局（无布局参数变化）。
 */
function ComingSoonAction({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common')
  const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLSpanElement>({
    content: t('comingSoon')
  })

  return (
    <>
      {tooltip}
      <span className="settings-soon" ref={anchorRef} {...anchorProps}>
        {children}
      </span>
    </>
  )
}

/**
 * 通用设置 · 数据备份组。
 *
 * 落地策略（本批次）：主进程当前**无**「打开数据目录」「导出全部数据」能力，
 * 为避免扩大范围与新增 IPC，两个操作按钮渲染为**禁用占位**（`disabled`），
 * 由外层 span 承载 Tooltip 提示「即将推出」（`common.comingSoon`）。
 * 后续实现主进程能力时再接入点击逻辑。
 */
export default function DataSection() {
  const { t } = useTranslation('settings')

  return (
    <SectionCard title={t('data.title')} description={t('data.description')}>
      <SettingRow label={t('data.location.label')} description={t('data.location.description')}>
        <ComingSoonAction>
          <Button size="sm" variant="secondary" className="wf-btn--on-soft" disabled>
            {t('data.location.action')}
          </Button>
        </ComingSoonAction>
      </SettingRow>

      <SettingRow label={t('data.export.label')} description={t('data.export.description')}>
        <ComingSoonAction>
          <Button size="sm" variant="primary" disabled>
            {t('data.export.action')}
          </Button>
        </ComingSoonAction>
      </SettingRow>
    </SectionCard>
  )
}

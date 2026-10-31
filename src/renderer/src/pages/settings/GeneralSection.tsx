import { useTranslation } from 'react-i18next'
import { Select, Switch } from '../../components/ui'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'
import { useLocale } from '../../i18n/context'
import { useSettingsValue } from './useSettingsValue'

/** 界面语言档位（值写入 settings 键 `locale`；label 走 i18n，语言自称保留原文）。 */
const LOCALE_OPTIONS = [
  { value: 'zh-CN', labelKey: 'locale.zhCN' },
  { value: 'en', labelKey: 'locale.en' }
] as const

/** 默认打开视图档位（值写入 settings 键 `defaultView`；label 走 `settings` ns）。 */
const DEFAULT_VIEW_OPTIONS = [
  { value: 'chapter', labelKey: 'defaultView.chapter' },
  { value: 'outline', labelKey: 'defaultView.outline' },
  { value: 'recent', labelKey: 'defaultView.recent' }
] as const

function resolveDefaultView(raw: string | null): string {
  return DEFAULT_VIEW_OPTIONS.some((option) => option.value === raw) ? (raw as string) : 'chapter'
}

/**
 * 通用设置 · 基础偏好组。
 *
 * 落地策略（本批次）：
 * - 界面语言：真源为全局 `LocaleProvider`（写 `locale` 键，`zh-CN` / `en`）。切换即经
 *   Provider 同步 i18next + `<html lang>` + 持久化；本组件仅消费，不再直读该键。
 * - 自动保存：写 `autoSave` 键（布尔）。**仅存值**——当前正文编辑为防抖落库，
 *   自动保存策略尚未独立实现；该键作为后续自动保存逻辑的开关来源。
 * - 默认打开视图：写 `defaultView` 键（`chapter` / `outline` / `recent`）。**仅存值**——
 *   启动落地页路由策略尚未实现，待后续接入时消费该键。
 */
export default function GeneralSection() {
  const { t } = useTranslation('settings')
  const { locale, setLocale } = useLocale()
  const autoSave = useSettingsValue('autoSave', true, (raw) =>
    raw === null || raw === '' ? true : raw === 'true'
  )
  const defaultView = useSettingsValue('defaultView', 'chapter', resolveDefaultView)

  return (
    <SectionCard title={t('general.title')} description={t('general.description')}>
      <SettingRow label={t('locale.label')} description={t('locale.description')}>
        <Select
          className="settings-control settings-control--select"
          value={locale}
          options={LOCALE_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          ariaLabel={t('locale.label')}
          onChange={(value) => setLocale(value === 'en' ? 'en' : 'zh-CN')}
        />
      </SettingRow>

      <SettingRow label={t('autoSave.label')} description={t('autoSave.description')}>
        <Switch
          checked={autoSave.value}
          aria-label={t('autoSave.label')}
          onChange={(event) => autoSave.setValue(event.target.checked)}
        />
      </SettingRow>

      <SettingRow label={t('defaultView.label')} description={t('defaultView.description')}>
        <Select
          className="settings-control settings-control--select"
          value={defaultView.value}
          options={DEFAULT_VIEW_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          ariaLabel={t('defaultView.label')}
          onChange={(value) => defaultView.setValue(resolveDefaultView(value))}
        />
      </SettingRow>
    </SectionCard>
  )
}

import { useTranslation } from 'react-i18next'
import { Select, Switch } from '../../components/ui'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'
import { useLocale } from '../../i18n/context'
import { useSettingsValue } from './useSettingsValue'
import { DEFAULT_VIEW_OPTIONS, resolveDefaultView, type DefaultView } from './defaultView'

/** 界面语言档位（值写入 settings 键 `locale`；label 走 i18n，语言自称保留原文）。 */
const LOCALE_OPTIONS = [
  { value: 'zh-CN', labelKey: 'locale.zhCN' },
  { value: 'en', labelKey: 'locale.en' }
] as const

/** 默认打开视图档位的展示文案键（取值 / 校验见 `defaultView.ts`）。 */
type DefaultViewLabelKey = 'defaultView.bookshelf' | 'defaultView.chapter' | 'defaultView.outline'
const DEFAULT_VIEW_LABEL_KEYS: Record<DefaultView, DefaultViewLabelKey> = {
  bookshelf: 'defaultView.bookshelf',
  chapter: 'defaultView.chapter',
  outline: 'defaultView.outline'
}

/**
 * 通用设置 · 基础偏好组。
 *
 * 落地策略（本批次）：
 * - 界面语言：真源为全局 `LocaleProvider`（写 `locale` 键，`zh-CN` / `en`）。切换即经
 *   Provider 同步 i18next + `<html lang>` + 持久化；本组件仅消费，不再直读该键。
 * - 自动保存：写 `autoSave` 键（布尔），由写作域 `useAutoSaveEnabled` 消费——
 *   开启时章节 / 大纲正文停止输入 800ms 自动落库；关闭时仅手动保存，切章 / 切模块 /
 *   关窗仍会统一 flush（安全网）。剧情 / 设定档案 / 伏笔 / 灵感本身为手动保存，不受影响。
 * - 默认打开视图：写 `defaultView` 键（`bookshelf` / `chapter` / `outline`）。启动时由
 *   `App` 读取并决定首屏（书架，或最近编辑的书 + 章节 / 大纲视图）；仅在启动时生效一次，
 *   不干扰后续导航。历史值 `recent` 未实现，已移除并回落书架。
 */
export default function GeneralSection() {
  const { t } = useTranslation('settings')
  const { locale, setLocale } = useLocale()
  const autoSave = useSettingsValue('autoSave', true, (raw) =>
    raw === null || raw === '' ? true : raw === 'true'
  )
  const defaultView = useSettingsValue('defaultView', 'bookshelf', resolveDefaultView)

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
            value: option,
            label: t(DEFAULT_VIEW_LABEL_KEYS[option])
          }))}
          ariaLabel={t('defaultView.label')}
          onChange={(value) => defaultView.setValue(resolveDefaultView(value))}
        />
      </SettingRow>
    </SectionCard>
  )
}

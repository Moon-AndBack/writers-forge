import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, Switch } from '../../components/ui'
import type { ThemeId } from '../../theme/themes'
import { useTheme } from '../../theme/useTheme'
import { useWindowMaterial } from '../../theme/windowMaterial'
import {
  PAPER_LINES_DEFAULT,
  PAPER_LINES_SETTING_KEY,
  decodePaperLines
} from '../../shell/paperLines'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'
import { settingRowDescriptionId } from './settingRowIds'
import { useSettingsValue } from './useSettingsValue'

/**
 * 通用设置 · 外观与主题组。
 *
 * 落地策略：主题模式经 `useTheme().setTheme` 即时生效（内部写 `theme` 键，
 * 由 ThemeProvider 负责持久化）。
 *
 * 注：设置页不提供手动选色；light / dark 的品牌色跟随 Windows 系统强调色
 * （见 `useSystemAccent`），sage / honey 使用 `theme.css` 的静态品牌色。
 *
 * 切换同样带圆形晕染，但下拉选项由 portal 渲染、回调只回传值而没有事件与元素，
 * 故不传 `origin`——按约定退回视口中心作为圆心。
 */
export default function AppearanceSection() {
  const { t } = useTranslation('theme')
  const { t: tSettings } = useTranslation('settings')
  const { theme, themes, setTheme } = useTheme()
  const windowMaterial = useWindowMaterial()
  const paperLines = useSettingsValue(
    PAPER_LINES_SETTING_KEY,
    PAPER_LINES_DEFAULT,
    decodePaperLines
  )
  const themeModeId = useId()
  const acrylicId = useId()
  const paperLinesId = useId()

  return (
    <SectionCard>
      <SettingRow
        controlId={themeModeId}
        label={tSettings('themeMode.label')}
        description={tSettings('themeMode.description')}
      >
        <Select
          id={themeModeId}
          ariaDescribedBy={settingRowDescriptionId(themeModeId)}
          className="settings-control settings-control--select"
          value={theme}
          options={themes.map((item) => ({ value: item.id, label: t(item.labelKey) }))}
          ariaLabel={tSettings('themeMode.label')}
          onChange={(value) => setTheme(value as ThemeId)}
        />
      </SettingRow>

      <SettingRow
        controlId={acrylicId}
        label={t('acrylic.label')}
        description={
          windowMaterial.supported ? t('acrylic.supportedDesc') : t('acrylic.unsupportedDesc')
        }
      >
        <Switch
          id={acrylicId}
          aria-describedby={settingRowDescriptionId(acrylicId)}
          checked={windowMaterial.enabled}
          disabled={!windowMaterial.supported}
          aria-label={t('acrylic.switchAria')}
          onChange={(event) => windowMaterial.setEnabled(event.target.checked)}
        />
      </SettingRow>

      <SettingRow
        controlId={paperLinesId}
        label={tSettings('paperLines.label')}
        description={tSettings('paperLines.description')}
      >
        <Switch
          id={paperLinesId}
          aria-describedby={settingRowDescriptionId(paperLinesId)}
          checked={paperLines.value}
          aria-label={tSettings('paperLines.label')}
          onChange={(event) => paperLines.setValue(event.target.checked)}
        />
      </SettingRow>
    </SectionCard>
  )
}

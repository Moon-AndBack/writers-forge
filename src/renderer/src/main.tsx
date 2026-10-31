import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ThemeProvider } from './theme/ThemeProvider'
import { ChipColorProvider } from './theme/ChipColorProvider'
import { DEFAULT_THEME, isThemeId, THEME_SETTING_KEY } from './theme/themes'
import {
  DEFAULT_WINDOW_MATERIAL_SETTING,
  WINDOW_MATERIAL_SETTING_KEY,
  normalizeWindowMaterialSetting
} from './theme/windowMaterial'
import { WindowMaterialProvider } from './theme/WindowMaterialProvider'
import { I18nextProvider } from 'react-i18next'
import i18n, { initI18n } from './i18n'
import { LocaleProvider } from './i18n/LocaleProvider'
import { LOCALE_SETTING_KEY, resolveLocale } from './i18n/config'
import { ACTIVITY_PINNED_SETTING_KEY, DEFAULT_ACTIVITY_PINNED } from './shell/activityPinned'
import './styles/index.css'

/**
 * 启动时从数据库预取用户选择的主题（含 'system'）、窗口材质与活动栏固定态，校验后作为
 * 初始值传入对应 Provider，避免异步读取导致的浅色 / 背景 / 活动栏态闪屏。无 window.api
 * （纯浏览器预览）时回退各自默认值，不阻塞渲染。
 */
async function bootstrap(): Promise<void> {
  let initialTheme = DEFAULT_THEME
  let initialMaterial = DEFAULT_WINDOW_MATERIAL_SETTING
  // 语言：默认跟随系统（navigator.language），有持久化值则以其为准
  let initialLocale = resolveLocale(navigator.language)
  // 活动栏固定态：默认悬浮，仅持久化值恰为 'true' 时固定
  let initialActivityPinned = DEFAULT_ACTIVITY_PINNED
  try {
    const [savedTheme, savedMaterial, savedLocale, savedActivityPinned] = await Promise.all([
      window.api?.settings.get(THEME_SETTING_KEY),
      window.api?.settings.get(WINDOW_MATERIAL_SETTING_KEY),
      window.api?.settings.get(LOCALE_SETTING_KEY),
      window.api?.settings.get(ACTIVITY_PINNED_SETTING_KEY)
    ])
    if (isThemeId(savedTheme)) initialTheme = savedTheme
    const normalizedMaterial = normalizeWindowMaterialSetting(savedMaterial)
    if (normalizedMaterial) initialMaterial = normalizedMaterial
    if (savedLocale !== null && savedLocale !== undefined)
      initialLocale = resolveLocale(savedLocale)
    if (savedActivityPinned === 'true') initialActivityPinned = true
  } catch {
    /* 读取失败（无 API / IPC 异常）时回退默认主题 / 材质 / 系统语言 / 悬浮态 */
  }

  // 同步初始化 i18next：资源已内联，首帧即用目标语言渲染，避免闪文案
  initI18n(initialLocale)

  // HashRouter：生产环境 file:// 协议下 BrowserRouter 会白屏
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <LocaleProvider initialLocale={initialLocale}>
          <ThemeProvider initialTheme={initialTheme}>
            <ChipColorProvider>
              <WindowMaterialProvider initialMaterial={initialMaterial}>
                <HashRouter>
                  <App initialActivityPinned={initialActivityPinned} />
                </HashRouter>
              </WindowMaterialProvider>
            </ChipColorProvider>
          </ThemeProvider>
        </LocaleProvider>
      </I18nextProvider>
    </StrictMode>
  )
}

void bootstrap()

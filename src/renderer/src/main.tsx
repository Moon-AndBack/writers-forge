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
import { PAPER_LINES_SETTING_KEY, decodePaperLines } from './shell/paperLines'
import {
  DEFAULT_VIEW_SETTING_KEY,
  resolveDefaultView,
  type DefaultView
} from './pages/settings/defaultView'
import './styles/index.css'

/**
 * 批量读取「其余」启动设置（主题 / 窗口材质 / 活动栏固定态 / 稿纸横线）：一次 `settings:all` IPC
 * 替代 4 次 `settings:get`。主进程该通道已剔除 `ai:*` / `onedrive:credentials:*` 敏感键，
 * 故本函数只用于取非敏感键（`theme` / `windowMaterial` / `activityBarPinned` / `paperLines`）。
 * 无 window.api（纯浏览器预览）/ IPC 异常时返回空对象，由调用方回退各自默认值。
 */
async function readBootSettings(): Promise<Record<string, string>> {
  try {
    return (await window.api?.settings.all()) ?? {}
  } catch {
    return {}
  }
}

/** 启动时预取系统是否支持窗口材质；无 window.api / IPC 异常时视为不支持。 */
async function readMaterialSupported(): Promise<boolean> {
  try {
    return (await window.api?.windowMaterial.materialSupported()) === true
  } catch {
    return false
  }
}

/**
 * 启动时从数据库预取用户选择的主题（含 'system'）、窗口材质、活动栏固定态与稿纸横线开关，
 * 校验后作为初始值传入对应 Provider，避免异步读取导致的浅色 / 背景 / 活动栏态闪屏。无 window.api
 * （纯浏览器预览）时回退各自默认值，不阻塞渲染。
 *
 * 时序分两段（避免串行等待）：
 * 1. 先单独读 `locale`——语言决定加载哪份语言包，无法与语言包加载并行；
 * 2. 拿到 locale 后，「加载该语言包并初始化 i18next」与「批量读取其余设置」并行。
 */
async function bootstrap(): Promise<void> {
  let initialTheme = DEFAULT_THEME
  let initialMaterial = DEFAULT_WINDOW_MATERIAL_SETTING
  // 语言：默认跟随系统（navigator.language），有持久化值则以其为准
  let initialLocale = resolveLocale(navigator.language)
  // 活动栏固定态：默认悬浮，仅持久化值恰为 'true' 时固定
  let initialActivityPinned = DEFAULT_ACTIVITY_PINNED

  // 阶段 1：确定语言（1 次 IPC）
  try {
    const savedLocale = await window.api?.settings.get(LOCALE_SETTING_KEY)
    if (savedLocale !== null && savedLocale !== undefined)
      initialLocale = resolveLocale(savedLocale)
  } catch {
    /* 读取失败（无 API / IPC 异常）时回退系统语言 */
  }

  // 阶段 2：语言包加载 与 其余设置批量读取、材质支持预取 并行；initI18n 须在 render 前完成（首帧即目标语言）
  const [bootSettings, initialSupported] = await Promise.all([
    readBootSettings(),
    readMaterialSupported(),
    initI18n(initialLocale)
  ])

  const savedTheme = bootSettings[THEME_SETTING_KEY]
  if (isThemeId(savedTheme)) initialTheme = savedTheme
  const normalizedMaterial = normalizeWindowMaterialSetting(
    bootSettings[WINDOW_MATERIAL_SETTING_KEY]
  )
  if (normalizedMaterial) initialMaterial = normalizedMaterial
  if (bootSettings[ACTIVITY_PINNED_SETTING_KEY] === 'true') initialActivityPinned = true
  // 正文稿纸横线：默认关闭，仅持久化值恰为 'true' 时开启
  const initialPaperLines = decodePaperLines(bootSettings[PAPER_LINES_SETTING_KEY] ?? null)
  // 默认打开视图：非法 / 历史值（如已移除的 `recent`）/ 缺省一律回落书架（应用既有首屏）
  const initialDefaultView: DefaultView = resolveDefaultView(bootSettings[DEFAULT_VIEW_SETTING_KEY])

  /* 活动栏固定态在 render 前同步到 body：Provider 的 `useEffect` 晚于首帧绘制，
     若首帧缺这个类，`.writer-view` 会先按悬浮态的 20px 左内边距布局，再在 0.32s
     内过渡到固定态的 64px（写作页整体横向滑动一下）。这里预写同值属空操作，
     Provider 之后照常投影。 */
  document.body.classList.toggle('act-pinned', initialActivityPinned)

  /* 稿纸横线同理：Provider 的 `useEffect` 晚于首帧绘制，预写 dataset 属性可让
     首帧直接按持久化值绘制（或保持无线），避免正文先无线、随后整片虚线闪入。
     Provider 挂载后照常投影，写入同值属空操作。 */
  document.documentElement.dataset.paperLines = initialPaperLines ? 'true' : 'false'

  // HashRouter：生产环境 file:// 协议下 BrowserRouter 会白屏
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <LocaleProvider initialLocale={initialLocale}>
          <ThemeProvider initialTheme={initialTheme}>
            <ChipColorProvider>
              <WindowMaterialProvider
                initialMaterial={initialMaterial}
                initialSupported={initialSupported}
              >
                <HashRouter>
                  <App
                    initialActivityPinned={initialActivityPinned}
                    initialPaperLines={initialPaperLines}
                    initialDefaultView={initialDefaultView}
                  />
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

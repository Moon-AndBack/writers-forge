/**
 * i18next 单例初始化（渲染层）。
 *
 * 设计要点：
 * - 单例在模块级只初始化一次（`initialized` 守卫），后续 `changeLanguage` 复用同一实例；
 * - `lng` 由启动阶段（main.tsx 读 settings 后经 `resolveLocale`）传入，同步生效，
 *   避免首帧闪文案；`fallbackLng` 恒为 zh-CN；
 * - `useSuspense: false`：资源已内联打包，无需 Suspense 挂起；
 * - 不引入 `i18next-browser-languagedetector`：语言真源 = settings.locale + navigator.language，
 *   统一由 `resolveLocale` 规整（见 ./config）。
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LOCALE, type Locale } from './config'
import zhCN from './locales/zh-CN'
import en from './locales/en'

let initialized = false

/** 初始化 i18next（幂等）：仅首次调用执行 init，之后仅切换语言。 */
export function initI18n(locale: Locale): typeof i18n {
  if (!initialized) {
    void i18n.use(initReactI18next).init({
      resources: {
        'zh-CN': zhCN,
        en
      },
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      defaultNS: 'common',
      interpolation: { escapeValue: false },
      returnNull: false,
      react: { useSuspense: false }
    })
    initialized = true
  } else if (i18n.language !== locale) {
    void i18n.changeLanguage(locale)
  }
  return i18n
}

export { i18n }
export default i18n

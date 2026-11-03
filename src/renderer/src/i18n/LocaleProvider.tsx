import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { changeLocale } from './index'
import { LOCALE_SETTING_KEY, type Locale } from './config'
import { LocaleContext } from './context'

/**
 * 语言真源 Provider：唯一持有当前语言并负责三处同步。
 *
 * 与 ThemeProvider 同范式（context 定义在 ./context，本文件只含组件）：启动值由
 * main.tsx 预取（settings.locale → navigator.language）后传入避免闪文案；切换时同步
 * 更新 i18next、`document.documentElement.lang` 与 `settings.locale`（无 window.api 时
 * 静默跳过持久化，仍保证界面切换生效）。
 */
export function LocaleProvider({
  children,
  initialLocale
}: {
  children: ReactNode
  /** 启动时由 main.tsx 解析后的初始语言 */
  initialLocale: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  // 初始挂载与语言变化时同步 <html lang>（首帧 HTML 已写 zh-CN，此处校正为实际语言）
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    // 目标语言包按需加载（必要时动态 import + addResourceBundle）后再切换 i18next
    void changeLocale(next).catch(() => {})
    void window.api?.settings.set(LOCALE_SETTING_KEY, next).catch(() => {})
  }, [])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export default LocaleProvider

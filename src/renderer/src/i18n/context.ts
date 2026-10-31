import { createContext, useContext } from 'react'
import type { Locale } from './config'

export interface LocaleContextValue {
  /** 当前界面语言（受支持档位之一） */
  locale: Locale
  /** 切换界面语言：i18n + `<html lang>` + settings 持久化 三处同步 */
  setLocale: (next: Locale) => void
}

export const LocaleContext = createContext<LocaleContextValue | null>(null)

/**
 * 读取 / 切换界面语言。无 Provider（如独立测试渲染）时回退默认语言 + 空操作，
 * 与 useWindowMaterial 的容错范式一致，避免调用方崩溃。
 */
export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) {
    return { locale: 'zh-CN', setLocale: () => undefined }
  }
  return context
}

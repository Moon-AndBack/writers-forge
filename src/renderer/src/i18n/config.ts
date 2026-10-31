/**
 * i18n 语言配置（无 React 依赖，可被任意层安全引用）。
 *
 * 语言真源为 settings 表 `locale` 键（手动切换后持久化），缺省时回退系统语言
 * `navigator.language`，两者均经本模块的 `resolveLocale` 规整为受支持的 Locale。
 */

/** settings 表持久化键名（与设置页既有存值逻辑一致）。 */
export const LOCALE_SETTING_KEY = 'locale'

/** 支持的语言档位；`DEFAULT_LOCALE` 兼作 i18next 的 fallbackLng。 */
export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** 默认 / 回退语言：无有效持久化值且系统语言非英文时使用。 */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/**
 * 把任意来源的原始值规整为受支持的 Locale。
 * - `en` 前缀（如 `en` / `en-US`）→ `'en'`
 * - 其余（含 null / 非法值 / 空串）→ 默认 `'zh-CN'`
 */
export function resolveLocale(raw: unknown): Locale {
  return typeof raw === 'string' && raw.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LOCALE
}

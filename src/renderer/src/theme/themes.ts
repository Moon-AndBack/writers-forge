/**
 * 主题清单：标识需与 styles/theme.css 的 `[data-theme='...']` 选择器一致。
 * 展示名不在此处硬编码——`labelKey` 即 `theme` i18n 命名空间的键（与 id 同值），
 * 由消费者 `t(labelKey)` 取当前语言文案。
 *
 * `system`（跟随系统）是用户可选项，但**不写入** `data-theme`：
 * ThemeProvider 会依据系统明暗把它解析为 `light` / `dark` 后再写入。
 */
export const THEME_IDS = ['system', 'light', 'dark', 'sage', 'honey'] as const

export type ThemeId = (typeof THEME_IDS)[number]

/** 实际生效主题：`system` 解析后的结果，与 styles/theme.css 的 data-theme 取值一致。 */
export type ResolvedThemeId = Exclude<ThemeId, 'system'>

export interface ThemeMeta {
  /** 与 `document.documentElement.dataset.theme` 对应的值（仅 light/dark/sage/honey） */
  id: ThemeId
  /** `theme` 命名空间的展示名键（与 id 同值），供消费者 `t(labelKey)` 取当前语言文案 */
  labelKey: ThemeId
}

export const THEMES: readonly ThemeMeta[] = [
  { id: 'system', labelKey: 'system' },
  { id: 'light', labelKey: 'light' },
  { id: 'dark', labelKey: 'dark' },
  { id: 'sage', labelKey: 'sage' },
  { id: 'honey', labelKey: 'honey' }
]

export const DEFAULT_THEME: ThemeId = 'system'

/** settings 表持久化键名（存用户选择本身，含 `system`） */
export const THEME_SETTING_KEY = 'theme'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

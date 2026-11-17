/**
 * 主题档位**跨进程共享**的单一真源（主进程 `theme` 与渲染层 `theme/themes` 共用，
 * AGENTS §2 / §9）。
 *
 * 本文件只允许**类型 + 纯数据 + 纯函数**，不得引入 Node / Electron / React。
 *
 * 标识需与渲染层 `styles/theme.css` 的 `[data-theme='...']` 选择器一致；展示名不在
 * 此处硬编码——渲染层 `theme` i18n 命名空间的键与 id 同值。
 *
 * `system`（跟随系统）是用户可选项，但**不写入** `data-theme`：ThemeProvider 会依据
 * 系统明暗把它解析为 `light` / `dark` 后再写入。
 */

/** 用户可选主题五档（顺序即主题面板顺序）。 */
export const THEME_IDS = ['system', 'light', 'dark', 'sage', 'honey'] as const

export type ThemeId = (typeof THEME_IDS)[number]

/** 实际生效主题：`system` 解析后的结果，与 theme.css 的 data-theme 取值一致。 */
export type ResolvedThemeId = Exclude<ThemeId, 'system'>

/** 缺省档位（跟随系统）。 */
export const DEFAULT_THEME: ThemeId = 'system'

/** settings 表持久化键名（存用户选择本身，含 `system`）。 */
export const THEME_SETTING_KEY = 'theme'

/** 类型守卫：仅接受五档合法主题。 */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

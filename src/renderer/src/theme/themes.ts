/**
 * 主题清单：标识需与 styles/theme.css 的 `[data-theme='...']` 选择器一致。
 * 展示名不在此处硬编码——`labelKey` 即 `theme` i18n 命名空间的键（与 id 同值），
 * 由消费者 `t(labelKey)` 取当前语言文案。
 *
 * `system`（跟随系统）是用户可选项，但**不写入** `data-theme`：
 * ThemeProvider 会依据系统明暗把它解析为 `light` / `dark` 后再写入。
 *
 * 档位 id / 守卫 / 设置键的单一真源在 `src/shared/theme.ts`（与主进程共用），
 * 此处原样重导出，渲染层既有导入路径零改动。
 */

import {
  DEFAULT_THEME,
  THEME_IDS,
  THEME_SETTING_KEY,
  isThemeId,
  type ResolvedThemeId,
  type ThemeId
} from '../../../shared/theme'

export { DEFAULT_THEME, THEME_IDS, THEME_SETTING_KEY, isThemeId }
export type { ResolvedThemeId, ThemeId }

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

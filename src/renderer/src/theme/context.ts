import { createContext } from 'react'
import type { ResolvedThemeId, ThemeId, ThemeMeta } from './themes'

export interface ThemeContextValue {
  /** 用户选择的主题标识（可能是 `system`） */
  theme: ThemeId
  /** 实际生效主题（`system` 已解析为 light/dark，绝不为 `system`） */
  resolvedTheme: ResolvedThemeId
  /**
   * 切换主题（同步写入 dataset 与数据库）。
   *
   * 过渡为整屏交叉淡化，与触发位置无关，故无需坐标 / 元素等来源参数。
   */
  setTheme: (theme: ThemeId) => void
  /** 全部可用主题 */
  themes: readonly ThemeMeta[]
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

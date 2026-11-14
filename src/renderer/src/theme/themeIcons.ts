import type { IconNode } from 'lucide'
import { Eye, Leaf, Moon, Sun } from 'lucide'
import type { ResolvedThemeId } from './themes'

/**
 * 主题图标单一真源（Lucide `IconNode`）。
 *
 * 同时服务两处：
 * - 标题栏主题按钮的四态形变（经 `shell/morphIcons.ts` 重导出，保持原导出名）；
 * - 主题切换覆盖层中心的大图标（`themeReveal.ts` 用 `createElementNS` 序列化）。
 *
 * 图标是**数据**而非 React 组件：覆盖层不走 React，直接按 `[tag, attrs][]`
 * 构造 SVG，避免为大图标额外引入一个仅动画期挂载的组件树。
 */
export const THEME_ICONS: Record<ResolvedThemeId, IconNode> = {
  light: Sun,
  dark: Moon,
  sage: Leaf,
  honey: Eye
}

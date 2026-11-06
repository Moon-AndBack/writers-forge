/**
 * 右栏页签的取值与各模块可见集（纯数据模块，无 JSX / 无组件，故不触发
 * `react-refresh/only-export-components`；结构同 `components/editor/tableMenu.ts`）。
 *
 * 这里是页签顺序的**唯一真源**：`RightPaneTabs` 据此渲染（缺省用章节全集），
 * `RightPane` 据此校验当前页签与回退。
 */

/** 右栏「大纲 / 剧情 / 伏笔 / 灵感 / AI」页签值。 */
export type RightPaneTab = 'outline' | 'plot' | 'foreshadow' | 'inspiration' | 'ai'

/** 章节模块右栏的页签全集与顺序：大纲 / 剧情 / 伏笔 / 灵感 / AI。 */
export const CHAPTER_RIGHT_PANE_TABS: readonly RightPaneTab[] = [
  'outline',
  'plot',
  'foreshadow',
  'inspiration',
  'ai'
]

/**
 * 大纲模块右栏的页签子集：与章节页同款的「剧情 / 伏笔 / 灵感」三项。
 * 不含「大纲」（大纲页本身就是大纲视图）与「AI」（AI 面板按章挂载，大纲页不提供）。
 */
export const OUTLINE_RIGHT_PANE_TABS: readonly RightPaneTab[] = [
  'plot',
  'foreshadow',
  'inspiration'
]

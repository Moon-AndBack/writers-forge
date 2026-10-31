/**
 * 教学书籍种子数据（首启唯一书籍「Writer's Forge · 使用指南」）：**聚合入口**。
 *
 * 实现按职责拆分为 `seedGuideBook/` 子模块（保持单文件 ≤500 行，§3）：
 * - `seedGuideBook/volumes.ts`：章节域载体（正文卷 + 章 + 正文块）+ 书籍元信息；
 * - `seedGuideBook/outline.ts`：大纲域载体（分组 + 条目 + 独立条目，正文整条内联）。
 * - `seedGuideBook/plot.ts`：剧情域载体（2 剧情线 × 各 3 场景；场景 `entityKeys` 声明关联的示范设定）。
 *
 * 本文件仅做 re-export，保持既有导入路径（`./seedGuideBook`）与导出面稳定。
 *
 * ⚠️ 维护约定（AGENTS §7.5 教学书籍种子维护）：**新增任何功能或做出不兼容变更
 * （数据结构变更、交互破坏性改动，如按钮位置 / 快捷键 / 流程变化）时，必须同步
 * 修改 `seedGuideBook/` 下的教学数据**，保证首次启动的教学书始终反映当前功能集，
 * 且教学文案与实际交互（按钮、快捷键、范围、默认值）逐条一致。
 * 教学书正文**不使用表格块**（属教学取舍：正文改用列表与段落表达；表格块仅大纲条目可用）。
 */

export { GUIDE_BOOK, GUIDE_VOLUMES } from './seedGuideBook/volumes'
export { GUIDE_OUTLINE, GUIDE_OUTLINE_STANDALONE } from './seedGuideBook/outline'
export type { SeedOutlineEntry, SeedOutlineGroup } from './seedGuideBook/outline'
export { GUIDE_PLOT_LINES } from './seedGuideBook/plot'
export type { SeedPlotLine, SeedPlotScene } from './seedGuideBook/plot'

/**
 * 正文「有效字数」口径（主进程侧入口）。
 *
 * 真源已迁至 `src/shared/wordCount.ts`（与渲染层共用）；本文件只保留主进程侧的既有
 * 导入路径，`database` 各模块（`chapters` / `stats` / `ipc/docLimit`）无需改 import。
 */

export { countEffectiveChars } from '../../shared/wordCount'

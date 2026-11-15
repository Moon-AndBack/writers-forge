import type { SeedVolume } from '../seedBlocks'

/**
 * 卷三「大纲」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：卷序与卷名已登记，章节目录待后续批次填充。计划覆盖 7 章：
 * 认识大纲 / 卷纲与分组 / 富文本格式 / 表格编辑 / 插入图片 /
 * 大纲查找替换 / 大纲回收站。
 *
 * 大纲域的教学数据（分组 + 条目）另见 `./outline.ts`；本文件只负责章节域。
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_OUTLINE: SeedVolume = {
  kind: 'normal',
  title: '大纲',
  chapters: []
}

import type { SeedVolume } from '../seedBlocks'

/**
 * 卷四「剧情与时间线」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：卷序与卷名已登记，章节目录待后续批次填充。计划覆盖 6 章：
 * 剧情模块总览 / 剧情线与场景 / 场景时间与纪元 / 主时间线 /
 * 多时间线与切换 / 出场实体与关联设定。
 *
 * 示范剧情线与场景数据另见 `./plot.ts`；本文件只负责章节域。
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_STORY: SeedVolume = {
  kind: 'normal',
  title: '剧情与时间线',
  chapters: []
}

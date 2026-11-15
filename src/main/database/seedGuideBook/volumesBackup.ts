import type { SeedVolume } from '../seedBlocks'

/**
 * 卷九「备份」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：卷序与卷名已登记，章节目录待后续批次填充。计划覆盖 4 章：
 * 本地备份 / 恢复与导出 / 云备份 / 数据存储位置。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_BACKUP: SeedVolume = {
  kind: 'normal',
  title: '备份',
  chapters: []
}

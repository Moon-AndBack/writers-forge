import type { SeedVolume } from '../seedBlocks'

/**
 * 卷十「设置与快捷键」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：卷序与卷名已登记，章节目录待后续批次填充。计划覆盖 5 章：
 * 设置弹窗总览 / 基础偏好 / 重置为默认 / 快捷键速查 / 全局交互与无障碍。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_SETTINGS: SeedVolume = {
  kind: 'normal',
  title: '设置与快捷键',
  chapters: []
}

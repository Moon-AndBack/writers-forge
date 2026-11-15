import type { SeedVolume } from '../seedBlocks'

/**
 * 卷八「界面与外观」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：卷序与卷名已登记，章节目录待后续批次填充。计划覆盖 6 章：
 * 三栏布局与拖宽 / 活动栏 / 排版胶囊 / 主题与窗口材质 / 稿纸横线 / 语言切换。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_INTERFACE: SeedVolume = {
  kind: 'normal',
  title: '界面与外观',
  chapters: []
}

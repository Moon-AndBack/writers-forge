import type { SeedVolume } from '../seedBlocks'

/**
 * 卷二「章节写作」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：卷序与卷名已登记，章节目录待后续批次填充。计划覆盖 8 章：
 * 卷与章的组织 / 章名、状态与保存 / 写正文与行内格式 / 置顶、拖拽与排序 /
 * 查找与替换 / 章节回收站 / 违禁词检测 / 章节右栏页签。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_CHAPTERS: SeedVolume = {
  kind: 'normal',
  title: '章节写作',
  chapters: []
}

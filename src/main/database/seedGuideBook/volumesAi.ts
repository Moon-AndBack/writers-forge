import type { SeedVolume } from '../seedBlocks'

/**
 * 卷七「AI 助手」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：卷序与卷名已登记，章节目录待后续批次填充。计划覆盖 8 章：
 * 开启与配置 / 会话管理 / 功能与携带上下文 / 发送与状态行 / 回插正文 /
 * 跨章来源与跳转 / 上下文占用与压缩 / 关闭 AI 之后。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_AI: SeedVolume = {
  kind: 'normal',
  title: 'AI 助手',
  chapters: []
}

import type { SeedChapter } from '../seedBlocks'

/**
 * 卷五「设定档案」后半章节载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：章节待后续批次填充，当前为空数组；由 `./volumesEntities.ts` 展开进
 * `VOLUME_ENTITIES.chapters`，卷五两文件的拆分与拼接顺序（前半 → 后半）在骨架态
 * 即已成立。后续批次只需在本数组追加 3 章：势力组织架构 / 境界体系 /
 * 首次登场与实体高亮。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const ENTITY_SUBTYPE_CHAPTERS: readonly SeedChapter[] = []

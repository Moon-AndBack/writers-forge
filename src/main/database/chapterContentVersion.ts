/**
 * 章节正文内容版本信号（进程内、按章递增）。
 *
 * 用途：实体首次登场索引（`src/main/match/firstAppearance.ts`）判断**哪些章正文发生了变化**，
 * 从而只重扫变化章，而不是整书重建。
 *
 * 设计取舍：
 * - **不落库**：版本号与首次登场内存索引同生命周期（进程重启后索引也不存在，二者天然对齐）；
 * - **按章而非全局**：全局计数器只能判断「有变化」，无法定位章节；按章才能增量重扫；
 * - **调用点显式标记**：`saveParagraphs` 的 4 个调用点（章节保存 / 搜索替换 / 替换全部 / 种子写入）
 *   在**落库成功之后**调用 {@link markChapterContentChanged}，避免为未真正落盘的内容递增版本。
 */

/** 章节 id → 正文写入版本（从未写入过的章缺省为 0）。 */
const versions = new Map<number, number>()

/** 标记某章正文已成功写入：版本自增，使首次登场索引下次查询时重扫该章。 */
export function markChapterContentChanged(chapterId: number): void {
  versions.set(chapterId, (versions.get(chapterId) ?? 0) + 1)
}

/** 读取某章正文写入版本；从未写入过返回 0。 */
export function getChapterContentVersion(chapterId: number): number {
  return versions.get(chapterId) ?? 0
}

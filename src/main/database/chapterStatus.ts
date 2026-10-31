/**
 * 章节状态两态与卷内容量常量（自 `chapters.ts` 拆出，供 IPC 校验与数据层共用）。
 */

/** 章节状态两态：草稿 / 定稿（本批由三态收敛为两态，移除 `writing`）。 */
export type ChapterStatus = 'draft' | 'done'

/** 章节状态可选值（两态），供 IPC 层入参校验。 */
export const CHAPTER_STATUSES: readonly ChapterStatus[] = ['draft', 'done']

/**
 * 卷内普通章上限（追加需求）：任意卷（普通卷 / 自定义卷）内未删除**普通章**数达此值后
 * 拒绝再建普通章。**只数普通章**——特殊章不占编号、不占容量。
 * ⚠️ 渲染层镜像常量（`src/renderer/.../chapterTree.ts`，第二批）须与本值同步。
 */
export const MAX_CHAPTERS_PER_VOLUME = 99999

/** 归一化章节状态：非法值（含旧三态的 `writing`）回退 `draft`。 */
export function coerceStatus(value: unknown): ChapterStatus {
  return CHAPTER_STATUSES.includes(value as ChapterStatus) ? (value as ChapterStatus) : 'draft'
}

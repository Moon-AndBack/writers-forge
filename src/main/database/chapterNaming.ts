import { getDb } from './index'
import { toChineseNumber } from './chineseNumber'
import { MAX_CHAPTERS_PER_VOLUME } from './chapterStatus'

/**
 * 卷 / 章自动默认命名（编号在**所属分组内独立**）。
 *
 * 规则（对齐 `schema/chapters.ts` 的 `kind` 判别）：
 * - 卷名 → 「卷」+ 中文数字（卷一、卷二、…、卷一万零一…，支持至 99999）；按该书
 *   **正文卷**（`kind='normal'`）未删除数 + 1 推算——`custom` / `group` 各用独立序号空间，
 *   不参与「卷X」计数；
 * - 章名 → 「第」+ 中文数字 + 「章」；按**所属卷内普通章**（`kind='normal'`）未删除数 + 1
 *   推算，**排除特殊章**（序章 / 番外等不占号）；`volumeId` 必填（未分卷语义已移除）。
 *
 * 说明：计数只统计未删除项，回收站中的项不占号；还原时保留原名、不改名，
 * 因此还原可能与新章重名——重名在数据层无害（无唯一约束），显示层以位置 / id 区分。
 */

/** 该书下一个卷默认名（「卷」+ 中文数字，按 `kind='normal'` 卷计数，排除 custom / group）。 */
export function nextVolumeDefaultTitle(bookId: string): string {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS count FROM volumes WHERE book_id = ? AND deleted_at IS NULL AND kind = 'normal'"
    )
    .get(bookId) as { count: number }
  return `卷${toChineseNumber(row.count + 1)}`
}

/**
 * 该书指定卷的下一个章默认名（「第」+ 中文数字 + 「章」，按普通章计数，排除特殊章）。
 * 卷内普通章数达 `MAX_CHAPTERS_PER_VOLUME` 时返回空串（调用方据此禁用创建，
 * 与渲染层 tooltip「已达卷内最大容量」同口径）。
 */
export function nextChapterDefaultTitle(bookId: string, volumeId: number): string {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS count FROM chapters WHERE book_id = ? AND volume_id = ? AND deleted_at IS NULL AND kind = 'normal'"
    )
    .get(bookId, volumeId) as { count: number }
  if (row.count >= MAX_CHAPTERS_PER_VOLUME) return ''
  return `第${toChineseNumber(row.count + 1)}章`
}

/**
 * 单个特殊章的显示名：`specialPrefix`（前段，可空）+ 空格 + `title`（名段），
 * 缺段省略。普通章不适用（其显示名为名段，名空时回退「第X章」，见 `chapterLabel` 口径）。
 */
export function composeSpecialChapterLabel(specialPrefix: string | null, title: string): string {
  const parts: string[] = []
  if (specialPrefix !== null && specialPrefix !== '') parts.push(specialPrefix)
  if (title !== '') parts.push(title)
  return parts.join(' ')
}

/** 卷名归一化：非字符串 / 纯空白 → `''`（`title` 为 NOT NULL DEFAULT ''，不存 null）。 */
export function normalizeVolumeTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

import { coerceStatus } from './chapterStatus'
import { CHAPTER_COLUMNS, VOLUME_COLUMNS } from './chapterTypes'
import type { ChapterKind, ChapterPin, VolumeKind } from './chapterTypes'
import type { ChapterDbRow, ChapterRow, VolumeDbRow, VolumeRow } from './chapterTypes'

/**
 * 章节域行映射器（自 `chapters.ts` 拆出）：DB snake_case 行 → 领域对象，
 * 以及供回收站模块复用的 SQL 列片段别名。
 *
 * 判别列 `kind` 经 `coerceVolumeKind` / `coerceChapterKind` 归一化（DB 有 CHECK 守卫，
 * 归一化仅作防御，确保领域对象类型恒定、渲染层无需再判非法值）。
 */

/** 归一化 pin：仅 'top' / 'bottom' 合法，其余（含普通章的任何值）归 null。 */
function coercePin(value: string | null): ChapterPin | null {
  return value === 'top' || value === 'bottom' ? value : null
}

/** 归一化卷 kind：仅 'normal' / 'custom' / 'group' 合法，其余回退 `'normal'`。 */
export function coerceVolumeKind(value: unknown): VolumeKind {
  return value === 'custom' || value === 'group' ? value : 'normal'
}

/** 归一化章 kind：仅 'normal' / 'special' 合法，其余回退 `'normal'`。 */
export function coerceChapterKind(value: unknown): ChapterKind {
  return value === 'special' ? 'special' : 'normal'
}

/** 卷行 → 领域对象。`numberIndex` 需由调用方按上下文计算（基础值 0）。 */
export function toVolume(row: VolumeDbRow): VolumeRow {
  return {
    id: row.id,
    bookId: row.bookId,
    kind: coerceVolumeKind(row.kind),
    isUnfiled: row.is_unfiled === 1,
    title: row.title,
    sortOrder: row.sortOrder,
    numberIndex: 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt
  }
}

/** 章行 → 领域对象。`numberIndex` 需由调用方按上下文计算（基础值 0）。 */
export function toChapter(row: ChapterDbRow): ChapterRow {
  return {
    id: row.id,
    bookId: row.bookId,
    volumeId: row.volumeId,
    kind: coerceChapterKind(row.kind),
    title: row.title,
    specialPrefix: row.specialPrefix,
    sortOrder: row.sortOrder,
    status: coerceStatus(row.status),
    pin: coercePin(row.pin),
    numberIndex: 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt
  }
}

/** 卷列 SQL 片段别名，供回收站模块复用（`chapterTrash.ts`）。 */
export const VOLUME_SELECT = VOLUME_COLUMNS

/** 章列 SQL 片段别名，供回收站模块复用（`chapterTrash.ts`）。 */
export const CHAPTER_SELECT = CHAPTER_COLUMNS

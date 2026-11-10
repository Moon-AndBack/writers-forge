import type { ForeshadowRow } from './foreshadows'
import { FORESHADOW_COLUMNS } from './foreshadows'
import { getDb } from './index'

/**
 * 伏笔域**读路径**：列表 / 单条 / 锚点反查。
 *
 * 从 `foreshadows.ts` 拆出以满足「单文件 ≤500 行」（写路径：create / update / delete /
 * `attachForeshadowAnchor` 与锚点归一化仍留在 `foreshadows.ts`）；列投影
 * `FORESHADOW_COLUMNS` 由该文件导出复用，避免两份列清单漂移。
 *
 * **反查按槽位分别匹配**（语义固定后不再有「主 / 第二」交叉匹配）：
 * - 章节反查只查 `body_*`（正文埋点），命中槽位恒为 `body`；
 * - 大纲条目反查只查 `outline_*`（大纲埋点），命中槽位恒为 `outline`。
 * 回传 `slot` 是为了让标记层用同一套代码按槽位取快照字段（段落序号 / 原文摘录），
 * 不必按查询来源分支。
 */

/**
 * 锚点反查命中：`slot` 标明命中的是正文埋点（`body`，即 `body_*`）还是大纲埋点
 * （`outline`，即 `outline_*`）。
 */
export interface ForeshadowAnchorHit {
  row: ForeshadowRow
  slot: 'body' | 'outline'
}

/** 列出某书全部伏笔，按 `updated_at DESC, id DESC`。 */
export function listForeshadows(bookId: string): ForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE book_id = ?
       ORDER BY updated_at DESC, id DESC`
    )
    .all(bookId) as ForeshadowRow[]
}

/** 按 id 取单条伏笔；不存在返回 null。 */
export function getForeshadow(id: number): ForeshadowRow | null {
  const row = getDb()
    .prepare(`SELECT ${FORESHADOW_COLUMNS} FROM foreshadows WHERE id = ?`)
    .get(id) as ForeshadowRow | undefined
  return row ?? null
}

/**
 * 列出**正文埋点**锚定在某章的伏笔（供正文标记）：按段落序号（缺失按 -1 排前）、
 * id 升序；命中槽位恒为 `body`。
 */
export function listForeshadowsByChapter(chapterId: number): ForeshadowAnchorHit[] {
  const rows = getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE body_kind = 'chapter' AND body_chapter_id = ?
       ORDER BY body_paragraph_idx, id`
    )
    .all(chapterId) as ForeshadowRow[]
  return rows.map((row) => ({ row, slot: 'body' as const }))
}

/**
 * 列出**大纲埋点**锚定在某大纲条目的伏笔（供正文标记）：按 id 升序；
 * 命中槽位恒为 `outline`。
 */
export function listForeshadowsByOutlineItem(outlineItemId: number): ForeshadowAnchorHit[] {
  const rows = getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE outline_kind = 'outline' AND outline_item_id = ?
       ORDER BY id`
    )
    .all(outlineItemId) as ForeshadowRow[]
  return rows.map((row) => ({ row, slot: 'outline' as const }))
}

/**
 * 列出**回收点**锚定在某章的伏笔（供正文「回收处」标记）：
 * 按回收段落序号、id 升序。`status` 不在此过滤，由调用方按业务决定是否展示。
 */
export function listForeshadowsByRecoverAnchorChapter(chapterId: number): ForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE recover_chapter_id = ? AND recover_anchor_kind = 'chapter'
       ORDER BY recover_paragraph_idx, id`
    )
    .all(chapterId) as ForeshadowRow[]
}

/**
 * 列出**回收点**锚定在某大纲条目的伏笔（供正文「回收处」标记）：按 id 升序。
 * `status` 不在此过滤，由调用方按业务决定是否展示。
 */
export function listForeshadowsByRecoverAnchorOutlineItem(outlineItemId: number): ForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE recover_outline_item_id = ? AND recover_anchor_kind = 'outline'
       ORDER BY id`
    )
    .all(outlineItemId) as ForeshadowRow[]
}

import type Database from 'better-sqlite3'
import { getDb } from './index'
import {
  NOW,
  PLOT_SCENE_COLUMNS,
  nextSceneSortOrder,
  normalizeTimeEra,
  normalizeTimeYear,
  parseTimelineOrigin,
  resolveSceneDescription
} from './plotShared'
import type { CreatePlotSceneInput, PlotSceneRow, UpdatePlotScenePatch } from './plotShared'

/**
 * 剧情域 —— **场景节点**读写（自 `plot.ts` 的「场景：查询 / 写入」两节原样搬出）。
 *
 * 含按绝对年排序的列表、创建（缺省时间取剧情线默认 origin）、更新（正文双列同步）与软删除。
 */

/* ---------- 场景：查询 ---------- */

/**
 * 列出某书全部**未删除**场景，按**绝对年优先**排序（跨线聚合，同年一排由渲染层分组）：
 * 已定年升序（纪前负年 → 元年 0 → 纪后正年），未定年沉底；同年 / 未定年组内按 `sortOrder, id` 兜底。
 * 未定年 = 纪元未设置，或纪前 / 纪后缺年份（元年恒为已定年，年份忽略）。
 */
export function listPlotScenes(bookId: string): PlotSceneRow[] {
  const statement: Database.Statement<[string], PlotSceneRow> = getDb().prepare(
    `SELECT ${PLOT_SCENE_COLUMNS} FROM plot_scenes
     WHERE book_id = ? AND deleted_at IS NULL
     ORDER BY
      CASE WHEN (time_era = 'zero' OR (time_era IN ('bc', 'ad') AND time_year IS NOT NULL)) THEN 0 ELSE 1 END,
      CASE WHEN time_era = 'bc' THEN -time_year WHEN time_era = 'zero' THEN 0 WHEN time_era = 'ad' THEN time_year ELSE NULL END,
      sort_order, id`
  )
  return statement.all(bookId)
}

/* ---------- 场景：写入 ---------- */

/**
 * 创建场景：`lineId` 必填且须属该书；`input` 可选，缺省各字段取空。
 * 排序落地口径（二选一已定：**追加**）：`sort_order` 全书递增追加到末尾，不按年插入；
 * 展示按绝对年排序（见 `listPlotScenes`），`sort_order` 仅同年 / 未定年组内兜底。
 * 中栏「＋」缝按年分组定位，落库仍追加（按年插入待二期）。
 */
export function createPlotScene(
  bookId: string,
  lineId: number,
  input?: CreatePlotSceneInput
): PlotSceneRow {
  const db = getDb()
  const line = db.prepare("SELECT id, default_origin AS defaultOrigin FROM plot_lines WHERE id = ? AND book_id = ? AND deleted_at IS NULL").get(lineId, bookId) as { id: number; defaultOrigin: string | null } | undefined
  if (!line) throw new Error(`createPlotScene: 剧情线不存在（lineId=${lineId}）`)

  const hasTimeField = input?.timeText !== undefined || input?.timeEra !== undefined || input?.timeYear !== undefined || input?.timeDesc !== undefined
  let timeText = typeof input?.timeText === 'string' ? input.timeText : ''
  let timeEra = normalizeTimeEra(input?.timeEra)
  let timeYear = normalizeTimeYear(input?.timeYear)
  let timeDesc = typeof input?.timeDesc === 'string' ? input.timeDesc : ''
  if (!hasTimeField) {
    const p = parseTimelineOrigin(line.defaultOrigin ?? '')
    timeText = p.timeText; timeEra = p.timeEra; timeYear = p.timeYear; timeDesc = p.timeDesc
  }
  const title = typeof input?.title === 'string' ? input.title : ''
  // 正文两列恒同步：显式富文本优先，否则按纯文本包成富文本文档。
  const { descriptionJson, description } = resolveSceneDescription(
    input?.descriptionJson,
    typeof input?.description === 'string' ? input.description : ''
  )
  const result = db
    .prepare(
      'INSERT INTO plot_scenes (book_id, line_id, time_text, time_era, time_year, time_desc, title, description, description_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      bookId,
      lineId,
      timeText,
      timeEra,
      timeYear,
      timeDesc,
      title,
      description,
      descriptionJson,
      nextSceneSortOrder(bookId)
    )
  return db
    .prepare(`SELECT ${PLOT_SCENE_COLUMNS} FROM plot_scenes WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as PlotSceneRow
}

/** 更新场景：仅覆盖提供的字段，并刷新 `updated_at`；不存在返回 null。 */
export function updatePlotScene(id: number, patch: UpdatePlotScenePatch): PlotSceneRow | null {
  const db = getDb()
  return db.transaction((): PlotSceneRow | null => {
    const existing = db.prepare('SELECT id FROM plot_scenes WHERE id = ?').get(id) as
      { id: number } | undefined
    if (!existing) return null

    const sets: string[] = []
    const values: unknown[] = []
    if (patch.timeText !== undefined) {
      sets.push('time_text = ?')
      values.push(patch.timeText)
    }
    if (patch.timeEra !== undefined) {
      sets.push('time_era = ?')
      values.push(normalizeTimeEra(patch.timeEra))
    }
    if (patch.timeYear !== undefined) {
      sets.push('time_year = ?')
      values.push(normalizeTimeYear(patch.timeYear))
    }
    if (patch.timeDesc !== undefined) {
      sets.push('time_desc = ?')
      values.push(patch.timeDesc)
    }
    if (patch.title !== undefined) {
      sets.push('title = ?')
      values.push(patch.title)
    }
    // 正文两列恒同步：任一正文入参出现即同时写 `description_json` + `description`
    //（富文本优先；仅纯文本时按行包成富文本文档）。
    if (patch.descriptionJson !== undefined || patch.description !== undefined) {
      const resolved = resolveSceneDescription(patch.descriptionJson, patch.description ?? '')
      sets.push('description_json = ?', 'description = ?')
      values.push(resolved.descriptionJson, resolved.description)
    }
    if (sets.length > 0) {
      sets.push(`updated_at = ${NOW}`)
      db.prepare(`UPDATE plot_scenes SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    }
    return db
      .prepare(`SELECT ${PLOT_SCENE_COLUMNS} FROM plot_scenes WHERE id = ?`)
      .get(id) as PlotSceneRow
  })()
}

/** 软删除场景：置 `deleted_at`，**不物理删除**，便于日后回收站还原。 */
export function deletePlotScene(id: number): boolean {
  const db = getDb()
  const row = db.prepare('SELECT deleted_at AS deletedAt FROM plot_scenes WHERE id = ?').get(id) as
    { deletedAt: string | null } | undefined
  if (!row || row.deletedAt !== null) return false
  db.prepare(`UPDATE plot_scenes SET deleted_at = ${NOW} WHERE id = ?`).run(id)
  return true
}

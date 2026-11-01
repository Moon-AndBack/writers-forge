import type Database from 'better-sqlite3'
import { getDb } from './index'
import {
  DEFAULT_LINE_NAME,
  NOW,
  PLOT_LINE_COLUMNS,
  nextLineSortOrder,
  normalizePlotLineColor,
  normalizePlotLineType
} from './plotShared'
import type { CreatePlotLineOptions, PlotLineRow, UpdatePlotLinePatch } from './plotShared'

/**
 * 剧情域 —— **剧情线**读写（自 `plot.ts` 的「剧情线：查询 / 写入」两节原样搬出）。
 *
 * 含列表、创建、重命名 / 更新、软删除（级联软删其下未删除场景）与存量回填两式。
 */

/* ---------- 剧情线：查询 ---------- */

/** 列出某书全部**未删除**剧情线，按 `sortOrder, id`。 */
export function listPlotLines(bookId: string): PlotLineRow[] {
  const statement: Database.Statement<[string], PlotLineRow> = getDb().prepare(
    `SELECT ${PLOT_LINE_COLUMNS} FROM plot_lines
     WHERE book_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, id`
  )
  return statement.all(bookId)
}

/* ---------- 剧情线：写入 ---------- */

/** 创建剧情线（追加到该书末尾）。`name` 缺省 / 空白 → `DEFAULT_LINE_NAME`（空串，展示层兜底）；
 * `options` 缺省取默认类型 `'main'` + 默认首色，非法值同样回退默认。 */
export function createPlotLine(
  bookId: string,
  name?: string,
  options?: CreatePlotLineOptions
): PlotLineRow {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  const finalName = trimmed !== '' ? trimmed : DEFAULT_LINE_NAME
  const lineType = normalizePlotLineType(options?.lineType)
  const lineColor = normalizePlotLineColor(options?.lineColor)
  const timelineId =
    typeof options?.timelineId === 'string' && options.timelineId.trim() !== ''
      ? options.timelineId.trim()
      : 'default'
  const defaultOrigin =
    typeof options?.defaultOrigin === 'string' && options.defaultOrigin.trim() !== ''
      ? options.defaultOrigin.trim()
      : ''
  const db = getDb()
  const result = db
    .prepare(
      'INSERT INTO plot_lines (book_id, name, line_type, line_color, timeline_id, default_origin, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      bookId,
      finalName,
      lineType,
      lineColor,
      timelineId,
      defaultOrigin,
      nextLineSortOrder(bookId)
    )
  return db
    .prepare(`SELECT ${PLOT_LINE_COLUMNS} FROM plot_lines WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as PlotLineRow
}

/** 重命名剧情线；不存在返回 null（兼容保留，类型 / 颜色更新走 `updatePlotLine`）。 */
export function renamePlotLine(id: number, name: string): PlotLineRow | null {
  const db = getDb()
  const result = db.prepare('UPDATE plot_lines SET name = ? WHERE id = ?').run(name, id)
  if (Number(result.changes) === 0) return null
  return db
    .prepare(`SELECT ${PLOT_LINE_COLUMNS} FROM plot_lines WHERE id = ?`)
    .get(id) as PlotLineRow
}

/**
 * 更新剧情线（名称 / 类型 / 颜色）：仅覆盖提供的字段；不存在返回 null。
 * 通道二选一已定：**新增 `updatePlotLine` + `plot:updateLine`**（`renamePlotLine` 保留兼容）。
 */
export function updatePlotLine(id: number, patch: UpdatePlotLinePatch): PlotLineRow | null {
  const db = getDb()
  const sets: string[] = []
  const values: unknown[] = []
  if (typeof patch.name === 'string' && patch.name.trim() !== '') {
    sets.push('name = ?')
    values.push(patch.name.trim())
  }
  if (patch.lineType !== undefined) {
    sets.push('line_type = ?')
    values.push(normalizePlotLineType(patch.lineType))
  }
  if (patch.lineColor !== undefined) {
    sets.push('line_color = ?')
    values.push(normalizePlotLineColor(patch.lineColor))
  }
  if (sets.length === 0) {
    return (db.prepare(`SELECT ${PLOT_LINE_COLUMNS} FROM plot_lines WHERE id = ?`).get(id) ??
      null) as PlotLineRow | null
  }
  db.prepare(`UPDATE plot_lines SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  return (db.prepare(`SELECT ${PLOT_LINE_COLUMNS} FROM plot_lines WHERE id = ?`).get(id) ??
    null) as PlotLineRow | null
}

/**
 * 软删除剧情线：置 `deleted_at`，其下**未删除**场景一并软删除。
 * **不物理删除**，便于日后回收站还原。
 */
export function deletePlotLine(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare('SELECT deleted_at AS deletedAt FROM plot_lines WHERE id = ?')
      .get(id) as { deletedAt: string | null } | undefined
    if (!row || row.deletedAt !== null) return false
    db.prepare(`UPDATE plot_lines SET deleted_at = ${NOW} WHERE id = ?`).run(id)
    db.prepare(
      `UPDATE plot_scenes SET deleted_at = ${NOW} WHERE line_id = ? AND deleted_at IS NULL`
    ).run(id)
    return true
  })()
}

/**
 * 存量回填：某书剧情线中类型 / 颜色非法（NULL / 空串 / 非白名单）的行回填默认
 * （`'main'` + 首色）；已合法的行不改写。返回实际改写的行数。
 */
export function backfillPlotLineDefaults(bookId: string): number {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, line_type AS lineType, line_color AS lineColor FROM plot_lines WHERE book_id = ?'
    )
    .all(bookId) as Array<{ id: number; lineType: string | null; lineColor: string | null }>
  const rewrite = db.prepare('UPDATE plot_lines SET line_type = ?, line_color = ? WHERE id = ?')
  let updated = 0
  db.transaction(() => {
    for (const row of rows) {
      const lineType = normalizePlotLineType(row.lineType)
      const lineColor = normalizePlotLineColor(row.lineColor)
      if (row.lineType === lineType && row.lineColor === lineColor) continue
      rewrite.run(lineType, lineColor, row.id)
      updated += 1
    }
  })()
  return updated
}

export function backfillPlotLineTimeline(bookId: string): number {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT id, timeline_id AS timelineId, default_origin AS defaultOrigin FROM plot_lines WHERE book_id = ?'
    )
    .all(bookId) as Array<{ id: number; timelineId: string | null; defaultOrigin: string | null }>
  const rewrite = db.prepare(
    'UPDATE plot_lines SET timeline_id = ?, default_origin = ? WHERE id = ?'
  )
  let updated = 0
  db.transaction(() => {
    for (const row of rows) {
      const timelineId =
        typeof row.timelineId === 'string' && row.timelineId.trim() !== ''
          ? row.timelineId.trim()
          : 'default'
      const defaultOrigin =
        typeof row.defaultOrigin === 'string' && row.defaultOrigin.trim() !== ''
          ? row.defaultOrigin.trim()
          : ''
      if (row.timelineId === timelineId && row.defaultOrigin === defaultOrigin) continue
      rewrite.run(timelineId, defaultOrigin, row.id)
      updated += 1
    }
  })()
  return updated
}

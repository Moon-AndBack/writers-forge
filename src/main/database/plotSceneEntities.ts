import { getDb } from './index'
import type { WorldEntityType } from './worldEntityTypes'

/**
 * 剧情场景 ↔ 统一设定库实体（多对多连接表 `plot_scene_world_entities`）。
 *
 * 设计口径（对齐 `schema/plot.ts`）：
 * - **两端隔离**：`scene_id` → `plot_scenes`、`entity_id` → `world_entities`，均 `ON DELETE
 *   CASCADE`；删场景 / 物理删实体自动清理连接行；
 * - **与正文自动匹配互不影响**：本表只承载用户在「节点弹窗」里**手动勾选**的关联设定，
 *   正文匹配出的实体胶囊仍为实时计算、不落库；
 * - **同书约束**：只接受与该场景同书、未软删的实体；非法 id 在写入时静默丢弃，
 *   避免跨书串数据；
 * - **整体替换**：`setPlotSceneEntities` 以「先删后插」在单事务内完成，数组顺序即
 *   `sort_order`（`role` 为预留扩展位，本轮 UI 不编辑）。
 *
 * 读默认不过滤场景软删（连接行随软删保留，便于将来恢复）；写入前校验场景存在且未软删。
 */

/** 写入入参：实体 id 必填，`role` / `sortOrder` 可选（缺省 `''` / 数组下标）。 */
export interface PlotSceneEntityInput {
  entityId: number
  role?: string
  sortOrder?: number
}

/** 连接行（附带实体名 / 类型，供列表直接展示）。 */
export interface PlotSceneEntityRow {
  sceneId: number
  entityId: number
  role: string
  sortOrder: number
  entityName: string
  entityType: WorldEntityType
}

interface PlotSceneEntityDbRow {
  sceneId: number
  entityId: number
  role: string
  sortOrder: number
  entityName: string
  entityType: string
}

const SELECT_COLUMNS = `l.scene_id AS sceneId, l.entity_id AS entityId, l.role,
  l.sort_order AS sortOrder, e.name AS entityName, e.entity_type AS entityType`

/** 数据库行 → 领域行（实体类型非法值回退 `worldview`，与主表同口径）。 */
function toSceneEntityRow(row: PlotSceneEntityDbRow): PlotSceneEntityRow {
  return {
    sceneId: row.sceneId,
    entityId: row.entityId,
    role: row.role,
    sortOrder: row.sortOrder,
    entityName: row.entityName,
    entityType: row.entityType as WorldEntityType
  }
}

/** 读取某场景的关联设定（按 `sort_order` 升序）。 */
export function listPlotSceneEntities(sceneId: number): PlotSceneEntityRow[] {
  const rows = getDb()
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM plot_scene_world_entities l
       JOIN world_entities e ON e.id = l.entity_id
       WHERE l.scene_id = ? AND e.deleted_at IS NULL
       ORDER BY l.sort_order, l.entity_id`
    )
    .all(sceneId) as PlotSceneEntityDbRow[]
  return rows.map(toSceneEntityRow)
}

/**
 * 整体替换某场景的关联设定（单事务：先删后插）。
 *
 * - 场景不存在 / 已软删 → 返回 null（调用方据此提示失败）；
 * - 入参去重（保留首次出现的次序），并过滤非本书记录 / 已软删实体 / 非法 id；
 * - 返回写入后的连接行（顺序即数组顺序）。
 */
export function setPlotSceneEntities(
  sceneId: number,
  rows: readonly PlotSceneEntityInput[]
): PlotSceneEntityRow[] | null {
  const db = getDb()
  const scene = db
    .prepare('SELECT book_id AS bookId FROM plot_scenes WHERE id = ? AND deleted_at IS NULL')
    .get(sceneId) as { bookId: string } | undefined
  if (!scene) return null

  // 去重 + 只保留正整数 id（保留首次出现次序），并归一 role / sortOrder。
  const picked: Array<{ entityId: number; role: string; sortOrder: number }> = []
  const seen = new Set<number>()
  for (const row of rows) {
    if (!Number.isInteger(row.entityId) || row.entityId <= 0) continue
    if (seen.has(row.entityId)) continue
    seen.add(row.entityId)
    picked.push({
      entityId: row.entityId,
      role: row.role ?? '',
      sortOrder:
        typeof row.sortOrder === 'number' && Number.isInteger(row.sortOrder) && row.sortOrder >= 0
          ? row.sortOrder
          : picked.length
    })
  }

  // 同书、未软删的实体白名单（动态占位符，id 均为数值，拼接安全）。
  const valid = new Set<number>()
  if (picked.length > 0) {
    const placeholders = picked.map(() => '?').join(', ')
    const found = db
      .prepare(
        `SELECT id FROM world_entities
         WHERE book_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`
      )
      .all(scene.bookId, ...picked.map((row) => row.entityId)) as Array<{ id: number }>
    for (const row of found) valid.add(row.id)
  }

  db.transaction(() => {
    db.prepare('DELETE FROM plot_scene_world_entities WHERE scene_id = ?').run(sceneId)
    const insert = db.prepare(
      `INSERT INTO plot_scene_world_entities (scene_id, entity_id, role, sort_order)
       VALUES (?, ?, ?, ?)`
    )
    for (const row of picked) {
      if (!valid.has(row.entityId)) continue
      insert.run(sceneId, row.entityId, row.role, row.sortOrder)
    }
  })()

  return listPlotSceneEntities(sceneId)
}

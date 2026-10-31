import { getDb } from './index'
import { ITEM_GRADE_RANK_TABLES } from './schema/worldItemSubtypes'

/**
 * 统一设定库 · 物品品阶读写（第 3 批）。
 *
 * 背景：`world_item` 已下线，`grade`（等级显示标签）/ `rank`（0 起可比较档位）下沉到物品
 * 5 张预设子分类表（`schema/worldItemSubtypes.ts` 的 `ITEM_GRADE_RANK_TABLES`）。
 * 本模块是数据层唯一的品阶读写入口，供 `worldEntities.ts` 的列表 / 详情 / 写入复用：
 * - 只有 `entity_type = 'item'` 且子类 **`preset_key`** 命中上述 5 个预设键时才有品阶；
 * - 其余实体（含 `material` / 自定义子类 / 未分类 / 非物品）统一返回空串 + 0，写入为无操作。
 *
 * 表名取自固定常量映射（非用户输入），拼接安全。
 */

/** 品阶值（`grade` 为空串 / `rank` 为 0 表示未定级）。 */
export interface ItemGradeRank {
  grade: string
  rank: number
}

/** 未定级默认值（每次返回新对象，避免调用方误改共享引用）。 */
function emptyGradeRank(): ItemGradeRank {
  return { grade: '', rank: 0 }
}

/** 解析实体应读写的品阶子表（按 `world_subtypes.preset_key`）；不适用时返回 null。 */
function resolveTable(entityType: string, presetKey: string): string | null {
  if (entityType !== 'item') return null
  if (presetKey === '') return null
  return ITEM_GRADE_RANK_TABLES[presetKey] ?? null
}

/** 读取单个实体的品阶（无行 / 不适用时返回空串 + 0）。 */
export function loadGradeRank(
  entityType: string,
  presetKey: string,
  entityId: number
): ItemGradeRank {
  const table = resolveTable(entityType, presetKey)
  if (!table) return emptyGradeRank()
  const row = getDb()
    .prepare(`SELECT grade, rank FROM ${table} WHERE entity_id = ?`)
    .get(entityId) as ItemGradeRank | undefined
  return row ? { grade: row.grade, rank: row.rank } : emptyGradeRank()
}

/** 批量读取品阶（列表用）：按子表分组一次查完，未命中的实体不出现在返回 Map 中。 */
export function loadGradeRankMap(
  entries: ReadonlyArray<{ id: number; entityType: string; presetKey: string }>
): Map<number, ItemGradeRank> {
  const result = new Map<number, ItemGradeRank>()
  const groups = new Map<string, number[]>()
  for (const entry of entries) {
    const table = resolveTable(entry.entityType, entry.presetKey)
    if (!table) continue
    const ids = groups.get(table)
    if (ids) ids.push(entry.id)
    else groups.set(table, [entry.id])
  }
  for (const [table, ids] of groups) {
    const placeholders = ids.map(() => '?').join(', ')
    const rows = getDb()
      .prepare(
        `SELECT entity_id AS id, grade, rank FROM ${table} WHERE entity_id IN (${placeholders})`
      )
      .all(...ids) as Array<ItemGradeRank & { id: number }>
    for (const row of rows) {
      result.set(row.id, { grade: row.grade, rank: row.rank })
    }
  }
  return result
}

/**
 * 写入品阶：仅写补丁中出现的字段，并确保目标子表行存在（`INSERT OR IGNORE`）。
 * 不适用（非 item / 非 5 个预设子类 / 未分类）时静默忽略，与既有「类型不匹配即命中 0 行」同口径。
 */
export function writeGradeRank(
  entityType: string,
  entityId: number,
  presetKey: string,
  values: { grade?: string; rank?: number }
): void {
  const table = resolveTable(entityType, presetKey)
  if (!table) return
  const sets: string[] = []
  const params: Array<string | number> = []
  if (values.grade !== undefined) {
    sets.push('grade = ?')
    params.push(values.grade)
  }
  if (values.rank !== undefined) {
    sets.push('rank = ?')
    params.push(values.rank)
  }
  const db = getDb()
  db.prepare(`INSERT OR IGNORE INTO ${table} (entity_id) VALUES (?)`).run(entityId)
  if (sets.length === 0) return
  db.prepare(`UPDATE ${table} SET ${sets} WHERE entity_id = ?`).run(...params, entityId)
}

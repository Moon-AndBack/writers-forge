import { getDb } from './index'
import type { WorldPowerSystemRow } from './worldEntityTypes'

/**
 * 统一设定库 · 境界体系只读查询（`schema/worldPowers.ts`）。
 *
 * 第 6 批起境界体系只保留「体系」一张表：本文件只提供体系列表查询；
 * 体系信息（`kind`）的写入口见 `worldPowerWrites.ts`。
 *
 * 简介列已下线（见 `worldEntitiesDropSummary.ts`）：体系说明后续走正文，
 * 展示下一批接正文。
 */

/**
 * 列出某书全部境界体系（按实体 id）。
 *
 * 以主表为准 LEFT JOIN 体系子表：`entity_type = 'power_system'` 的实体会立即出现在列表中，
 * 体系子行（kind）可缺省，由首次编辑经 `updatePowerSystem` 补建。
 */
export function listPowerSystems(bookId: string): WorldPowerSystemRow[] {
  return getDb()
    .prepare(
      `SELECT e.id AS entityId, e.book_id AS bookId, e.name,
              COALESCE(st.name, '') AS subType,
              COALESCE(s.kind, '') AS kind
       FROM world_entities e
       LEFT JOIN world_subtypes st ON st.id = e.subtype_id
       LEFT JOIN world_power_system s ON s.entity_id = e.id
       WHERE e.book_id = ? AND e.entity_type = 'power_system'
         AND e.deleted_at IS NULL
       ORDER BY e.id`
    )
    .all(bookId) as WorldPowerSystemRow[]
}

import { getDb } from './index'
import { touchWorldEntity } from './worldEntityMeta'
import type { WorldPowerSystemRow } from './worldEntityTypes'

/**
 * 统一设定库 · 境界体系**写入口**（`schema/worldPowers.ts`）。
 *
 * 第 6 批起境界体系只保留「体系」一张表：本文件只负责体系子表（`world_power_system`）
 * 的 `kind` 写入；渠道 / 层级 / 晋升边 / 角色境界的读写入口已随表一并下线。
 *
 * 约定：
 * - `kind` 保持自由文本；
 * - 简介列已下线（见 `worldEntitiesDropSummary.ts`）：体系说明后续走正文，
 *   展示下一批接正文；
 * - 写入后 `touchWorldEntity(entityId)` 刷新主行版本签名，便于列表 / 缓存失效。
 */

/** 体系子表补丁（`kind` 为唯一可写字段）。 */
export interface WorldPowerSystemPatch {
  kind?: string
}

/** 体系子表补丁（`Update*` 命名别名，与 IPC / preload 命名一致）。 */
export type UpdateWorldPowerSystemPatch = WorldPowerSystemPatch

/** 境界体系实体是否存在（`entity_type = 'power_system'` + 未软删）。 */
function isPowerSystemEntity(entityId: number): boolean {
  return Boolean(
    getDb()
      .prepare(
        `SELECT 1 FROM world_entities
         WHERE id = ? AND entity_type = 'power_system' AND deleted_at IS NULL`
      )
      .get(entityId)
  )
}

/**
 * 确保体系子行存在（调用方负责事务边界）。
 *
 * 主表插入触发器和历史数据都可能缺子行；kind 写入口统一先补建，避免
 * `UPDATE` 命中 0 行静默丢失。
 */
export function ensurePowerSystemRow(entityId: number): void {
  getDb()
    .prepare(`INSERT OR IGNORE INTO world_power_system (entity_id, kind) VALUES (?, '')`)
    .run(entityId)
}

/**
 * 写入体系类型（`world_power_system.kind`，调用方负责事务边界）。
 *
 * 供通用实体更新（`updateWorldEntity` 的 `powerKind` 补丁）与
 * `updatePowerSystem` 共用，避免两份写 SQL。
 */
export function writePowerSystemKind(entityId: number, kind: string): void {
  ensurePowerSystemRow(entityId)
  getDb()
    .prepare('UPDATE world_power_system SET kind = @kind WHERE entity_id = @entityId')
    .run({ kind, entityId })
}

/** 读取体系行（无子行时 kind 为空串）。 */
function getPowerSystemRow(entityId: number): WorldPowerSystemRow | null {
  const row = getDb()
    .prepare(
      `SELECT s.entity_id AS entityId, e.book_id AS bookId, e.name,
              COALESCE(st.name, '') AS subType, COALESCE(s.kind, '') AS kind
       FROM world_power_system s
       JOIN world_entities e ON e.id = s.entity_id
       LEFT JOIN world_subtypes st ON st.id = e.subtype_id
       WHERE s.entity_id = ? AND e.deleted_at IS NULL`
    )
    .get(entityId) as WorldPowerSystemRow | undefined
  return row ?? null
}

/** 更新体系类型（`kind`）；子行不存在时先补建。 */
export function updatePowerSystem(
  entityId: number,
  patch: WorldPowerSystemPatch
): WorldPowerSystemRow | null {
  if (!isPowerSystemEntity(entityId)) return null
  const db = getDb()
  db.transaction(() => {
    if (patch.kind !== undefined) {
      writePowerSystemKind(entityId, patch.kind)
    } else {
      ensurePowerSystemRow(entityId)
    }
    touchWorldEntity(entityId)
  })()
  return getPowerSystemRow(entityId)
}

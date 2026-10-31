import type { ExpectedTable } from './expected'

/**
 * 设计结构真源 · **境界体系**分片（`schema/worldPowers.ts`）。
 *
 * 第 6 批起境界体系只保留「体系」1 张表（无命名索引）：渠道 / 层级 / 晋升边 /
 * 角色境界 4 表已下线。简介列已下线（见 `../worldEntitiesDropSummary.ts`），
 * 本表仅含 `entity_id` / `kind`。
 * 改动 DDL 时两侧逐字同步。
 */

/** 境界体系 1 表（列顺序无关，仅做集合比对）。 */
export const EXPECTED_POWER_TABLES: readonly ExpectedTable[] = [
  {
    name: 'world_power_system',
    columns: ['entity_id', 'kind']
  }
]

/** 境界体系索引：0（单表无命名索引）。 */
export const EXPECTED_POWER_INDEXES: readonly string[] = []

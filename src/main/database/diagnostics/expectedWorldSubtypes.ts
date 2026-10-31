import type { ExpectedTable } from './expected'

/**
 * 设计结构真源 · **子类分类表**分片（`schema/worldSubtypes.ts`）。
 *
 * `world_subtypes` 为「书 → 实体类型 → 子类」的分类真源，软删除；
 * 第 4 批起 `world_entities.subtype_id` 外键指向本表（主表已无文本子类列）。
 * 由 `./expected` 汇总为 `EXPECTED_TABLES` / `EXPECTED_INDEXES`，改动 DDL 时两侧逐字同步。
 */
export const EXPECTED_WORLD_SUBTYPE_TABLES: readonly ExpectedTable[] = [
  {
    name: 'world_subtypes',
    columns: [
      'id',
      'book_id',
      'entity_type',
      'name',
      'is_custom',
      'preset_key',
      'sort_order',
      'created_at',
      'updated_at',
      'deleted_at'
    ]
  }
]

/** `world_subtypes` 命名索引（按书 + 实体类型查询）。 */
export const EXPECTED_WORLD_SUBTYPE_INDEXES: readonly string[] = [
  'idx_world_subtypes_book_type'
]

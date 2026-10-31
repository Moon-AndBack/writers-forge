import type { ExpectedTable } from './expected'

/**
 * 设计结构真源 · **世界观六种子类专属子表**分片（`schema/worldWorldviewSubtypes.ts`，批 K1）。
 *
 * 6 张一对一子表（主键 = world_entities.id），字段均为 TEXT NOT NULL DEFAULT ''。
 * 由 `./expected` 汇总为 `EXPECTED_TABLES`。改动 DDL 时两侧逐字同步。
 */
export const EXPECTED_WORLDVIEW_SUBTYPE_TABLES: readonly ExpectedTable[] = [
  {
    name: 'world_overview',
    columns: ['entity_id', 'era', 'scale', 'population', 'epoch']
  },
  {
    name: 'world_geography',
    columns: ['entity_id', 'coordinates', 'climate', 'area', 'terrain']
  },
  {
    name: 'world_culture',
    columns: ['entity_id', 'language', 'customs', 'religion', 'art']
  },
  {
    name: 'world_race',
    columns: ['entity_id', 'lifespan', 'body_size', 'reproduction', 'habits']
  },
  {
    name: 'world_economy',
    columns: ['entity_id', 'currency', 'tax_rate', 'trade_routes', 'resources']
  },
  {
    name: 'world_ruleset',
    columns: ['entity_id', 'physics', 'magic', 'taboo', 'boundary']
  }
]
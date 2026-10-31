import type { ExpectedTable } from './expected'

/**
 * 设计结构真源 · **物品功法 / 势力子类专属子表**分片（`schema/worldItemSubtypes.ts` /
 * `schema/worldFactionSubtypes.ts`，批 L1）。
 *
 * 12 张一对一子表 + 通用自定义表 `world_custom`（第 5 批起为键值行式：一实体多行，
 * 主键 = (`entity_id`, `field_key`)）。子表字段均为 TEXT NOT NULL DEFAULT ''。
 * 由 `./expected` 汇总为 `EXPECTED_TABLES`。
 * 第 3 批：物品前 5 张预设子表新增 `grade TEXT` / `rank INTEGER`（品阶从 `world_item` 下沉；
 * `world_material` 用自身 `grade_label`，不加列）。改动 DDL 时两侧逐字同步。
 */
export const EXPECTED_ITEM_SUBTYPE_TABLES: readonly ExpectedTable[] = [
  {
    name: 'world_weapon',
    columns: ['entity_id', 'attack', 'durability', 'weight', 'material', 'grade', 'rank']
  },
  {
    name: 'world_skill',
    columns: ['entity_id', 'tier', 'practice', 'cost', 'requirement', 'grade', 'rank']
  },
  {
    name: 'world_pill',
    columns: ['entity_id', 'effect', 'side_effect', 'difficulty', 'shelf_life', 'grade', 'rank']
  },
  {
    name: 'world_talent',
    columns: [
      'entity_id',
      'talent_type',
      'awaken_condition',
      'growth',
      'limitation',
      'grade',
      'rank'
    ]
  },
  {
    name: 'world_equipment',
    columns: ['entity_id', 'defense', 'slot', 'set_bonus', 'durability', 'grade', 'rank']
  },
  {
    name: 'world_material',
    columns: ['entity_id', 'usage', 'grade_label', 'origin', 'reserve']
  }
]

/** 用户自定义类型通用表（`schema/worldCustom.ts`，第 5 批键值行式）。 */
export const EXPECTED_CUSTOM_TABLES: readonly ExpectedTable[] = [
  {
    name: 'world_custom',
    columns: ['entity_id', 'field_key', 'field_value', 'sort_order']
  }
]

/** `world_custom` 命名索引（1：按实体取全部键值行）。 */
export const EXPECTED_CUSTOM_INDEXES: readonly string[] = ['idx_world_custom_entity']

export const EXPECTED_FACTION_SUBTYPE_TABLES: readonly ExpectedTable[] = [
  {
    name: 'world_sect',
    columns: ['entity_id', 'gate', 'disciples', 'heritage', 'precepts']
  },
  {
    name: 'world_family',
    columns: ['entity_id', 'patriarch', 'family_rules', 'bloodline', 'ancestral_teaching']
  },
  {
    name: 'world_dynasty',
    columns: ['entity_id', 'territory', 'law', 'army', 'capital']
  },
  {
    name: 'world_guild',
    columns: ['entity_id', 'business', 'funds', 'branches', 'reputation']
  },
  {
    name: 'world_alliance',
    columns: ['entity_id', 'form', 'members', 'goal', 'freedom']
  },
  {
    name: 'world_demonic',
    columns: ['entity_id', 'doctrine', 'ritual', 'taboo', 'sphere']
  }
]

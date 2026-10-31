import type Database from 'better-sqlite3'

/**
 * 一次性迁移（第 6 批）：下线境界专表 + 零消费专用关系表 + 零消费明细表。
 *
 * 背景：`CREATE TABLE IF NOT EXISTS` 不会删表，老库会残留已下线结构，导致
 * `diagnostics/expected.ts` 严格相等比对报 `structure.extraTable` / `structure.extraIndex`。
 * 用户已确认这些表**零消费、无需保留数据**，故直接物理删除。
 *
 * 清单（22 张）：
 * - 境界体系 4 张：`world_power_paths` / `world_power_tiers` /
 *   `world_power_transitions` / `world_character_powers`（保留 `world_power_system`）；
 * - 专用关系 15 张（`schema/worldRelations.ts` 已整体删除）；
 * - 明细 3 张：`world_denominations` / `world_classes` / `world_rules`
 *   （当时保留的工具表 `world_forbidden_words` / `world_substitutions` 已改由
 *   `schema/cleanWords.ts` 的 `migrateDropLegacyWordTables` 下线，不在本文件清理范围）。
 *
 * 顺序：子表 → 父表（降低外键级联噪音）；`IF EXISTS` 保证新库首启与重复执行为空操作。
 * 幂等：settings 键 `world:tablesDropDown:v1` 守卫（只执行一次），事务包裹、失败回滚。
 * 仅删固定白名单表名（非用户输入），拼接安全。
 */
const WORLD_TABLES_DROP_KEY = 'world:tablesDropDown:v1'

/** 待下线表（子表在前；`world_ruleset` 不在清单内，禁止误删）。 */
const DROPPED_WORLD_TABLES: readonly string[] = [
  // 境界体系（保留 world_power_system）
  'world_power_transitions',
  'world_character_powers',
  'world_power_tiers',
  'world_power_paths',
  // 专用关系（15）
  'world_geo_control',
  'world_geo_population',
  'world_race_relations',
  'world_institution_scope',
  'world_institution_executor',
  'world_culture_scope',
  'world_currency_issue',
  'world_currency_circulation',
  'world_exchange_rate',
  'world_faction_member',
  'world_faction_relations',
  'world_faction_secret',
  'world_character_relations',
  'world_character_talents',
  'world_item_ownership',
  // 明细（3；world_forbidden_words / world_substitutions 已由 schema/cleanWords.ts
  // 的 migrateDropLegacyWordTables 下线，不在本清单内）
  'world_denominations',
  'world_classes',
  'world_rules'
]

/** 执行下线（幂等）。 */
export function migrateWorldTablesDropDown(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(WORLD_TABLES_DROP_KEY)
  if (done) return

  instance.transaction(() => {
    for (const table of DROPPED_WORLD_TABLES) {
      instance.exec(`DROP TABLE IF EXISTS ${table}`)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(WORLD_TABLES_DROP_KEY)
  })()
}

import type Database from 'better-sqlite3'

// 自 `database/index.ts` 拆出（仅搬运，守卫键 / SQL / 逻辑未改动），供 `getDb()` 装配调用。

/** 一次性迁移守卫键：旧设定档案四域表下线（DROP）。 */
const LEGACY_DOSSIER_DROP_KEY = 'dossier:dropLegacyTables:v1'

/**
 * 旧设定档案四域（已被统一设定库取代）的表清单：先子表、后主表。
 * 用户已确认**无需迁移旧数据**，故直接物理删除；旧数据仅存在于这些表中。
 */
const LEGACY_DOSSIER_TABLES: readonly string[] = [
  'worldview_relations',
  'worldview_aliases',
  'worldviews',
  'character_relations',
  'character_aliases',
  'characters',
  'faction_relations',
  'faction_aliases',
  'factions',
  'item_relations',
  'item_aliases',
  // `items.type_id` 外键指向 `item_types`，须先删子表再删字典表，否则外键拦截 DROP。
  'items',
  'item_types'
]

/**
 * 一次性迁移：`DROP TABLE` 下线旧设定档案四域（`worldviews` / `characters` / `factions`
 * / `items` 及各自别名 / 关系表，另含 `item_types`）。
 *
 * 背景：统一设定库（`world_entities` 体系）已成为唯一设定数据源，旧四域的表 / 数据层 /
 * IPC / 渲染路径已全部移除；`CREATE TABLE IF NOT EXISTS` 不会删表，故此处显式收敛老库结构，
 * 否则自检会把残留表记为 `structure.extraTable`。用户已确认无需保留旧数据。
 *
 * 幂等：以 settings 键 `dossier:dropLegacyTables:v1` 守卫（只执行一次），`DROP TABLE IF
 * EXISTS` 本身也幂等；整体事务包裹，任一步失败即回滚且不置键，下次启动自动重试。
 * 只删固定白名单表名（非用户输入），拼接安全。
 */
export function migrateDropLegacyDossierTables(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(LEGACY_DOSSIER_DROP_KEY)
  if (done) return

  instance.transaction(() => {
    for (const table of LEGACY_DOSSIER_TABLES) {
      instance.exec(`DROP TABLE IF EXISTS ${table}`)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(LEGACY_DOSSIER_DROP_KEY)
  })()
}

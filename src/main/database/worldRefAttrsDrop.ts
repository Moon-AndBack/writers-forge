import type Database from 'better-sqlite3'

// 自 `database/index.ts` 拆出（仅搬运，守卫键 / SQL / 逻辑未改动），供 `getDb()` 装配调用。

/** 一次性迁移守卫键：关系属性表下线（`world_ref_attrs` DROP）。 */
const WORLD_REF_ATTRS_DROP_KEY = 'worldRefs:dropAttrs:v1'

/**
 * 一次性迁移：`DROP TABLE` 下线关系属性表（`world_ref_attrs`）。
 *
 * 背景：关系属性已由「备注」字段取代，表 / 数据层 / IPC / 渲染路径全部移除；
 * `CREATE TABLE IF NOT EXISTS` 不会删表，故此处显式收敛老库结构，否则自检会把
 * 残留表 / 索引记为 `structure.extraTable` / `structure.extraIndex`。
 * 用户已确认属性数据无需保留。
 *
 * 幂等：以 settings 键 `worldRefs:dropAttrs:v1` 守卫（只执行一次），`DROP TABLE IF
 * EXISTS` 本身也幂等；整体事务包裹，任一步失败即回滚且不置键，下次启动自动重试。
 * 须在 `world_refs` 建表之后、`migrateWorldRefsHierarchy` 之前调用（后者不再触碰本表）。
 */
export function migrateDropWorldRefAttrs(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(WORLD_REF_ATTRS_DROP_KEY)
  if (done) return

  instance.transaction(() => {
    instance.exec('DROP TABLE IF EXISTS world_ref_attrs')
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(WORLD_REF_ATTRS_DROP_KEY)
  })()
}

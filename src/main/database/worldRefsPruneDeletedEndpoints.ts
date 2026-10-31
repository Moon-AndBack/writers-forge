import type Database from 'better-sqlite3'

/**
 * 一次性迁移：清理端点为「已软删实体」的关联行（历史脏数据）。
 *
 * 背景：`deleteWorldEntity` 长期只置 `world_entities.deleted_at`（软删），不清关联行，
 * 导致老库积累了大量一端 / 两端为已软删实体的关系行。读路径虽已按活实体过滤，但这些
 * 脏行仍占存储、干扰统计与后续校验，故此处一次性物理清理。
 *
 * 步骤（同一事务）：
 * 1. `DELETE FROM world_refs` —— 删除 `from_id` 或 `to_id` 指向已软删实体的关系行；
 * 2. `DELETE FROM plot_scene_world_entities` —— 删除 `entity_id` 指向已软删实体的
 *    场景关联行。
 *
 * 幂等：settings 键 `worldRefs:pruneDeletedEndpoints:v1` 守卫（只执行一次）；事务包裹，
 * 任一步失败即回滚且不置键，下次启动自动重试。
 *
 * 表容错：目标表用 `sqlite_master` 探测，不存在则跳过对应 DELETE（很老的库可能尚无
 * `plot_scene_world_entities` / `world_refs`），不因此让整个迁移失败。
 *
 * 边界：只清理上述两张关联表；`world_entity_tags` / `world_aliases` / `world_texts` 等
 * 随实体保留是有意设计（读取时按活实体 id 取，无脏数据问题），不在本迁移范围。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，在 `createWorldEntitiesSchema`
 *（建 `world_entities` / `world_refs`）与 `createPlotSchema`（建
 * `plot_scene_world_entities`）之后，紧随 `migrateWorldRefsHierarchy`（同域迁移归拢）。
 */
const PRUNE_DELETED_ENDPOINTS_KEY = 'worldRefs:pruneDeletedEndpoints:v1'

/** 已软删实体的 id 子查询（两端共用）。 */
const SOFT_DELETED_ENTITY_IDS = 'SELECT id FROM world_entities WHERE deleted_at IS NOT NULL'

/** 实测某表是否存在。 */
function hasTable(instance: Database.Database, table: string): boolean {
  const row = instance
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
  return row !== undefined
}

/** 写入迁移守卫键（迁移内直读写，避免重入 `getDb()`）。 */
function markMigrationDone(instance: Database.Database): void {
  instance
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(PRUNE_DELETED_ENDPOINTS_KEY)
}

/** 执行清理（幂等）。 */
export function migrateWorldRefsPruneDeletedEndpoints(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(PRUNE_DELETED_ENDPOINTS_KEY)
  if (done) return

  instance.transaction(() => {
    // 表结构探测与清理同事务：探测只读，缺失表时跳过而非中断迁移。
    if (hasTable(instance, 'world_refs')) {
      instance.exec(`
        DELETE FROM world_refs
        WHERE from_id IN (${SOFT_DELETED_ENTITY_IDS})
           OR to_id   IN (${SOFT_DELETED_ENTITY_IDS})
      `)
    }

    if (hasTable(instance, 'plot_scene_world_entities')) {
      instance.exec(`
        DELETE FROM plot_scene_world_entities
        WHERE entity_id IN (${SOFT_DELETED_ENTITY_IDS})
      `)
    }

    markMigrationDone(instance)
  })()
}

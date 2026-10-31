import type Database from 'better-sqlite3'
import { derivePlainText } from './richText'

/**
 * 一次性重算：派生纯文本列按**块级分隔**口径回填（实体卡片 / 剧情卡片）。
 *
 * 背景：提交 `d2c3d4c` 把派生纯文本规则从「所有文本直接拼接、无分隔符」改为
 * 「块级之间插入 `\n`」，渲染层同步按 `\n` 拆段（`DossierCard` 的 `body.split('\n')`、
 * `SceneCard` 的 `description.split('\n')`），但**存量行的派生列未重算** —— 老卡片
 * 整篇粘成一段。本模块以真源 JSON 重算派生列，恢复段落边界。
 *
 * 与既有迁移方向相反，**不得复用**其守卫键：
 * - `worldTextsBodyJsonBackfill`（`world_texts:bodyJson:v1`）：`body → body_json`
 * - `migratePlotSceneDescriptionRich`（`plot:descriptionRich:v1`）：`description → description_json`
 * 本模块方向为 `body_json → body` / `description_json → description`。
 *
 * 三道防护（均逐行生效）：
 * 1. 只处理真源列非空的行（查询条件已限制）；
 * 2. 派生结果为空串（非法 JSON / 空文档）→ **跳过，不覆盖原值**，避免脏数据清空正文；
 * 3. 派生结果与原值相同 → 跳过，减少无谓写入。
 *
 * 幂等：各自 settings 键守卫，只执行一次；整体单事务包裹，任一步失败即回滚且不置键，
 * 下次启动自动重试。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，须分别在 `migrateWorldTextsBodyJson` /
 * `migratePlotSceneDescriptionRich` **之后**（否则真源 JSON 尚未由老纯文本补齐）。
 */

/** 实体卡片派生列重算守卫键。 */
const WORLD_TEXTS_BODY_BLOCKS_KEY = 'world_texts:bodyBlocks:v1'

/** 剧情卡片派生列重算守卫键。 */
const PLOT_DESCRIPTION_BLOCKS_KEY = 'plot:descriptionBlocks:v1'

/** 置位守卫键（与守卫键同事务：任一失败整体回滚，键不落库）。 */
function markDone(instance: Database.Database, key: string): void {
  instance
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key)
}

/**
 * 重算 `world_texts.body`（实体卡片派生纯文本）：块级之间以 `\n` 分隔。
 * 真源为 `body_json`；派生函数 `derivePlainText`（块间插 `\n` 的现行口径）。
 */
export function migrateWorldTextsBodyBlocks(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(WORLD_TEXTS_BODY_BLOCKS_KEY)
  if (done) return

  instance.transaction(() => {
    const rows = instance
      .prepare(
        "SELECT entity_id AS entityId, body, body_json AS bodyJson FROM world_texts WHERE body_json <> ''"
      )
      .all() as Array<{ entityId: number; body: string; bodyJson: string }>
    const rewrite = instance.prepare('UPDATE world_texts SET body = ? WHERE entity_id = ?')

    for (const row of rows) {
      const next = derivePlainText(row.bodyJson)
      if (next === '') continue
      if (next === row.body) continue
      rewrite.run(next, row.entityId)
    }
    markDone(instance, WORLD_TEXTS_BODY_BLOCKS_KEY)
  })()
}

/**
 * 重算 `plot_scenes.description`（剧情卡片派生纯文本）：块级之间以 `\n` 分隔。
 * 真源为 `description_json`；派生函数 `derivePlainText`（与 `resolveSceneDescription` 同口径）。
 */
export function migratePlotSceneDescriptionBlocks(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(PLOT_DESCRIPTION_BLOCKS_KEY)
  if (done) return

  instance.transaction(() => {
    const rows = instance
      .prepare(
        'SELECT id, description, description_json AS descriptionJson FROM plot_scenes ' +
          "WHERE description_json IS NOT NULL AND description_json <> ''"
      )
      .all() as Array<{ id: number; description: string; descriptionJson: string }>
    const rewrite = instance.prepare('UPDATE plot_scenes SET description = ? WHERE id = ?')

    for (const row of rows) {
      const next = derivePlainText(row.descriptionJson)
      if (next === '') continue
      if (next === row.description) continue
      rewrite.run(next, row.id)
    }
    markDone(instance, PLOT_DESCRIPTION_BLOCKS_KEY)
  })()
}

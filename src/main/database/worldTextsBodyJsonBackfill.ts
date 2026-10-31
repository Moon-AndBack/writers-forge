import type Database from 'better-sqlite3'
import { plainTextToDocJson } from './richText'

/**
 * 一次性回填：`world_texts.body`（纯文本摘要）→ `world_texts.body_json`（块级 Tiptap JSON）。
 *
 * 背景：富文本正文列 `body_json` 由 `schema/worldEntities.ts` 幂等补列，但历史行与新种子
 * 早期只写 `body`（纯文本）。若不回填，富文本编辑器打开为空，保存后旧正文会被覆盖。
 *
 * - **范围**：仅 `body_json = '' AND body <> ''` 的行（尚未富文本化、纯文本非空）；
 *   已富文本的行与空正文行不动；`body` 列**保持原样**（派生纯文本摘要口径不变）。
 * - **转换**：`plainTextToDocJson`（按行拆 `paragraph`；空行生成无 `content` 的空段落）；
 *   转换结果为空串（纯空白正文）时跳过，避免落非法 / 空 JSON。
 * - **幂等**：以 settings 键 `world_texts:bodyJson:v1` 守卫，只执行一次；整体事务包裹，
 *   任一步失败即回滚且不置键，下次启动自动重试。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，须在 `world_texts` 建表（含 `body_json`
 * 补列）之后、统一设定库种子之前。
 */

/** 一次性回填守卫键。 */
const BODY_JSON_BACKFILL_KEY = 'world_texts:bodyJson:v1'

/** 回填全部历史纯文本正文的富文本 JSON（幂等、事务、失败回滚）。 */
export function migrateWorldTextsBodyJson(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(BODY_JSON_BACKFILL_KEY)
  if (done) return

  const rows = instance
    .prepare(
      "SELECT entity_id AS entityId, body FROM world_texts WHERE body_json = '' AND body <> ''"
    )
    .all() as Array<{ entityId: number; body: string }>
  const rewrite = instance.prepare('UPDATE world_texts SET body_json = ? WHERE entity_id = ?')

  instance.transaction(() => {
    for (const row of rows) {
      const json = plainTextToDocJson(row.body)
      if (json !== '') rewrite.run(json, row.entityId)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(BODY_JSON_BACKFILL_KEY)
  })()
}

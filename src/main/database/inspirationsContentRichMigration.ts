import type Database from 'better-sqlite3'
import { plainTextToDocJson } from '../../shared/richTextDoc'

/** 一次性迁移守卫键：灵感正文富文本化（`content` 纯文本 → `content_json`）。 */
const INSPIRATIONS_CONTENT_RICH_KEY = 'inspirations:contentRich:v1'

/**
 * 一次性迁移：把既有纯文本 `content`（灵感正文旧数据）包成**合法富文本文档**
 * 写入新增列 `content_json`（与剧情场景 / 伏笔描述同口径：整条块级 Tiptap JSON，
 * `NULL` = 空正文 / 尚未富文本化）。
 *
 * - **范围**：仅 `content_json IS NULL AND content <> ''` 的行（纯文本非空、尚未
 *   富文本化）；已富文本 / 空正文的行不动；`content` 列本身保留为**派生纯文本摘要**，
 *   不改写、不删除。
 * - **幂等**：以 settings 键 `inspirations:contentRich:v1` 守卫，只执行一次；整体事务
 *   包裹，任一步失败即回滚且不置键，下次启动自动重试。重复执行时行集合为空，不改数据。
 * - **非破坏**：不删列、不改列类型 / 语义；迁移后旧纯文本仍可正常显示（卡片摘要读
 *   `content`）。
 * - **空正文保持 `NULL`**：`content` 为空白串时 `plainTextToDocJson` 返回 `''`（不是合法
 *   文档），此处跳过写入，让该行维持 `NULL`，对齐「空正文 = NULL」不变式。
 * - 须在 `createInspirationsSchema`（建表 + `ensureColumn` 补齐 `content_json`）之后调用。
 */
export function migrateInspirationContentRich(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(INSPIRATIONS_CONTENT_RICH_KEY)
  if (done) return

  const rows = instance
    .prepare("SELECT id, content FROM inspirations WHERE content_json IS NULL AND content <> ''")
    .all() as Array<{ id: number; content: string }>
  const rewrite = instance.prepare('UPDATE inspirations SET content_json = ? WHERE id = ?')

  instance.transaction(() => {
    for (const row of rows) {
      const json = plainTextToDocJson(row.content)
      // 空白内容 → `''`（非合法文档）：跳过，保持 `NULL`（空正文口径）。
      if (json === '') continue
      rewrite.run(json, row.id)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(INSPIRATIONS_CONTENT_RICH_KEY)
  })()
}

import type Database from 'better-sqlite3'
import { plainTextToDocJson } from '../../shared/richTextDoc'

/** 一次性迁移守卫键：伏笔描述富文本化（`description` 纯文本 → `description_json`）。 */
const FORESHADOWS_DESCRIPTION_RICH_KEY = 'foreshadows:descriptionRich:v1'

/**
 * 一次性迁移：把既有纯文本 `description`（伏笔描述旧数据）包成**合法富文本文档**
 * 写入新增列 `description_json`（与剧情场景 / 大纲正文同口径：整条块级 Tiptap JSON，
 * `NULL` = 空正文 / 尚未富文本化）。
 *
 * - **范围**：仅 `description_json IS NULL AND description <> ''` 的行（纯文本非空、尚未
 *   富文本化）；已富文本 / 空正文的行不动；`description` 列本身保留为**派生纯文本摘要**，
 *   不改写、不删除。
 * - **幂等**：以 settings 键 `foreshadows:descriptionRich:v1` 守卫，只执行一次；整体事务
 *   包裹，任一步失败即回滚且不置键，下次启动自动重试。重复执行时行集合为空，不改数据。
 * - **非破坏**：不删列、不改列类型 / 语义；迁移后旧纯文本仍可正常显示（卡片摘要读
 *   `description`）。
 * - **空正文保持 `NULL`**：`description` 为空白串时 `plainTextToDocJson` 返回 `''`（不是合法
 *   文档），此处跳过写入，让该行维持 `NULL`，对齐「空正文 = NULL」不变式。
 * - 须在 `createForeshadowsSchema`（建表 + `ensureColumn` 补齐 `description_json`）之后调用。
 */
export function migrateForeshadowDescriptionRich(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(FORESHADOWS_DESCRIPTION_RICH_KEY)
  if (done) return

  const rows = instance
    .prepare(
      "SELECT id, description FROM foreshadows WHERE description_json IS NULL AND description <> ''"
    )
    .all() as Array<{ id: number; description: string }>
  const rewrite = instance.prepare('UPDATE foreshadows SET description_json = ? WHERE id = ?')

  instance.transaction(() => {
    for (const row of rows) {
      const json = plainTextToDocJson(row.description)
      // 空白说明 → `''`（非合法文档）：跳过，保持 `NULL`（空正文口径）。
      if (json === '') continue
      rewrite.run(json, row.id)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(FORESHADOWS_DESCRIPTION_RICH_KEY)
  })()
}

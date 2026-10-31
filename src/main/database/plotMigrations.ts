import type Database from 'better-sqlite3'
import { wrapPlainTextToDoc } from './richText'

// 自 `database/index.ts` 拆出（仅搬运，守卫键 / SQL / 逻辑未改动），供 `getDb()` 装配调用。

/** 一次性迁移守卫键：剧情场景正文富文本化（`description` 纯文本 → `description_json`）。 */
const PLOT_DESCRIPTION_RICH_KEY = 'plot:descriptionRich:v1'

/** 一次性迁移守卫键：剧情场景删列（`characters` 出场人物 JSON）。 */
const PLOT_DROP_CHARACTERS_KEY = 'plot:dropCharacters:v1'

/** 一次性迁移守卫键：剧情线时间线归属（`timeline_id` / `default_origin`）。 */
const PLOT_LINE_TIMELINE_KEY = 'plot:lineTimeline:v1'

/**
 * 一次性迁移：把既有纯文本 `description`（剧情场景正文旧数据）包成**合法富文本文档**
 * 写入新增列 `description_json`（与大纲正文同口径：整条块级 Tiptap JSON，`NULL` = 空正文）。
 *
 * - **范围**：仅 `description_json IS NULL AND description <> ''` 的行（纯文本非空、尚未富文本化）；
 *   已富文本 / 空正文的行不动；`description` 列本身保留为**派生纯文本摘要**，不改写、不删除。
 * - **幂等**：以 settings 键 `plot:descriptionRich:v1` 守卫，只执行一次；整体事务包裹，
 *   任一步失败即回滚且不置键，下次启动自动重试。
 * - **非破坏**：不删列、不改列类型 / 语义；迁移后旧纯文本仍可正常显示（卡片摘要读 `description`）。
 * - 须在 `createPlotSchema`（补齐 `description_json` 列）之后调用。
 */
export function migratePlotSceneDescriptionRich(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(PLOT_DESCRIPTION_RICH_KEY)
  if (done) return

  const rows = instance
    .prepare(
      "SELECT id, description FROM plot_scenes WHERE description_json IS NULL AND description <> ''"
    )
    .all() as Array<{ id: number; description: string }>
  const rewrite = instance.prepare('UPDATE plot_scenes SET description_json = ? WHERE id = ?')

  instance.transaction(() => {
    for (const row of rows) {
      const json = wrapPlainTextToDoc(row.description)
      if (json !== null) rewrite.run(json, row.id)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(PLOT_DESCRIPTION_RICH_KEY)
  })()
}

/**
 * 一次性迁移：`DROP COLUMN` 删除 `plot_scenes.characters`（出场人物 JSON）。
 *
 * 背景：出场实体改为「剧情正文自动匹配实体生成胶囊」（实时、不落库），该列已从建表 DDL
 * 移除，但 `CREATE TABLE IF NOT EXISTS` 对老表既不补列也不删列，故此处显式收敛结构。
 * 仅当 `PRAGMA table_info` 探测到列仍存在时才执行，并以 settings 键 `plot:dropCharacters:v1`
 * 守卫幂等（只执行一次）；整体事务包裹，任一步失败即回滚、不置守卫键，下次启动自动重试。
 * 该列既非主键、无索引、也未被外键引用，`DROP COLUMN` 安全。
 */
export function migratePlotScenesDropCharacters(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(PLOT_DROP_CHARACTERS_KEY)
  if (done) return

  const existing = new Set(
    (instance.prepare('PRAGMA table_info(plot_scenes)').all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  )

  instance.transaction(() => {
    if (existing.has('characters')) {
      instance.exec('ALTER TABLE plot_scenes DROP COLUMN characters')
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(PLOT_DROP_CHARACTERS_KEY)
  })()
}

/**
 * 一次性迁移：剧情线时间线归属列 `timeline_id` / `default_origin`（幂等、事务、失败回滚）。
 *
 * 背景：两列由 `schema/plot.ts` 的 `ensureColumn` 幂等补列（含 DEFAULT）；老库已有行在
 * `ADD COLUMN` 时自动取默认值。`default_origin` 默认值已改为空串（中文默认起点不下沉数据层），
 * 空值即合法值，故不再回填；此处仅归一 `timeline_id` 空值并置守卫标记。
 * 整体事务包裹，任一步失败即回滚且不置守卫键，下次启动自动重试。
 */
export function migratePlotLinesTimeline(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(PLOT_LINE_TIMELINE_KEY)
  if (done) return

  instance.transaction(() => {
    instance
      .prepare("UPDATE plot_lines SET timeline_id = 'default' WHERE timeline_id IS NULL OR timeline_id = ''")
      .run()
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(PLOT_LINE_TIMELINE_KEY)
  })()
}

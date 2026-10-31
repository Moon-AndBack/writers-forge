import type Database from 'better-sqlite3'
import { ensurePresetSubtypes } from './worldSubtypes'

// 自 `database/index.ts` 拆出（仅搬运，守卫键 / SQL / 逻辑未改动），供 `getDb()` 装配调用。

/** 一次性种子守卫键：既有书籍的预设子类分类回填（23 条 / 书）。 */
const WORLD_SUBTYPES_PRESET_KEY = 'worldSubtypes:presets:v1'

/**
 * 一次性回填：为**已存在的所有书籍**补齐 23 条预设子类分类（`world_subtypes`）。
 *
 * 背景：新建书籍由 `createBook` 直接调用 `ensurePresetSubtypes`；老库既有书籍在升级到
 * 本批时也需要同一份预设，故在启动装配时统一补一次。`ensurePresetSubtypes` 为
 * `INSERT OR IGNORE` 语义（按书 + 类型 + 名称去重），不会复活用户已软删的预设行。
 *
 * 幂等：以 settings 键 `worldSubtypes:presets:v1` 守卫（只执行一次）；事务包裹，
 * 任一步失败即回滚且不置键，下次启动自动重试。
 */
export function seedWorldSubtypePresetsOnce(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(WORLD_SUBTYPES_PRESET_KEY)
  if (done) return

  instance.transaction(() => {
    const books = instance.prepare('SELECT id FROM books').all() as Array<{ id: string }>
    for (const book of books) {
      ensurePresetSubtypes(book.id)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(WORLD_SUBTYPES_PRESET_KEY)
  })()
}

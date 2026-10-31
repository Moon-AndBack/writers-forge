import type Database from 'better-sqlite3'
import { PRESET_WORLD_SUBTYPES } from './worldSubtypes'

/**
 * 一次性迁移：角色子类由单条「角色」拆分为 主角 / 配角 / 龙套 / 反派 四类。
 *
 * 背景：第 4 批起 `world_subtypes` 是子类唯一真源，角色只有一条预设分类
 * （`preset_key = 'character'`），界面因此不显示类别选择器。本批恢复角色类别选择，
 * 预设分类改为四条（`character-lead` / `character-support` / `character-extra` /
 * `character-villain`），老库需同步收敛：
 *
 * 1. **确保四条分类存在**：逐书按 `(book_id, entity_type, name)` upsert。若老库
 *    已存在同名**自定义**分类（历史上 demo 种子把「主角」建成了自定义类），
 *    就地升级为预设（`is_custom = 0`、写入 `preset_key`、校正排序并复活软删行），
 *    避免唯一键挡住预设、又留下一个可被删除的「伪预设」。
 * 2. **实体重映射**：所有 `entity_type = 'character'` 且 `subtype_id` 指向旧
 *    「角色」分类的实体（含已软删行）一律改指「主角」。
 * 3. **下线旧分类**：物理删除旧预设行（`is_custom = 0 AND preset_key = 'character'`）；
 *    引用已在第 2 步全部改指，剩余异常引用由外键 `ON DELETE SET NULL` 兜底。
 *
 * 幂等：settings 键 `worldSubtypes:characterSplit:v1` 守卫，整体事务包裹；任一步失败
 * 即回滚且不置键，下次启动自动重试。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，在 `migrateWorldEntitiesDropSubTypeText`
 * （`subtype_id` 已回填、`sub_type` 文本列已删除）之后、demo 种子与
 * `seedWorldSubtypePresetsOnce` 之前。
 */

/** 一次性迁移守卫键。 */
const CHARACTER_SPLIT_KEY = 'worldSubtypes:characterSplit:v1'

/** 旧「角色」预设分类的路由键。 */
const LEGACY_CHARACTER_PRESET_KEY = 'character'

/** 新的四条角色预设分类（顺序即下拉顺序）。 */
const CHARACTER_PRESETS = PRESET_WORLD_SUBTYPES.filter(
  (preset) => preset.entityType === 'character'
)

/** 时间戳：毫秒精度，对齐 `worldSubtypes.ts` 写法。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** 写入迁移守卫键（迁移内直读写，避免重入 `getDb()`）。 */
function markMigrationDone(instance: Database.Database): void {
  instance
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(CHARACTER_SPLIT_KEY)
}

/**
 * 确保某书四条角色分类存在（同名自定义类就地升级为预设）。
 *
 * `ON CONFLICT` 命中同名行时更新为预设口径：这样老库中 demo 种子建出的自定义
 * 「主角」不会让 `INSERT OR IGNORE` 静默失败，实体也能继续挂在该分类下。
 */
function ensureCharacterPresets(instance: Database.Database, bookId: string): void {
  const upsert = instance.prepare(
    `INSERT INTO world_subtypes
       (book_id, entity_type, name, is_custom, preset_key, sort_order)
     VALUES (?, 'character', ?, 0, ?, ?)
     ON CONFLICT(book_id, entity_type, name) DO UPDATE SET
       is_custom = 0,
       preset_key = excluded.preset_key,
       sort_order = excluded.sort_order,
       deleted_at = NULL,
       updated_at = ${NOW}`
  )
  for (const preset of CHARACTER_PRESETS) {
    upsert.run(bookId, preset.name, preset.presetKey, preset.sortOrder)
  }
}

/** 读取某书「主角」分类 id（上一步已确保存在）。 */
function findLeadSubtypeId(instance: Database.Database, bookId: string): number | null {
  const row = instance
    .prepare(
      `SELECT id FROM world_subtypes
       WHERE book_id = ? AND entity_type = 'character'
         AND preset_key = 'character-lead' AND deleted_at IS NULL
       ORDER BY id LIMIT 1`
    )
    .get(bookId) as { id: number } | undefined
  return row?.id ?? null
}

/**
 * 重映射某书角色实体并下线旧「角色」分类。
 *
 * 旧分类按 `preset_key = 'character' AND is_custom = 0` 识别（不受名称改名 / 软删影响）；
 * 实体更新不过滤 `deleted_at`，确保回收站中的角色也不会留下悬空引用。
 */
function remapCharacters(instance: Database.Database, bookId: string): void {
  const leadId = findLeadSubtypeId(instance, bookId)
  if (leadId === null) return

  const legacyRows = instance
    .prepare(
      `SELECT id FROM world_subtypes
       WHERE book_id = ? AND entity_type = 'character'
         AND is_custom = 0 AND preset_key = ?`
    )
    .all(bookId, LEGACY_CHARACTER_PRESET_KEY) as Array<{ id: number }>
  if (legacyRows.length === 0) return

  const remap = instance.prepare(
    `UPDATE world_entities SET subtype_id = ?
     WHERE book_id = ? AND entity_type = 'character' AND subtype_id = ?`
  )
  const removeLegacy = instance.prepare('DELETE FROM world_subtypes WHERE id = ?')

  for (const legacy of legacyRows) {
    if (legacy.id === leadId) continue
    remap.run(leadId, bookId, legacy.id)
    removeLegacy.run(legacy.id)
  }
}

/** 执行迁移（幂等）。 */
export function migrateWorldSubtypeCharacterSplit(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(CHARACTER_SPLIT_KEY)
  if (done) return

  instance.transaction(() => {
    const books = instance.prepare('SELECT id FROM books').all() as Array<{ id: string }>
    for (const book of books) {
      ensureCharacterPresets(instance, book.id)
      remapCharacters(instance, book.id)
    }
    markMigrationDone(instance)
  })()
}

import type Database from 'better-sqlite3'

// 自 `database/index.ts` 拆出的一次性存量清理（与 plotMigrations.ts 同风格），供 `getDb()` 装配调用。

/** 一次性迁移守卫键：存量中文默认值清理（时间线名 / 起点 / 剧情线名 / 场景时间）。 */
const I18N_DEFAULTS_CLEANUP_KEY = 'i18n:defaultsCleanup:v1'

/** 时间线列表 settings 键前缀（与 `timeline.ts` 的 `timelineListKey` 同口径，此处不引用以避免循环依赖）。 */
const TIMELINE_LIST_PREFIX = 'timeline:list:'

/** settings 行（时间线列表 JSON）。 */
interface SettingRow {
  key: string
  value: string
}

/**
 * 清洗单个时间线列表 JSON：仅把**精确等于**中文默认值的条目字段置空。
 *
 * - `name === '主时间线'` → `''`
 * - `origin === '元年'` → `''`
 *
 * 其余字段 / 条目 / 非数组 / 非法 JSON 原样保留（返回 `null` 表示无需改写）。
 * 不做模糊匹配（如「主时间线 2」不受影响）。
 */
function cleanTimelineListJson(raw: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  let changed = false
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    if (entry.name === '主时间线') {
      entry.name = ''
      changed = true
    }
    if (entry.origin === '元年') {
      entry.origin = ''
      changed = true
    }
  }
  return changed ? JSON.stringify(parsed) : null
}

/**
 * 一次性迁移：清理**存量数据库**中已落库的中文默认值（展示层已改走 i18n 兜底，
 * 写入侧自本批起落空串，但老库里的旧值仍在，会导致英文界面显示中文）。
 *
 * 清理范围（只匹配精确值，不做模糊匹配）：
 * 1. settings `timeline:list:<bookId>` JSON 数组：`name === '主时间线'` → `''`；
 *    `origin === '元年'` → `''`（`timeline:active:<bookId>` 不含名称，不处理）；
 * 2. `plot_lines`：`name = '新剧情线'` → `''`；`default_origin = '元年'` → `''`；
 * 3. `plot_scenes`：`time_text = '元年' AND time_era = 'zero'` → `time_text = ''`；
 *    `time_text = '时间未定'` → `''`；`time_desc = '时间未定'` → `''`；
 * 4. `books`：仅当 `PRAGMA table_info` 探测到存在 `default_origin` 列时才清 `'元年'`
 *    （当前 schema 无此列，属防御性分支，不为未来猜测建列）。
 *
 * - **幂等**：以 settings 键 `i18n:defaultsCleanup:v1` 守卫，只执行一次；已执行直接返回。
 * - **事务**：全部 UPDATE 与守卫键写入在同一事务内，任一语句失败整体回滚且不置键，
 *   下次启动自动重试；事务内不做 JSON 解析等易抛错逻辑（解析在事务前完成）。
 * - **不改 schema**：仅数据清理，列默认值已在上游批次改为空串。
 * - 须在 `createPlotSchema`（表已建）、种子与 `migrateAllTimelines`（时间线列表已物化）之后调用。
 */
export function migrateI18nChineseDefaults(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(I18N_DEFAULTS_CLEANUP_KEY)
  if (done) return

  // 时间线列表：只读取，JSON 解析与改写决定在事务外完成（避免事务内抛错）。
  const timelineRows = instance
    .prepare('SELECT key, value FROM settings WHERE key LIKE ?')
    .all(`${TIMELINE_LIST_PREFIX}%`) as SettingRow[]
  const timelineWrites: Array<{ key: string; value: string }> = []
  for (const row of timelineRows) {
    const cleaned = cleanTimelineListJson(row.value)
    if (cleaned !== null) timelineWrites.push({ key: row.key, value: cleaned })
  }

  // books 是否真的存在 `default_origin` 列：运行期探测，不臆测列名。
  const bookColumns = new Set(
    (instance.prepare('PRAGMA table_info(books)').all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  )

  instance.transaction(() => {
    const updateSetting = instance.prepare(
      "UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?"
    )
    for (const item of timelineWrites) {
      updateSetting.run(item.value, item.key)
    }

    instance.prepare("UPDATE plot_lines SET name = '' WHERE name = '新剧情线'").run()
    instance
      .prepare("UPDATE plot_lines SET default_origin = '' WHERE default_origin = '元年'")
      .run()

    instance
      .prepare(
        "UPDATE plot_scenes SET time_text = '' WHERE time_text = '元年' AND time_era = 'zero'"
      )
      .run()
    instance.prepare("UPDATE plot_scenes SET time_text = '' WHERE time_text = '时间未定'").run()
    instance.prepare("UPDATE plot_scenes SET time_desc = '' WHERE time_desc = '时间未定'").run()

    if (bookColumns.has('default_origin')) {
      instance
        .prepare("UPDATE books SET default_origin = '' WHERE default_origin = '元年'")
        .run()
    }

    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(I18N_DEFAULTS_CLEANUP_KEY)
  })()
}

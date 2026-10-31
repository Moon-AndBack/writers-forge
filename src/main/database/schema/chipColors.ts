import type Database from 'better-sqlite3'

/**
 * 胶囊配色 schema（`chip_colors`）。
 *
 * 背景：设定库卡片 / 列表上的胶囊标签原为 CSS 硬编码配色（`chip-preset-colors.css` /
 * `chip-pill-tokens.css` 混色派生）。改为**数据库存储 + 实色底 + 配对文字色**后，
 * 每行即「一个胶囊色对」（`bg` 实色底 + `fg` 配对文字色），渲染层按
 * （模块, 预设子类键）或（模块, 自定义分类）查表直接取值，不再做 color-mix 派生。
 *
 * `scope` 语义（二选一）：
 * - `'preset'`：某个**预设子类**的配色，`preset_key` 为预设路由键（如 `weapon`），
 *   与该实体的 `world_subtypes.preset_key` 对齐；
 * - `'module'`：该**模块自定义分类**的兜底配色，`preset_key` 恒为空串（未命中任何预设
 *   子类时使用，即用户自建分类）。
 *
 * 约束：`UNIQUE (scope, module, preset_key)` —— 同一模块下每个预设键 / 模块兜底各只有
 * 一行，故种子可用 `INSERT OR IGNORE` 幂等补齐且不覆盖用户改色（见 `../chipColors.ts`）。
 * 该唯一约束由 SQLite 生成隐式索引（`sqlite_autoindex_*`），**不**属于命名索引，
 * 无需登记 `diagnostics/expected.ts` 的 `EXPECTED_INDEXES`。
 */
export function createChipColorSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chip_colors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL CHECK (scope IN ('preset', 'module')),
      module TEXT NOT NULL CHECK (module IN ('worldview', 'character', 'item', 'faction', 'power_system')),
      preset_key TEXT NOT NULL DEFAULT '',
      bg TEXT NOT NULL,
      fg TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (scope, module, preset_key)
    )
  `)
}

import type Database from 'better-sqlite3'

/**
 * 灵感域 schema：`inspirations`（碎片速记 + 轻量标签）。
 *
 * 设计要点：
 * - **按书隔离**：`book_id` 外键 `books(id) ON DELETE CASCADE`（`books.id` 为 TEXT，
 *   与其余域表一致）；
 * - **正文双列**：`content_json` 是**富文本真源**（整条块级 Tiptap JSON，
 *   `NULL` = 尚未富文本化 / 空正文）；`content` 退化为**派生纯文本摘要**（卡片摘要 /
 *   搜索 / AI 上下文读它，块级之间以 `\n` 分隔）。与 `plot_scenes` / `foreshadows`
 *   的 `description` + `description_json` 同范式。两列由写入口径恒同步
 *   （由 JSON 派生摘要）；老库的纯文本正文由 `inspirationsContentRichMigration.ts`
 *   一次性回填 `content_json`，`content` 不改写；
 * - **标签存 JSON 数组字符串**（`tags TEXT NOT NULL DEFAULT '[]'`）而非关联表：
 *   灵感属个人碎片，单书量级在几十到几百条、单条标签 1–5 个；标签只用于「按标签
 *   筛选」，不需要全局标签去重 / 重命名传播 / 计数统计。JSON 单列写入原子、无 join、
 *   无额外两表与级联清理成本；按标签查询用 SQLite 内置 JSON1 的 `json_each()` 即可
 *   （`database/inspirations.ts` 的 `listInspirations` / `listInspirationTags`）。
 *   若将来出现「标签管理页 / 跨书标签统计」需求，再迁移为 `tags` + `inspiration_tags`
 *   关联表（届时用一次性迁移回填，读侧接口保持不变）；
 * - **物理删除**：删除直接删整行（无回收站）；`deleted_at TEXT` 列保留仅作历史兼容，
 *   业务不再写入；
 * - **排序**：列表按 `updated_at DESC, id DESC`（最近编辑优先），建
 *   `(book_id, updated_at)` 索引支撑；
 * - 幂等建表（`CREATE ... IF NOT EXISTS`）。
 */
export function createInspirationsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inspirations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      -- 富文本真源（整条块级 Tiptap JSON）；content 保留为派生纯文本摘要
      -- （卡片摘要 / 搜索 / AI 上下文），两列同写：新数据由 JSON 派生摘要，
      -- 老数据由一次性迁移回填本列（见 inspirationsContentRichMigration.ts）。
      content_json TEXT,
      -- JSON 数组字符串；CHECK 兜底拒绝坏 JSON（读侧仍做防御，兼容手改库 / 历史脏数据）。
      tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      -- 历史兼容列：回收站已下线（删除改为物理删），业务不再写入。
      deleted_at TEXT,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)

  // 幂等补列：老库 `inspirations` 补富文本列 `content_json`（纯增量 `ADD COLUMN`，保留既有行）。
  // `content` 为派生纯文本摘要，本列为整条块级 Tiptap JSON，NULL = 尚未富文本化
  // （读侧由 `content` 兜底），回填见 `inspirationsContentRichMigration.ts`。
  ensureColumn(db, 'inspirations', 'content_json', 'TEXT')

  // 索引：按书取列表（含标签筛选）/ 按最近编辑排序。
  // `deleted_at` 列保留仅作历史兼容（业务不再写入），索引沿用旧定义以兼容老库。
  db.exec('CREATE INDEX IF NOT EXISTS idx_inspirations_book ON inspirations(book_id, deleted_at)')
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_inspirations_updated ON inspirations(book_id, updated_at)'
  )
}

/** 检测表是否已有某列，缺失才 `ADD COLUMN`（幂等补列，不破坏既有数据；对齐 `schema/plot.ts`）。 */
function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (columns.some((item) => item.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

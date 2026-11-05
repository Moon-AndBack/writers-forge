import type Database from 'better-sqlite3'

/**
 * 灵感域 schema：`inspirations`（碎片速记 + 轻量标签）。
 *
 * 设计要点：
 * - **按书隔离**：`book_id` 外键 `books(id) ON DELETE CASCADE`（`books.id` 为 TEXT，
 *   与其余域表一致）；
 * - **纯文本正文**：`content` 即真源（多行纯文本）。灵感是「一句话 / 一段碎片」的
 *   速记场景，不需要富文本编辑、实体高亮或派生摘要列；不上 `content_json` 双列可
 *   避免空功能背上 JSON 解析 / 迁移成本。将来确需富文本时，再按 `plot_scenes` 的
 *   `description` + `description_json` 双列范式增量补列即可；
 * - **标签存 JSON 数组字符串**（`tags TEXT NOT NULL DEFAULT '[]'`）而非关联表：
 *   灵感属个人碎片，单书量级在几十到几百条、单条标签 1–5 个；标签只用于「按标签
 *   筛选」，不需要全局标签去重 / 重命名传播 / 计数统计。JSON 单列写入原子、无 join、
 *   无额外两表与级联清理成本；按标签查询用 SQLite 内置 JSON1 的 `json_each()` 即可
 *   （`database/inspirations.ts` 的 `listInspirations` / `listInspirationTags`）。
 *   若将来出现「标签管理页 / 跨书标签统计」需求，再迁移为 `tags` + `inspiration_tags`
 *   关联表（届时用一次性迁移回填，读侧接口保持不变）；
 * - **软删除 / 回收站**：`deleted_at TEXT`（NULL = 未删除），与其它域表口径一致；
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
      -- JSON 数组字符串；CHECK 兜底拒绝坏 JSON（读侧仍做防御，兼容手改库 / 历史脏数据）。
      tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)

  // 索引：按书取未删除列表（含标签筛选）/ 按最近编辑排序。
  db.exec('CREATE INDEX IF NOT EXISTS idx_inspirations_book ON inspirations(book_id, deleted_at)')
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_inspirations_updated ON inspirations(book_id, updated_at)'
  )
}

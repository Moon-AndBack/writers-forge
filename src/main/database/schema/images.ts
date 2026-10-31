import type Database from 'better-sqlite3'

/**
 * 图片资源 schema：`images`（大纲正文内嵌图片的二进制真源）。
 *
 * 设计要点：
 * - **二进制独立存表**，不进 `outline_items.content_json`：正文 JSON 里只存**图片 id**，
 *   避免 base64 撑爆正文 JSON（体积 +33% 且每次读正文都要搬运全量 base64）；
 * - 按书隔离：`book_id` 外键 ON DELETE CASCADE，删书联动删除该书全部图片
 *   （与 `volumes` / `chapters` / `outline_items` / `plot_*` 等全部内容域同模式）；
 * - `mime` 为白名单枚举（`image/png` / `image/jpeg` / `image/webp` / `image/gif`），
 *   由数据层校验（见 `database/images.ts`），不落 SQL CHECK；
 * - `bytes` 冗余记录二进制长度（校验 20 MB 上限 + 免读 BLOB 即可展示体积）；
 * - **无软删除 / 无回收站**：图片是「被正文引用的资源」而非用户可见实体，
 *   删除走物理删除（本批暂无 GC，悬空 id 由正文渲染层容忍为缺图占位）；
 * - 幂等建表（`CREATE ... IF NOT EXISTS`），老库在 `getDb()` 首次打开时补齐，无数据回填。
 */
export function createImagesSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)

  // 索引：按书取图片列表（回收 / 审计用）；正文按 id 逐张取，走主键。
  db.exec('CREATE INDEX IF NOT EXISTS idx_images_book ON images(book_id, id)')
}

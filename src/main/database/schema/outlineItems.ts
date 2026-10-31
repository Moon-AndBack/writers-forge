import type Database from 'better-sqlite3'

/**
 * 大纲域 schema：`outline_items`（大纲条目），取代旧 `outline_chapters`（结构全新，无迁移）。
 *
 * 设计要点：
 * - **复用章节域 `volumes` 卷池**（统一卷模型）：大纲页不自建卷表；普通卷 / 自定义卷
 *   （`kind IN ('normal','custom')`）在两域都可见，`kind='group'` 的分组卷**仅大纲页可见**；
 * - **分组不是本表的 kind**：分组 = `volumes.kind='group'` 的一行，其下大纲条目 =
 *   本表中 `volume_id = 该分组 id AND kind='entry' AND scope='entry'` 的行。
 *   本表**没有 `kind='group'`、也没有 `parent_id`**，层级仅两层；
 * - `kind`：`standalone` = 单项条目（不挂卷，列表置顶，`volume_id IS NULL`）、
 *   `entry` = 卷下条目（`volume_id` 非空）。表级 CHECK 强制二者与 `volume_id` 一致；
 * - `scope`：`entry` = 普通大纲条目（参与排序）、`volume` = **卷级大纲正文行**（某卷的卷纲，
 *   固定 `sort_order=0`，**不参与条目排序**；表级 CHECK 强制其必挂卷）；
 * - **每卷至多一条卷级大纲行**：部分唯一索引 `idx_outline_items_volume_scope` 强制
 *   （「卷是否有卷纲」以本表卷纲行是否存在为判据，不再由 `volumes` 镜像列表达）；
 * - `text` = 纯文本摘要（**字数统计与搜索的真源，强制保留**）；`content_json` = 整条大纲
 *   正文的块级 JSON（TEXT，非 JSONB），`CHECK (content_json IS NULL OR json_valid(...))`
 *   守卫合法性，NULL = 尚未写入正文的空条目；
 * - 按书隔离：`book_id` 外键 ON DELETE CASCADE；复合外键
 *   `(book_id, volume_id) REFERENCES volumes(book_id, id)` 保证条目与卷严格同书；
 * - **软删除 / 回收站**：`deleted_at TEXT`（NULL = 未删除）；
 * - 幂等建表（`CREATE ... IF NOT EXISTS`），**不写任何一次性迁移**
 *   （用户手动删库，新库直建）。
 */
export function createOutlineItemsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outline_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      volume_id INTEGER,
      kind TEXT NOT NULL CHECK (kind IN ('standalone', 'entry')),
      scope TEXT NOT NULL DEFAULT 'entry' CHECK (scope IN ('entry', 'volume')),
      title TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      text TEXT NOT NULL DEFAULT '',
      content_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      CHECK (content_json IS NULL OR json_valid(content_json)),
      CHECK ((kind = 'entry' AND volume_id IS NOT NULL) OR (kind = 'standalone' AND volume_id IS NULL)),
      CHECK (scope = 'entry' OR volume_id IS NOT NULL),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id, volume_id) REFERENCES volumes(book_id, id) ON DELETE CASCADE
    )
  `)

  // 索引：大纲树主查询 / 按卷取条目 / 置顶独立区 / 回收站 / 每卷至多一条卷级大纲行。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outline_items_book
      ON outline_items(book_id, kind, sort_order, id) WHERE deleted_at IS NULL
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outline_items_volume
      ON outline_items(volume_id, sort_order, id) WHERE deleted_at IS NULL
  `)
  // 置顶独立区：不挂卷的 standalone 条目（volume_id IS NULL）。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outline_items_standalone
      ON outline_items(book_id, sort_order, id) WHERE volume_id IS NULL AND deleted_at IS NULL
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outline_items_trash
      ON outline_items(book_id) WHERE deleted_at IS NOT NULL
  `)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_outline_items_volume_scope
      ON outline_items(volume_id) WHERE scope = 'volume' AND deleted_at IS NULL
  `)
}

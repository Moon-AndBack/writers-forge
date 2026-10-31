import type Database from 'better-sqlite3'

/**
 * 章节域 schema：`volumes`（卷）+ `chapters`（章）两表（结构全新，无迁移）。
 *
 * 设计要点：
 * - **卷按 kind 三分**（判别列 `kind`，CHECK 守卫）：
 *   `normal` = 正文卷（参与「卷X」自动编号）、`custom` = 自定义卷（整名，不编号）、
 *   `group` = 分组容器（**仅大纲页可见**，章节页不可见，其下不能挂章节）；
 *   大纲条目挂在分组卷下的语义见 `schema/outlineItems.ts`；
 * - `volumes.title` 即完整卷名（普通卷的自动编号由渲染层按 `kind='normal'` 的序号拼出，
 *   库内只存用户可见名）；`sort_order` **仅在 `(book_id, kind)` 内有意义**，不同 kind
 *   各自分离的序号空间；
 * - **每卷必有一条卷纲行**：建卷即在同一事务内插入 `outline_items` 的 `scope='volume'`
 *   行（卷纲正文，见 `volumes.insertVolumeOutlineRow`），由 `outline_items` 的部分唯一索引
 *   `idx_outline_items_volume_scope` 保证「每卷至多一条」；**该事实不由本表镜像**——旧
 *   `volumes.has_outline` 列已删除，「卷是否有卷纲」一律以卷纲行是否存在为判据；
 * - **复合唯一键 `UNIQUE (book_id, id)`**：供 `chapters` / `outline_items` 的复合外键引用，
 *   保证子行的 `book_id` 与父卷 `book_id` 严格同书（跨书挂载被外键拒绝）；
 * - **`chapters.volume_id` NOT NULL**：每章必属一卷，外键 `ON DELETE CASCADE`
 *   （卷被物理删除时其下章物理删除；常规删卷走软删除，不触发）；
 * - **章名拆列**：`title` 存**名段**（普通章 = 自定义名，可空），`special_prefix` 存特殊章
 *   前段（如「序章」「楔子」「番外」，用户自由文本），普通章恒 NULL；显示名由渲染层拼接；
 * - `chapters.kind`：`normal` = 普通章（参与「第X章」编号）、`special` = 特殊章（前段由
 *   `special_prefix` 给，不参与「第X章」计数）；
 * - **特殊章置顶 / 置底**：`pin TEXT CHECK (pin IS NULL OR pin IN ('top','bottom'))`，
 *   表级 `CHECK (kind = 'special' OR pin IS NULL)` 保证**仅特殊章可置顶**；
 * - `status` 两态（`draft` 草稿 / `done` 定稿），默认 `draft`；
 * - **软删除 / 回收站**：两表均有 `deleted_at TEXT`（NULL = 未删除）；
 * - 全部 `CREATE ... IF NOT EXISTS`，幂等；**不写任何一次性迁移**（用户手动删库，新库直建）。
 *   注：老库 `volumes` 表可能残留已废弃的 `has_outline` 列（SQLite 不支持 `DROP COLUMN`），
 *   新代码不再读写它，按项目既有约定（用户手动删库重建）处理。
 */
export function createChapterSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS volumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'custom', 'group')),
      title TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE (book_id, id),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      volume_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'special')),
      title TEXT NOT NULL DEFAULT '',
      special_prefix TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'done')),
      pin TEXT CHECK (pin IS NULL OR pin IN ('top', 'bottom')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      CHECK (kind = 'special' OR pin IS NULL),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id, volume_id) REFERENCES volumes(book_id, id) ON DELETE CASCADE
    )
  `)

  // 索引：卷列表（章节页 / 大纲页卷列表 + 回收站）；章按书 / 按卷 / 回收站 / 进度统计。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_volumes_book
      ON volumes(book_id, kind, sort_order, id) WHERE deleted_at IS NULL
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_volumes_trash
      ON volumes(book_id, kind, sort_order) WHERE deleted_at IS NOT NULL
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chapters_book
      ON chapters(book_id, volume_id, sort_order, id) WHERE deleted_at IS NULL
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chapters_volume
      ON chapters(volume_id, sort_order, id) WHERE deleted_at IS NULL
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chapters_trash
      ON chapters(book_id, volume_id) WHERE deleted_at IS NOT NULL
  `)
  // 进度统计（定稿占比）：只索引未删行。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chapters_live
      ON chapters(book_id, status) WHERE deleted_at IS NULL
  `)
}

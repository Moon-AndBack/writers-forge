import type Database from 'better-sqlite3'

/**
 * 伏笔域 schema：`foreshadows`（伏笔条目 + 锚点快照）。
 *
 * 设计要点：
 * - **按书隔离**：`book_id` 外键 ON DELETE CASCADE（`books.id` 为 TEXT，与其余域表一致）；
 * - **锚点快照而非段落外键**：`paragraphs.id` 每次保存都会全删全插、id 全变，
 *   大纲正文又是整条 JSON 无段落行，故锚点只存**重定位所需快照**：
 *   `anchor_kind`（chapter / outline / none）+ `chapter_id` / `outline_item_id`
 *   + `paragraph_idx`（章节段落序号，0 起）+ `quote`（原文摘录，用于重定位与失效判定）
 *   + `char_start` / `char_end`（段内字符区间，可空）；
 * - **回收点锚点**：`recover_*` 七列与埋设锚点结构严格对称，记录「回收伏笔时右键选中的
 *   那段正文」，使埋设处与回收处都能在正文显示标记；`recover_anchor_kind` 默认
 *   `'none'`（= 尚未记录回收点），`recover_quote` 默认空串；
 * - **软删除 / 回收站**：`deleted_at TEXT`（NULL = 未删除）；
 * - **回收备注**：`recovery_note TEXT NOT NULL DEFAULT ''`，回收伏笔时记录「如何回收 /
 *   在哪一章回收」等说明，空串 = 无备注；仅 `updateForeshadow` 可写，新建恒为空；
 * - 锚点指向的章 / 大纲条目物理删除时级联清理伏笔行（常规删除走软删，不触发）；
 * - 幂等建表（`CREATE ... IF NOT EXISTS`）；新增列以 `PRAGMA table_info` 检测后
 *   `ADD COLUMN` 幂等补列（对齐 `schema/plot.ts` 风格），老库无需重建。
 */
export function createForeshadowsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS foreshadows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      recovery_note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planted'
        CHECK (status IN ('planted', 'recovered', 'abandoned')),
      anchor_kind TEXT NOT NULL DEFAULT 'none'
        CHECK (anchor_kind IN ('chapter', 'outline', 'none')),
      chapter_id INTEGER,
      outline_item_id INTEGER,
      paragraph_idx INTEGER,
      quote TEXT NOT NULL DEFAULT '',
      char_start INTEGER,
      char_end INTEGER,
      recover_anchor_kind TEXT NOT NULL DEFAULT 'none'
        CHECK (recover_anchor_kind IN ('chapter', 'outline', 'none')),
      recover_chapter_id INTEGER,
      recover_outline_item_id INTEGER,
      recover_paragraph_idx INTEGER,
      recover_quote TEXT NOT NULL DEFAULT '',
      recover_char_start INTEGER,
      recover_char_end INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (outline_item_id) REFERENCES outline_items(id) ON DELETE CASCADE,
      FOREIGN KEY (recover_chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (recover_outline_item_id) REFERENCES outline_items(id) ON DELETE CASCADE
    )
  `)

  // 老库补列：`foreshadows` 建于本列之前，`CREATE TABLE IF NOT EXISTS` 不会加列，
  // 故显式探测后 `ADD COLUMN`（幂等：已存在则跳过；NOT NULL + 常量默认值可安全用于
  // 既有行，SQLite 会为老行回填空串）。
  ensureColumn(db, 'foreshadows', 'recovery_note', "TEXT NOT NULL DEFAULT ''")

  // 回收点锚点（第 2 批补列）：与埋设锚点同理幂等补列。
  // CHECK 说明：SQLite 允许 `ADD COLUMN` 携带 CHECK 约束，既有行按常量默认值 `'none'`
  // 回填且落在白名单内，故不会校验失败；默认值本身也保证了合法域。
  ensureColumn(
    db,
    'foreshadows',
    'recover_anchor_kind',
    "TEXT NOT NULL DEFAULT 'none' CHECK (recover_anchor_kind IN ('chapter', 'outline', 'none'))"
  )
  // 外键说明：可空列无默认值 = 默认 NULL，满足「启用外键时 ADD COLUMN 的 REFERENCES 列
  // 默认值须为 NULL」；删除动作与埋设锚点一致取 CASCADE（见文件头注释）。
  ensureColumn(
    db,
    'foreshadows',
    'recover_chapter_id',
    'INTEGER REFERENCES chapters(id) ON DELETE CASCADE'
  )
  ensureColumn(
    db,
    'foreshadows',
    'recover_outline_item_id',
    'INTEGER REFERENCES outline_items(id) ON DELETE CASCADE'
  )
  ensureColumn(db, 'foreshadows', 'recover_paragraph_idx', 'INTEGER')
  ensureColumn(db, 'foreshadows', 'recover_quote', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'foreshadows', 'recover_char_start', 'INTEGER')
  ensureColumn(db, 'foreshadows', 'recover_char_end', 'INTEGER')

  // 索引：按书取列表 / 正文锚点反查（章节段落、大纲条目）。
  db.exec('CREATE INDEX IF NOT EXISTS idx_foreshadows_book ON foreshadows(book_id, deleted_at)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_foreshadows_chapter ON foreshadows(chapter_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_foreshadows_outline_item ON foreshadows(outline_item_id)')
}

/** 检测表是否已有某列，缺失才 `ADD COLUMN`（幂等迁移，不破坏既有数据）。 */
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

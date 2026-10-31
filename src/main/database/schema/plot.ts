import type Database from 'better-sqlite3'

/**
 * 剧情域 schema：`plot_lines`（剧情线）+ `plot_scenes`（场景节点）两表。
 *
 * 设计要点：
 * - **两级结构**：剧情线 → 场景节点，不复用章节 / 大纲表，自成一套，与章节域、大纲域互不影响；
 * - 按书隔离：`book_id` 外键 ON DELETE CASCADE，删书联动删除整棵剧情数据；
 * - **无特殊卷 / 章、无编号、无 pin / status 等章节专属概念**：剧情线仅名称，场景节点为自由文本；
 * - 剧情线类型 / 颜色：`line_type`（8 型 key，默认 `'main'` 主线）+ `line_color`
 *   （16 色 key，前 8 复用封面 `ring`、默认首 key `'purple'`），非法值读时回退默认；
 * - `plot_scenes.line_id` NOT NULL，外键 ON DELETE CASCADE（剧情线被物理删除时其下场景物理删除；
 *   常规删线走软删除，不触发）；
 * - **软删除 / 回收站**：两表各有 `deleted_at TEXT`（NULL = 未删除）；
 * - **无出场人物列**：出场实体由剧情正文**自动匹配实体**生成胶囊（实时、不落库），
 *   故无 `characters` 列（老库残留列由 `database/index.ts` 的
 *   `migratePlotScenesDropCharacters` 一次性 `DROP COLUMN` 收敛）；
 * - **场景 ↔ 统一设定库实体**：`plot_scene_world_entities` 连接表（多对多，`PRIMARY KEY
 *   (scene_id, entity_id)`，两端 FK CASCADE，`role` / `sort_order` 为预留扩展位），
 *   承载「手动关联设定」（与正文自动匹配的胶囊互不影响）；
 * - `plot_scenes` 时间结构化三列：`time_era`（''/bc/zero/ad）+ `time_year`（INTEGER NULL）
 *   + `time_desc`（补充说明），`time_text` 保留原文兼容（结构化为空时回退展示）；
 * - **场景正文富文本化**（与大纲正文同口径）：`description` 保留为**派生纯文本摘要**
 *   （字数 / 搜索 / 卡片摘要真源），`description_json`（TEXT，可空）存**整条块级 Tiptap
 *   JSON**，`NULL` = 空正文。老库既有纯文本 `description` 由一次性迁移包成合法富文本
 *   文档写入本列（非破坏、幂等，见 `database/index.ts` 的 `migratePlotSceneDescriptionRich`）；
 * - 全部 `CREATE ... IF NOT EXISTS` 幂等；新增列以 `PRAGMA table_info` 检测后 `ADD COLUMN` 幂等补列，
 *   对齐 `schema/outline.ts` 既有风格。
 */
export function createPlotSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plot_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      name TEXT NOT NULL,
      line_type TEXT NOT NULL DEFAULT 'main',
      line_color TEXT NOT NULL DEFAULT 'purple',
      timeline_id TEXT NOT NULL DEFAULT 'default',
      default_origin TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS plot_scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      line_id INTEGER NOT NULL REFERENCES plot_lines(id) ON DELETE CASCADE,
      time_text TEXT NOT NULL DEFAULT '',
      time_era TEXT NOT NULL DEFAULT '',
      time_year INTEGER,
      time_desc TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      description_json TEXT,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)
  // 场景 ↔ 统一设定库实体（多对多）：删场景 / 删实体均级联清理连接行。
  // 须在 plot_scenes 与 world_entities 之后建（getDb 的装配顺序已保证）。
  db.exec(`
    CREATE TABLE IF NOT EXISTS plot_scene_world_entities (
      scene_id INTEGER NOT NULL REFERENCES plot_scenes(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scene_id, entity_id)
    )
  `)

  ensureColumn(db, 'plot_lines', 'deleted_at', 'TEXT')
  ensureColumn(db, 'plot_lines', 'line_type', "TEXT NOT NULL DEFAULT 'main'")
  ensureColumn(db, 'plot_lines', 'line_color', "TEXT NOT NULL DEFAULT 'purple'")
  ensureColumn(db, 'plot_lines', 'timeline_id', "TEXT NOT NULL DEFAULT 'default'")
  ensureColumn(db, 'plot_lines', 'default_origin', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'plot_scenes', 'time_text', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'plot_scenes', 'time_era', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'plot_scenes', 'time_year', 'INTEGER')
  ensureColumn(db, 'plot_scenes', 'time_desc', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'plot_scenes', 'title', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'plot_scenes', 'description', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'plot_scenes', 'description_json', 'TEXT')
  ensureColumn(db, 'plot_scenes', 'deleted_at', 'TEXT')

  // 索引：剧情线按书+序取列表；场景按书+序、按线查询。
  db.exec('CREATE INDEX IF NOT EXISTS idx_plot_lines_book ON plot_lines(book_id, sort_order)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_plot_scenes_book ON plot_scenes(book_id, sort_order)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_plot_scenes_line ON plot_scenes(line_id)')
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_plot_scenes_book_year ON plot_scenes(book_id, time_year, sort_order)'
  )
  // 连接表按实体反查（场景 → 实体为复合主键前缀，已天然覆盖）。
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_plot_scene_world_entities_entity ON plot_scene_world_entities(entity_id)'
  )
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

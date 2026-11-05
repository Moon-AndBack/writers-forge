import type Database from 'better-sqlite3'

/**
 * 伏笔域 schema：`foreshadows`（伏笔条目 + 两个**语义固定**的埋点槽位 + 回收点）。
 *
 * 设计要点：
 * - **按书隔离**：`book_id` 外键 ON DELETE CASCADE（`books.id` 为 TEXT，与其余域表一致）；
 * - **锚点快照而非段落外键**：`paragraphs.id` 每次保存都会全删全插、id 全变，
 *   大纲正文又是整条 JSON 无段落行，故锚点只存**重定位所需快照**：
 *   类型 + 目标 id + 段落序号（顶层块序号，0 起）+ 原文摘录（重定位与失效判定）
 *   + 段内字符区间（可空）；
 * - **两个埋点槽位语义固定，不再按「主 / 第二」泛化**：
 *   - `body_*`（正文埋点）**只存章节锚点**：`body_kind` ∈ ('chapter', 'none')，
 *     目标列仅 `body_chapter_id`，**没有** `outline_item_id`；
 *   - `outline_*`（大纲埋点）**只存大纲条目锚点**：`outline_kind` ∈ ('outline', 'none')，
 *     目标列仅 `outline_item_id`，**没有** `chapter_id`；
 *   槽位由锚点 `kind` 唯一决定（不再有「一章 + 一大纲、禁同类型双埋」的组合校验：
 *   两个槽位各自只认一种类型，跨类型混用会被 CHECK 直接拒绝）；
 * - **回收点锚点**：`recover_*` 七列仍为「章节 / 大纲条目 / 未记录」三态，
 *   记录「回收伏笔时右键选中的那段正文」，使埋设处与回收处都能在正文显示标记；
 *   `recover_anchor_kind` 默认 `'none'`（= 尚未记录回收点），`recover_quote` 默认空串；
 * - **软删除 / 回收站**：`deleted_at TEXT`（NULL = 未删除）；
 * - **回收备注**：`recovery_note TEXT NOT NULL DEFAULT ''`，回收伏笔时记录「如何回收 /
 *   在哪一章回收」等说明，空串 = 无备注；仅 `updateForeshadow` 可写，新建恒为空；
 * - **`status` 仅作废弃标记（本模型不做表迁移）**：业务上只写 `'planted'`（未废弃）/
 *   `'abandoned'`（已废弃，可撤销），**不再写入 `'recovered'`**；`'recovered'` 仅为历史
 *   遗留值（CHECK 保留以免迁移），读取时一律由 `deriveForeshadowStatus` 按
 *   `recover_anchor_kind` / 埋点派生覆盖，**不得**再把它当作「已回收」写入或判断；
 * - 锚点指向的章 / 大纲条目物理删除时级联清理伏笔行（常规删除走软删，不触发）；
 * - 幂等建表（`CREATE ... IF NOT EXISTS`）。老库（`anchor_*` / `anchor2_*` 旧列名）
 *   由 `foreshadowsSlotMigration.ts` 一次性整表重建收敛，不在此处 `ADD COLUMN`。
 */
export function createForeshadowsSchema(db: Database.Database): void {
  db.exec(foreshadowsTableDdl('foreshadows'))

  // 幂等补列：老库 `foreshadows` 补富文本列 `description_json`（纯增量 `ADD COLUMN`，
  // 保留既有行）。`description` 为派生纯文本摘要，本列为整条块级 Tiptap JSON，
  // NULL = 尚未富文本化（读侧由 `description` 兜底），回填见
  // `foreshadowsRichDescriptionMigration.ts`。
  ensureColumn(db, 'foreshadows', 'description_json', 'TEXT')

  // 索引：按书取列表 / 正文埋点按章反查 / 大纲埋点按条目反查。
  db.exec('CREATE INDEX IF NOT EXISTS idx_foreshadows_book ON foreshadows(book_id, deleted_at)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_foreshadows_body_chapter ON foreshadows(body_chapter_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_foreshadows_outline_item ON foreshadows(outline_item_id)')
}

/**
 * 表 DDL（表名参数化）：一次性迁移建 `foreshadows_new` 时复用同一份定义，
 * 避免 DDL 在 schema 与迁移两处各写一份而漂移（对齐 `worldEntitiesTableDdl` 手法）。
 */
export function foreshadowsTableDdl(table: string): string {
  return `
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      -- 富文本真源（整条块级 Tiptap JSON，只含实体高亮，NULL = 尚未富文本化 / 空正文）；
      -- description 保留为**派生纯文本摘要**（卡片截断 / 悬停浮窗第三行 / 字数统计），
      -- 两列同写：新数据由 JSON 派生摘要，老数据由一次性迁移回填本列（见
      -- foreshadowsRichDescriptionMigration.ts），读侧 description_json 为空时用
      -- description 兜底。
      description_json TEXT,
      recovery_note TEXT NOT NULL DEFAULT '',
      -- 仅作废弃标记：'planted' = 未废弃，'abandoned' = 已废弃；
      -- 'recovered' 仅为历史遗留值（保留 CHECK 以避免表迁移），读取时由派生逻辑覆盖。
      status TEXT NOT NULL DEFAULT 'planted'
        CHECK (status IN ('planted', 'recovered', 'abandoned')),
      body_kind TEXT NOT NULL DEFAULT 'none'
        CHECK (body_kind IN ('chapter', 'none')),
      body_chapter_id INTEGER,
      body_paragraph_idx INTEGER,
      body_quote TEXT NOT NULL DEFAULT '',
      body_char_start INTEGER,
      body_char_end INTEGER,
      outline_kind TEXT NOT NULL DEFAULT 'none'
        CHECK (outline_kind IN ('outline', 'none')),
      outline_item_id INTEGER,
      outline_paragraph_idx INTEGER,
      outline_quote TEXT NOT NULL DEFAULT '',
      outline_char_start INTEGER,
      outline_char_end INTEGER,
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
      FOREIGN KEY (body_chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (outline_item_id) REFERENCES outline_items(id) ON DELETE CASCADE,
      FOREIGN KEY (recover_chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      FOREIGN KEY (recover_outline_item_id) REFERENCES outline_items(id) ON DELETE CASCADE
    )
  `
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

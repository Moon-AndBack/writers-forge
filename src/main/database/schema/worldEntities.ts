import type Database from 'better-sqlite3'

/**
 * 统一设定库 schema：世界观 / 角色 / 物品功法 / 势力 / 境界体系 五类**统一寻址**。
 *
 * 结构（10 表 + 10 索引 + 2 触发器）：
 * - **统一主表** `world_entities`：五类共用的身份 / 元信息（类型、子类分类外键、
 *   名称、修订号、软删除），`book_id` 外键 ON DELETE CASCADE；
 *   子类真源为 `subtype_id` → `world_subtypes(id)`，展示名 / 预设路由键经 JOIN 取得；
 * - **模块子表只剩 2 张**（一对一，主键 = 主表 id，FK CASCADE 随主行物理删除）：
 *   `world_character`（`role`）/ `world_power_system`（`schema/worldPowers.ts` 的
 *   `kind`）。世界观 / 物品功法 / 势力三类**不再有模块级子表**（第 3 批下线
 *   `world_worldview` / `world_item` / `world_faction`），其子类字段全部落在 L3 子分类表
 *   （`schema/worldWorldviewSubtypes.ts` / `schema/worldItemSubtypes.ts` /
 *   `schema/worldFactionSubtypes.ts`），未命中预设时落 `world_custom`；
 *   物品品阶 `grade`（显示标签）/ `rank`（可比较档位）随之下沉到物品 5 张预设子分类表
 *   （材料沿用自身的 `grade_label`，不重复建列）。**天赋是有等级的独立实体**，归入 `item`
 *   （子类 `preset_key = 'talent'`），等级取 `world_talent.grade` / `rank`；
 *   第 6 批起角色 ↔ 天赋专用关系表 `world_character_talents` 已下线（零消费）；
 * - **通用附属表**（FK → 主表 / books，CASCADE）：`world_texts`（正文）、`world_aliases`
 *   （别名，`kind` 自由文本）、`world_tags`（按书标签字典，`UNIQUE(book_id, name)`）、
 *   `world_entity_tags`（实体 ↔ 标签多对多）、`world_semantic_codes`（语义码字典）、
 *   `world_refs`（实体间语义关系，`CHECK(from_id <> to_id)`）；
 * - **触发器**：插入主行按 `entity_type` 自动补建 `character` / `power_system` 子表行；
 *   `entity_type` 变更时迁移子表行。
 *
 * 已下线（第 2 批）：主表的 `status` / `source` / `visibility` / `parent_id` 四列全库零读零写，
 * 与本批一并从 DDL 删除（老库由 `database/worldEntitiesDropUnusedColumns.ts` 一次性重建收敛）；
 * 五个按类型的聚合视图（`v_worldview` 等）同样零查询，一并删除。
 *
 * 已下线（第 4 批）：主表的 `sub_type` 文本列 —— 子类真源改为 `world_subtypes` 外键
 * `subtype_id`。老库由 `database/worldEntitiesDropSubTypeText.ts` 一次性「回填 → 删列」
 * 收敛（守卫键 `worldEntities:dropSubTypeText:v1`）：文本按名称精确匹配分类表，
 * 匹配不到则建一条自定义分类后回填。
 *
 * 已下线（第 3 批）：`world_worldview` / `world_item` / `world_faction` 三张模块子表 ——
 * 前两张删掉废弃字段后只剩 `entity_id`（空壳），`world_item` 的 `kind` 已废弃、`grade` /
 * `rank` 下沉到物品子分类表。老库由 `database/worldItemGradeRankDown.ts` 一次性
 * 「回填品阶 → 删表」（守卫键 `worldItem:gradeRankDown:v1`）。
 * 已下线（简介列）：主表的 `summary` 与 `world_power_system.summary` ——
 * 五域统一删除简介列，历史数据直接丢弃（简介后续走正文）。老库由
 * `database/worldEntitiesDropSummary.ts` 一次性「重建 → 删列」收敛
 * （守卫键 `worldEntities:dropSummary:v1`）。
 *
 * 设计取舍：
 * - **触发器 vs 应用层**：子表行的「建行 / 迁行」用数据库触发器，保证**任何写入路径**
 *   （后续 IPC、批量导入、脚本）都不会出现「有主行无子行」的悬空；逻辑简单（按类型插入 /
 *   先清两张子表再按新类型插入），无跨表复杂判定，故采用触发器而非应用层事务。
 * - **无破坏性 DDL（表结构）**：表 / 索引 / 触发器均为 `CREATE ... IF NOT EXISTS`；新增列以
 *   `PRAGMA table_info` 探测后 `ADD COLUMN` 幂等补齐（纯增量、保留既有行）。例外是需要
 *   **删列 / 改 CHECK** 的一次性重建：四类 → 五类（`power_system`）由
 *   `database/worldPowerSystemMigration.ts`（守卫键 `worldEntities:powerSystemType:v1`）、
 *   删除四列由 `database/worldEntitiesDropUnusedColumns.ts`（守卫键
 *   `worldEntities:dropUnusedColumns:v1`）各自重建主表；两者共用本文件的 DDL
 *   （重建时传 `legacySubType` 以保留待回填的旧文本）。第 3 批删除三张模块子表由
 *   `database/worldItemGradeRankDown.ts` 一次性收敛；第 4 批删除 `sub_type` 由
 *   `database/worldEntitiesDropSubTypeText.ts` 一次性「回填 → 删列」收敛。
 * - **触发器每次启动重建**：触发器定义不随 `CREATE TRIGGER IF NOT EXISTS` 更新，故统一
 *   `DROP ... IF EXISTS` + `CREATE`，保证老库启动后定义同步（均为派生对象，不涉数据）。
 * - 旧四域表（`worldviews` / `characters` / `items` / `factions`）已由批F 的
 *   `database/index.ts` → `migrateDropLegacyDossierTables` 一次性 DROP（幂等、守卫键
 *   `dossier:dropLegacyTables:v1`），本模块不再引用。
 * - 对齐 `database/index.ts` 既有风格：`getDb()` 首次打开时调用本函数幂等补齐。
 */

/**
 * 主表建表 DDL（表名参数化）。
 *
 * 新库建表与两处老库重建迁移（`database/worldPowerSystemMigration.ts` /
 * `database/worldEntitiesDropUnusedColumns.ts`）共用本函数，保证 `world_entities_new`
 * 与最终 `world_entities` 的列定义**逐字一致**。
 *
 * 子类真源：`subtype_id`（可空，→ `world_subtypes(id)`，`ON DELETE SET NULL`）。
 * 第 4 批起主表**不再有** `sub_type` 文本列，展示名由 `world_subtypes.name` JOIN 得到。
 *
 * `options.legacySubType` 仅供**历史重建迁移**使用：那两份迁移需要把老库的 `sub_type`
 * 文本原样搬到新表，等 `database/worldEntitiesDropSubTypeText.ts` 回填完
 * `subtype_id` 后再统一删列。新库建表（默认不传）永远不含该列。
 */
export function worldEntitiesTableDdl(
  tableName: string,
  options?: { legacySubType?: boolean }
): string {
  const legacySubType =
    options?.legacySubType === true ? "      sub_type TEXT NOT NULL DEFAULT '',\n" : ''
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('worldview', 'character', 'item', 'faction', 'power_system')),
${legacySubType}      subtype_id INTEGER REFERENCES world_subtypes(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `
}

export function createWorldEntitiesSchema(db: Database.Database): void {
  // 1. 统一主表
  db.exec(worldEntitiesTableDdl('world_entities'))

  // 2. 模块子表（一对一；主键 = 主表 id；FK CASCADE 随主行物理删除）
  //    第 3 批起只剩 character / power_system 两张：世界观 / 物品功法 / 势力三类不再有
  //    模块级子表（空壳或字段已废弃 / 下沉），子类字段全部落在 L3 子分类表。
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_character (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT ''
    )
  `)
  // 角色年龄锚点：每条时间线独立一个「绝对年 → 年龄」锚点（不存出生年）。
  // 绝对年口径与剧情场景一致：纪前为负、元年 0、纪后为正；年龄为周岁（非负）。
  // 新表无需补列：老库启动时本函数幂等执行到此处即自动建表。
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_character_age (
      entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
      timeline_id TEXT NOT NULL DEFAULT 'default',
      anchor_year INTEGER NOT NULL,
      age INTEGER NOT NULL,
      PRIMARY KEY (entity_id, timeline_id)
    )
  `)

  // 3. 通用附属表
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_texts (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      body_json TEXT NOT NULL DEFAULT ''
    )
  `)
  // 幂等补列：老库 `world_texts` 补富文本列 `body_json`（纯增量 `ADD COLUMN`，保留既有行）。
  // 语义：`body` 为派生纯文本摘要（列表 / 搜索用），`body_json` 为整条块级 Tiptap JSON，
  // 空串 = 尚未富文本化（后续首次编辑时由 UI 生成），不在此层做格式转换。
  ensureColumn(db, 'world_texts', 'body_json', "TEXT NOT NULL DEFAULT ''")
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'other',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      UNIQUE (book_id, name)
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_entity_tags (
      entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES world_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (entity_id, tag_id)
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_semantic_codes (
      code TEXT PRIMARY KEY,
      from_type TEXT,
      to_type TEXT,
      note TEXT
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_refs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      from_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
      to_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
      semantic_code TEXT REFERENCES world_semantic_codes(code),
      role TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      valid_from TEXT,
      valid_to TEXT,
      note TEXT NOT NULL DEFAULT '',
      CHECK (from_id <> to_id)
    )
  `)

  // 4. 索引：主表按书 + 类型 / 名称 / 子类分类；别名按实体与匹配；标签按书；
  //    实体-标签按标签反查；关系按书 / 正向(源, 语义码) / 反向(目标, 语义码)。
  //    两个旧索引（`..._book_type_status` / `..._parent`）随列下线，此处幂等清理残留。
  db.exec('DROP INDEX IF EXISTS idx_world_entities_book_type_status')
  db.exec('DROP INDEX IF EXISTS idx_world_entities_parent')
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_world_entities_book_type ON world_entities(book_id, entity_type)'
  )
  db.exec('CREATE INDEX IF NOT EXISTS idx_world_entities_name ON world_entities(name)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_world_entities_subtype ON world_entities(subtype_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_world_aliases_entity ON world_aliases(entity_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_world_aliases_alias ON world_aliases(alias)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_world_tags_book ON world_tags(book_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_world_entity_tags_tag ON world_entity_tags(tag_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_world_refs_book ON world_refs(book_id)')
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_world_refs_from_code ON world_refs(from_id, semantic_code)'
  )
  db.exec('CREATE INDEX IF NOT EXISTS idx_world_refs_to_code ON world_refs(to_id, semantic_code)')

  // 5. 触发器：插入主行时按 entity_type 自动补建对应子表行（`OR IGNORE` 幂等）。
  //    触发器定义不随 `CREATE TRIGGER IF NOT EXISTS` 更新，故统一「DROP + CREATE」保证老库同步。
  //    第 3 批起只保留 character / power_system 两个分支（其余模块子表已下线）；
  //    触发器名保持不变，避免既有迁移判定 / 诊断按名匹配失效。
  db.exec('DROP TRIGGER IF EXISTS trg_world_entities_subtype_insert')
  db.exec(`
    CREATE TRIGGER trg_world_entities_subtype_insert
    AFTER INSERT ON world_entities
    BEGIN
      INSERT OR IGNORE INTO world_character (entity_id) SELECT NEW.id WHERE NEW.entity_type = 'character';
      INSERT OR IGNORE INTO world_power_system (entity_id) SELECT NEW.id WHERE NEW.entity_type = 'power_system';
    END
  `)
  // 触发器：entity_type 变更时迁移子表行（先清两张子表，再按新类型补建；旧专属字段随旧子行丢弃）。
  db.exec('DROP TRIGGER IF EXISTS trg_world_entities_subtype_update')
  db.exec(`
    CREATE TRIGGER trg_world_entities_subtype_update
    AFTER UPDATE OF entity_type ON world_entities
    WHEN OLD.entity_type <> NEW.entity_type
    BEGIN
      DELETE FROM world_character WHERE entity_id = NEW.id;
      DELETE FROM world_power_system WHERE entity_id = NEW.id;
      INSERT OR IGNORE INTO world_character (entity_id) SELECT NEW.id WHERE NEW.entity_type = 'character';
      INSERT OR IGNORE INTO world_power_system (entity_id) SELECT NEW.id WHERE NEW.entity_type = 'power_system';
    END
  `)
}

/** 检测表是否已有某列，缺失才 `ADD COLUMN`（幂等迁移，不破坏既有数据；对齐 `schema/plot.ts`）。 */
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

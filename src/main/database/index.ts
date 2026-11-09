import { app } from 'electron'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { logger } from '../logger'
import { seedBooksIfEmpty } from './books'
import { seedCategoriesOnce } from './categories'
import { resetChapterDataOnce } from './chapterSeed'
import { ensureChipColors } from './chipColors'
import {
  migratePlotSceneDescriptionBlocks,
  migrateWorldTextsBodyBlocks
} from './derivedTextBlocksBackfill'
import { GUIDE_BOOK } from './seedGuideBook'
import { migrateI18nChineseDefaults } from './i18nDefaultsCleanup'
import { migrateAllTimelines } from './timeline'
import { seedDemoWorldEntities, seedSemanticCodeDictionary } from './worldEntitySeed'
import { createAiChatSchema } from './schema/aiChat'
import { createCategorySchema } from './schema/categories'
import { createChapterSchema } from './schema/chapters'
import { createChipColorSchema } from './schema/chipColors'
import { applyCleanWordsSetup } from './schema/cleanWords'
import { createDailyStatsSchema } from './schema/dailyStats'
import { createEntitySchema } from './schema/entities'
import { createForeshadowsSchema } from './schema/foreshadows'
import { createImagesSchema } from './schema/images'
import { createInspirationsSchema } from './schema/inspirations'
import { createOutlineItemsSchema } from './schema/outlineItems'
import { createParagraphSchema } from './schema/paragraphs'
import { createPlotSchema } from './schema/plot'
import { createWorldEntitiesSchema } from './schema/worldEntities'
import { createWorldSubtypesSchema } from './schema/worldSubtypes'
import { createWorldCustomSchema } from './schema/worldCustom'
import { createWorldFactionSubtypesSchema } from './schema/worldFactionSubtypes'
import { createWorldItemSubtypesSchema } from './schema/worldItemSubtypes'
import { createWorldviewSubtypesSchema } from './schema/worldWorldviewSubtypes'
import { createWorldPowersSchema } from './schema/worldPowers'
import { migrateDropLegacyDossierTables } from './legacyDossierDrop'
import { migrateDropWorldRefAttrs } from './worldRefAttrsDrop'
import { migrateBooksDropColumns } from './booksDropColumns'
import { migrateForeshadowsBodyOutlineSlots } from './foreshadowsSlotMigration'
import { migrateForeshadowDescriptionRich } from './foreshadowsRichDescriptionMigration'
import {
  migratePlotLinesTimeline,
  migratePlotSceneDescriptionRich,
  migratePlotScenesDropCharacters
} from './plotMigrations'
import { seedWorldSubtypePresetsOnce } from './worldSubtypePresetSeed'
import { migrateWorldItemGradeRankDown } from './worldItemGradeRankDown'
import { migrateWorldEntitiesDropUnusedColumns } from './worldEntitiesDropUnusedColumns'
import { migrateWorldEntitiesDropSubTypeText } from './worldEntitiesDropSubTypeText'
import { migrateWorldEntitiesDropSummary } from './worldEntitiesDropSummary'
import { migrateWorldSubtypeCharacterSplit } from './worldSubtypeCharacterSplit'
import { migrateWorldCustomToKeyValue } from './worldCustomKeyValue'
import { migrateWorldTablesDropDown } from './worldTablesDropDown'
import { migrateWorldEntityPowerSystemType } from './worldPowerSystemMigration'
import { migrateWorldRefsHierarchy } from './worldRefsHierarchyMigration'
import { migrateWorldRefsPruneDeletedEndpoints } from './worldRefsPruneDeletedEndpoints'
import { migrateWorldTextsBodyJson } from './worldTextsBodyJsonBackfill'
import { migrateOrphanChaptersToUnfiled } from './unfiledChaptersMigration'

/** 数据库域日志 scope。 */
const log = logger.scope('db')

// 惰性单例：首次访问时打开数据库并建表
let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'writers-forge.db')
  let instance: Database.Database
  try {
    instance = new Database(dbPath)
  } catch (error) {
    log.error('数据库打开失败', { dbPath, error })
    throw error
  }
  instance.pragma('journal_mode = WAL')
  // 外键约束默认关闭，需显式开启以启用 books → volumes / chapters / outline_items 的级联删除
  instance.pragma('foreign_keys = ON')
  instance.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  // 注意：`CREATE TABLE IF NOT EXISTS` 对**已存在**的表**不会**补列（`channel` / `lengthType`
  // 是后加列，仍需用户删库重建）。`author` / `targetWords` 两列已从下方 DDL 移除，
  // 老库结构由 `migrateBooksDropColumns`（`DROP COLUMN`）一次性收敛，见该函数注释。
  instance.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      intro TEXT NOT NULL DEFAULT '',
      categories TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'writing',
      channel TEXT CHECK (channel IS NULL OR channel IN ('male', 'female', 'publish')),
      lengthType TEXT CHECK (lengthType IS NULL OR lengthType IN ('long', 'medium', 'short')),
      words INTEGER NOT NULL DEFAULT 0,
      chapters INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      coverChar TEXT NOT NULL DEFAULT '',
      coverColor TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  instance.exec(`
    CREATE TABLE IF NOT EXISTS book_covers (
      bookId TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE
    )
  `)

  // books 为空时灌入样例数据（幂等，且使用固定 id 便于与原型对齐）
  db = instance
  try {
    // 一次性结构迁移：老库删除 books 的 `author` / `targetWords`（幂等、事务、失败回滚）。
    migrateBooksDropColumns(instance)
    seedBooksIfEmpty()
    // 章节域：volumes（卷）+ chapters（章），幂等建表（引用 books，须在其后）。
    createChapterSchema(instance)
    // AI 对话域：会话（按书归属，与章解耦）+ 多轮消息，引用 books，须在其后；
    // 会话先于消息建表（消息外键指向会话），幂等建表；老库旧结构在函数内一次性重建。
    createAiChatSchema(instance)
    // 段落表：正文真源（每行一段，归属章节），幂等建表（引用 chapters，须在其后）。
    createParagraphSchema(instance)
    // 大纲域：outline_items，复用章节域卷池（引用 volumes / books，须在其后）。
    createOutlineItemsSchema(instance)
    // 未分卷：把「活章挂软删 / 缺失父卷」的幽灵活章迁移到系统「未分卷」卷
    //（幂等、事务回滚；须在卷表补列与大纲表就绪之后，因为需要建卷 + 卷纲行）。
    migrateOrphanChaptersToUnfiled()
    // 伏笔域：两个埋点槽位语义固定（`body_*` 仅章节 / `outline_*` 仅大纲条目）。
    // 老库（`anchor_*` / `anchor2_*`）一次性整表重建 + 按 kind 归位（幂等、列探测判据、
    // 失败回滚）；**必须早于** `createForeshadowsSchema`——后者会按新列名建索引，
    // 老表尚无 `body_chapter_id` 列，先建索引会直接报错。
    migrateForeshadowsBodyOutlineSlots(instance)
    // 伏笔域：foreshadows，锚点快照引用 chapters / outline_items，须在其后，幂等建表。
    createForeshadowsSchema(instance)
    // 灵感域：inspirations（碎片速记 + JSON 标签），按书隔离（引用 books，须在其后），
    // 幂等建表。
    createInspirationsSchema(instance)
    // 伏笔描述富文本化：既有纯文本 `description` 包成富文本写入 `description_json`
    //（幂等、事务、失败回滚；须在 createForeshadowsSchema 建表 / 补列之后；
    //  早于后续任何读取，保证列表读到的 `description_json` 已就绪）。
    migrateForeshadowDescriptionRich(instance)
    // 实体三表：幂等建表。
    createEntitySchema(instance)
    // 统一设定库：子类分类表（书 → 实体类型 → 子类），主表的 `subtype_id` 外键指向本表，
    // 故须先建；引用 books，须在其后，幂等建表。
    createWorldSubtypesSchema(instance)
    // 统一设定库：世界观 / 角色 / 物品功法 / 势力 / 境界体系 五类统一寻址
    //（主表 + 五类子表 + 通用附属 + 索引 / 触发器），引用 books / world_subtypes，须在其后，
    // 幂等建表。
    createWorldEntitiesSchema(instance)
    // 旧设定档案四域（worldviews / characters / factions / items 及别名 / 关系表）
    // 已下线：老库一次性 DROP（幂等、事务、失败回滚；用户确认无需保留旧数据）。
    migrateDropLegacyDossierTables(instance)
    // 统一设定库（第 4 层）：境界体系仅保留「体系」子表（一对一，FK → world_entities），
    // 须在 createWorldEntitiesSchema 之后，幂等建表。
    createWorldPowersSchema(instance)
    // 违禁词库初始化（建表 → 旧工具明细表一次性 DROP → 内置词库首次播种；守卫键
    // `cleanWords:dropWorldDetails:v1` / `cleanWords:seed:v1`，均失败回滚）。
    applyCleanWordsSetup(instance)
    // 第 6 批：下线境界 4 张专表 + 15 张零消费专用关系表 + 3 张零消费明细表
    //（幂等、守卫键、失败回滚；须在建表之后、种子与自检之前）。
    migrateWorldTablesDropDown(instance)
    // 剧情域：剧情线 / 场景节点表（两级结构，无特殊卷 / 章概念），幂等建表。
    createPlotSchema(instance)
    // 剧情场景删列：老库 `plot_scenes.characters`（出场人物 JSON）已下线，
    // 一次性 `DROP COLUMN` 收敛（幂等、事务、失败回滚）。
    migratePlotScenesDropCharacters(instance)
    // 剧情场景正文富文本化：既有纯文本 `description` 包成富文本写入 `description_json`
    //（幂等、事务、失败回滚；须在 createPlotSchema 补齐该列之后）。
    migratePlotSceneDescriptionRich(instance)
    // 剧情线时间线归属：老库 `timeline_id` / `default_origin` 空值收敛（幂等、事务、失败回滚）。
    migratePlotLinesTimeline(instance)
    // 第五类实体：老库重建 `world_entities`（CHECK 无法 ALTER），并把
    // `worldview + sub_type='境界体系'` 迁移为 `power_system`（幂等、守卫键、失败回滚）。
    // 须在 createWorldPowersSchema（world_power_system 表）之后、种子之前。
    migrateWorldEntityPowerSystemType(instance)
    // 第 2 批：老库重建 `world_entities`，删除 `status` / `source` / `visibility` / `parent_id`
    // 四列、新增可空 `subtype_id`（并回填）；须在 power_system 迁移（靠旧列判定是否已迁移）
    // 之后、第 4 批删 `sub_type` 之前（幂等、守卫键、失败回滚）。
    migrateWorldEntitiesDropUnusedColumns(instance)
    // 世界观六种子类专属子表（批 K1）：须在主表重建之后、种子之前。
    createWorldviewSubtypesSchema(instance)
    // 物品功法 / 势力子类专属子表（各 6 张）+ 用户自定义类型通用表（批 L1）：
    // 主键 / 外键均指向 world_entities，须在主表重建之后、迁移与种子之前。
    createWorldItemSubtypesSchema(instance)
    createWorldFactionSubtypesSchema(instance)
    createWorldCustomSchema(instance)
    // 关系属性表（`world_ref_attrs`）已下线：老库一次性 DROP（幂等、守卫键
    // `worldRefs:dropAttrs:v1`、失败回滚）；须在 world_refs 建表之后、
    // 关系体系收敛迁移之前。
    migrateDropWorldRefAttrs(instance)
    // 关系体系收敛：关系类型只保留「上级 / 下级 / 平级 / 属于」四码，旧语义码全部下线，
    // 存量关系一次性清空（用户已授权破坏性操作；幂等、守卫键
    // `worldRefs:hierarchy:v1`、失败回滚）。须在关系两表建表之后、种子之前。
    migrateWorldRefsHierarchy(instance)
    // 历史脏数据清理：删除端点为已软删实体的关系行 / 场景关联行（幂等、守卫键
    // `worldRefs:pruneDeletedEndpoints:v1`、失败回滚）。须在 `createWorldEntitiesSchema`
    //（world_entities / world_refs）与 `createPlotSchema`（plot_scene_world_entities）
    // 之后，紧随同域的 hierarchy 迁移。
    migrateWorldRefsPruneDeletedEndpoints(instance)
    // 第 3 批：物品品阶 grade / rank 从 world_item 下沉到物品 5 张预设子分类表，
    // 随后下线 world_worldview / world_faction / world_item 三张模块子表
    //（幂等、守卫键、失败回滚；须在 createWorldItemSubtypesSchema 补齐列之后、种子之前）。
    migrateWorldItemGradeRankDown(instance)
    // 第 4 批：`world_entities.sub_type`（文本）→ `subtype_id`（外键）收口 ——
    // 先按名称回填分类（匹配不到则建自定义分类），再删除文本列
    //（幂等、守卫键、失败回滚）。必须晚于第 2 批（提供 `subtype_id`）与第 3 批
    //（`worldItemGradeRankDown` 仍会写 `sub_type`）、早于种子。
    migrateWorldEntitiesDropSubTypeText(instance)
    // 简介列下线：删除 `world_entities.summary` 与 `world_power_system.summary`
    //（历史数据直接丢弃；简介后续走正文）。幂等、守卫键、失败回滚；
    // 须在 `migrateWorldEntitiesDropSubTypeText`（`sub_type` 已收敛）之后、种子之前。
    migrateWorldEntitiesDropSummary(instance)
    // 角色子类拆分：单条「角色」→ 主角 / 配角 / 龙套 / 反派，存量角色实体重映射到
    // 「主角」，旧预设分类下线（幂等、守卫键 `worldSubtypes:characterSplit:v1`、失败回滚）。
    // 须在 `migrateWorldEntitiesDropSubTypeText`（`subtype_id` 已回填）之后、种子之前。
    migrateWorldSubtypeCharacterSplit(instance)
    // 第 5 批：`world_custom` 由固定 4 列（notes / tags / custom_type / extra）重建为
    // 键值行式（entity_id + field_key + field_value + sort_order）。旧数据按用户授权丢弃
    //（幂等、守卫键、失败回滚）；须在 world_entities 建表之后、种子之前。
    migrateWorldCustomToKeyValue(instance)
    // 写作统计：每日增量流水表，幂等建表。
    createDailyStatsSchema(instance)
    // 分类域：categories（官方分类 + 自定义分类的两级树），幂等建表。
    createCategorySchema(instance)
    // 图片资源：大纲正文内嵌图片的二进制真源（引用 books，须在其后），幂等建表。
    createImagesSchema(instance)
    // 胶囊配色：实色底 + 配对文字色的全局配置表，幂等建表 + `INSERT OR IGNORE` 补种子。
    createChipColorSchema(instance)
    ensureChipColors()
    // 官方分类种子（幂等，由 settings 键守卫）：一级 33 / 二级 145。
    seedCategoriesOnce()
    // 一次性章节数据重建（按 settings 标记幂等）：清空章节域 / 大纲域并重灌
    // 唯一教学书「Writer's Forge · 使用指南」（书行 + 卷章 + 卷纲 + 大纲 + 正文块级 JSON）。
    resetChapterDataOnce()
    // 关系语义码字典（全局、幂等）：第 7 批起关系类型从字典选择，须在**每次启动**补齐
    // 新增码（老库已播过 demo 种子，不能只依赖按书种子）。
    seedSemanticCodeDictionary()
    // 第 3a 批：设置库历史正文回填（`world_texts.body` 纯文本 → `body_json` 富文本 JSON；
    // 幂等、守卫键、失败回滚）。须在 `world_texts` 建表 / 补列之后、demo 种子之前。
    migrateWorldTextsBodyJson(instance)
    // 派生纯文本按块级分隔口径重算（`d2c3d4c` 起块间插 `\n`，存量行未重算导致卡片
    // 不分段）。两个迁移必须晚于各自真源 JSON 的补齐迁移：
    // - `world_texts.body` ← `body_json`，须晚于 `migrateWorldTextsBodyJson`（上方）；
    // - `plot_scenes.description` ← `description_json`，须晚于 `migratePlotSceneDescriptionRich`
    //  （本序列上方 createPlotSchema 之后）。
    // 幂等、守卫键、单事务、失败回滚。
    migrateWorldTextsBodyBlocks(instance)
    migratePlotSceneDescriptionBlocks(instance)
    // 教学书统一设定库 demo 种子（幂等、按书隔离）：世界观 / 境界体系 / 角色 / 物品天赋 /
    // 势力 + 标签 / 语义码 / 通用引用 + 剧情场景关联；须在统一库建表与书行灌入之后。
    // 教学书重灌时已由 `resetChapterDataOnce` 在同一事务内清标记并重播（此处为空操作），
    // 保留本调用以覆盖「重灌键已置位但 demo 标记缺失」的异常库（自愈）。
    // 统一设定库是**唯一** demo 数据源（旧实体域 / 旧四域播种已删除）。
    seedDemoWorldEntities(GUIDE_BOOK.id)
    // 子类分类表预设回填（幂等、守卫键、失败回滚）：为既有书籍补齐 23 条预设子类。
    // 新建书籍由 `createBook` 即时写入，不依赖本步骤。
    seedWorldSubtypePresetsOnce(instance)
    // 多时间线数据层 migration：老键 `timeline:origin:<bookId>` → 新列表/选中键（幂等）。
    migrateAllTimelines()
    // 存量中文默认值清理：时间线名 / 起点、剧情线名 / 默认起点、场景时间文字
    //（幂等、守卫键 `i18n:defaultsCleanup:v1`、单事务、失败回滚）。
    // 须在 `migrateAllTimelines`（时间线列表已物化，可能携带老 origin 键的中文值）
    // 与全部种子之后，确保清理覆盖种子写入的行。
    migrateI18nChineseDefaults(instance)
  } catch (error) {
    log.error('数据库建表 / 种子 / 迁移失败', { dbPath, error })
    throw error
  }
  log.info('数据库已就绪', { dbPath, journalMode: 'WAL' })
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    log.debug('数据库已关闭')
  }
}

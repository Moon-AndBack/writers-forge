/**
 * 数据健康自检：**设计结构真源**（表 / 命名索引 / 逐表列清单）。
 *
 * 用途：`diagnostics/structure.ts` 与 `sqlite_master` / `PRAGMA table_info` 的实测结果做
 * **严格相等**比对（多出 / 缺失都记为问题）。此处即「设计」一侧的唯一真源。
 *
 * ⚠️ **维护义务**：任何 DDL 改动（`database/index.ts` 与 `database/schema/*.ts`）**必须**
 * 同步本文件，否则自检会对正常的新库误报 `structure.*`。清单与 DDL 逐字对应：
 * - `settings` / `books` / `book_covers` → `database/index.ts`
 * - `volumes` / `chapters` → `schema/chapters.ts`
 * - `paragraphs` → `schema/paragraphs.ts`
 * - `outline_items` → `schema/outlineItems.ts`
 * - `foreshadows`（伏笔 + 锚点快照）→ `schema/foreshadows.ts`
 * - `inspirations`（灵感：碎片速记 + JSON 标签）→ `schema/inspirations.ts`
 * - `entities` / `entity_aliases` / `entity_relations` → `schema/entities.ts`
 * - `plot_lines` / `plot_scenes` / `plot_scene_world_entities` → `schema/plot.ts`
 * - `daily_stats` → `schema/dailyStats.ts`
 * - `categories` → `schema/categories.ts`
 * - `images` → `schema/images.ts`
 * - `chip_colors`（胶囊配色，全局、无外键）→ `schema/chipColors.ts`
 * - `ai_chat_sessions` / `ai_chat_messages`（AI 对话会话 / 多轮消息；会话按书归属，
 *   消息的 `chapter_id` 为纯来源标记）→ `schema/aiChat.ts`
 * - `world_entities` / 模块子表 `world_character` / 通用附属表 → `schema/worldEntities.ts`
 *   （`world_power_system` 属第五类模块子表，清单见 `schema/worldPowers.ts` 分片；
 *   `world_worldview` / `world_item` / `world_faction` 已于第 3 批下线，见文末说明）
 * - 关系属性表已于批「关系属性下线」移除（表由 `database/index.ts` 的
 *   `migrateDropWorldRefAttrs` 一次性 DROP），本清单不再包含
 * - 境界体系表（1）→ `schema/worldPowers.ts`
 * - 违禁词库（`clean_word_list`，全局共享词表、无书域 / 实体外键）→ `schema/cleanWords.ts`
 *   （旧工具明细表 `world_forbidden_words` / `world_substitutions` 已随该批下线：由
 *   `schema/cleanWords.ts` 的 `migrateDropLegacyWordTables` 一次性 DROP，本清单不再包含）
 * - 物品功法 / 势力子类子表（12）→ `schema/worldItemSubtypes.ts` / `schema/worldFactionSubtypes.ts`
 * - 用户自定义类型通用表（1，键值行式）→ `schema/worldCustom.ts`
 * - 子类分类表（1）→ `schema/worldSubtypes.ts`
 *
 * 第 6 批下线（由 `database/worldTablesDropDown.ts` 一次性 DROP，本清单不再包含）：
 * 境界 4 张专表（渠道 / 层级 / 晋升边 / 角色境界）、15 张专用关系表、3 张明细表
 * （货币面额 / 阶级 / 规则条文）；自检如再见即报 `structure.extraTable`。
 *
 * 旧设定档案四域（`worldviews` / `characters` / `factions` / `items` 及别名 / 关系 /
 * `item_types`）已随批F 下线：表由 `database/index.ts` 的 `migrateDropLegacyDossierTables`
 * 一次性 DROP，本清单**不再包含**，自检如再见即报 `structure.extraTable`。
 *
 * 第 3 批下线的三张模块子表（`world_worldview` / `world_item` / `world_faction`）同理：
 * 由 `database/worldItemGradeRankDown.ts` 一次性 DROP，本清单不再包含；物品品阶
 * `grade` / `rank` 转入物品 5 张预设子分类表（见 `./expectedItemFactionSubtypes`）。
 *
 * **注意列名大小写**：`settings` / `book_covers` / 其余领域表为 snake_case，
 * 但 `books` 表沿用驼峰列名（`coverChar` / `coverColor` / `createdAt` …）——逐字比对，
 * 不可归一化。
 *
 * **不校验索引定义（列 / WHERE）本身**：只比对**索引名集合**。理由：`sqlite_master.sql`
 * 的文本规范化差异（引号 / 空白）会让文本比对产生假阳性，而「索引名严格相等」已能覆盖
 * 「缺索引 / 多出索引」两类真实故障（索引列写错属开发期错误，由 typecheck / 实测覆盖）。
 */

import {
  EXPECTED_CUSTOM_INDEXES,
  EXPECTED_CUSTOM_TABLES,
  EXPECTED_FACTION_SUBTYPE_TABLES,
  EXPECTED_ITEM_SUBTYPE_TABLES
} from './expectedItemFactionSubtypes'
import { EXPECTED_POWER_INDEXES, EXPECTED_POWER_TABLES } from './expectedWorldPowers'
import { EXPECTED_WORLDVIEW_SUBTYPE_TABLES } from './expectedWorldviewSubtypes'
import {
  EXPECTED_WORLD_SUBTYPE_INDEXES,
  EXPECTED_WORLD_SUBTYPE_TABLES
} from './expectedWorldSubtypes'

/** 单表期望列（顺序从 `PRAGMA table_info` 读入，此处只做**集合**比对，顺序无关）。 */
export interface ExpectedTable {
  name: string
  columns: readonly string[]
}

/** 设计表及其列清单（不含 `sqlite_%` 自动对象）。 */
export const EXPECTED_TABLES: readonly ExpectedTable[] = [
  {
    name: 'settings',
    columns: ['key', 'value', 'updated_at']
  },
  {
    name: 'books',
    columns: [
      'id',
      'title',
      'intro',
      'categories',
      'status',
      'channel',
      'lengthType',
      'words',
      'chapters',
      'progress',
      'coverChar',
      'coverColor',
      'createdAt',
      'updatedAt'
    ]
  },
  {
    name: 'book_covers',
    columns: ['bookId', 'mime', 'data', 'updatedAt']
  },
  {
    name: 'volumes',
    columns: [
      'id',
      'book_id',
      'kind',
      'title',
      'sort_order',
      'created_at',
      'updated_at',
      'deleted_at'
    ]
  },
  {
    name: 'chapters',
    columns: [
      'id',
      'book_id',
      'volume_id',
      'kind',
      'title',
      'special_prefix',
      'sort_order',
      'status',
      'pin',
      'created_at',
      'updated_at',
      'deleted_at'
    ]
  },
  {
    name: 'paragraphs',
    columns: ['id', 'chapter_id', 'idx', 'text', 'content_json']
  },
  {
    name: 'outline_items',
    columns: [
      'id',
      'book_id',
      'volume_id',
      'kind',
      'scope',
      'title',
      'sort_order',
      'text',
      'content_json',
      'created_at',
      'updated_at',
      'deleted_at'
    ]
  },
  // 伏笔域（正文埋点 body_* + 大纲埋点 outline_* + 回收点 recover_* 三重快照，不存段落外键）：
  // 见 `schema/foreshadows.ts`
  {
    name: 'foreshadows',
    columns: [
      'id',
      'book_id',
      'title',
      'description',
      'description_json',
      'recovery_note',
      'status',
      'body_kind',
      'body_chapter_id',
      'body_paragraph_idx',
      'body_quote',
      'body_char_start',
      'body_char_end',
      'outline_kind',
      'outline_item_id',
      'outline_paragraph_idx',
      'outline_quote',
      'outline_char_start',
      'outline_char_end',
      'recover_anchor_kind',
      'recover_chapter_id',
      'recover_outline_item_id',
      'recover_paragraph_idx',
      'recover_quote',
      'recover_char_start',
      'recover_char_end',
      'created_at',
      'updated_at',
      'deleted_at'
    ]
  },
  // 灵感域（碎片速记 + JSON 标签数组）：见 `schema/inspirations.ts`
  {
    name: 'inspirations',
    columns: ['id', 'book_id', 'title', 'content', 'tags', 'created_at', 'updated_at', 'deleted_at']
  },
  {
    name: 'entities',
    columns: ['id', 'book_id', 'name', 'type', 'description', 'created_at', 'updated_at']
  },
  {
    name: 'entity_aliases',
    columns: ['id', 'entity_id', 'alias']
  },
  {
    name: 'entity_relations',
    columns: ['id', 'entity_id', 'target_id', 'relation']
  },
  {
    name: 'plot_lines',
    columns: [
      'id',
      'book_id',
      'name',
      'line_type',
      'line_color',
      'timeline_id',
      'default_origin',
      'sort_order',
      'created_at',
      'deleted_at'
    ]
  },
  {
    name: 'plot_scenes',
    columns: [
      'id',
      'book_id',
      'line_id',
      'time_text',
      'time_era',
      'time_year',
      'time_desc',
      'title',
      'description',
      'description_json',
      'sort_order',
      'created_at',
      'updated_at',
      'deleted_at'
    ]
  },
  {
    name: 'plot_scene_world_entities',
    columns: ['scene_id', 'entity_id', 'role', 'sort_order']
  },
  {
    name: 'daily_stats',
    columns: ['date', 'words']
  },
  {
    name: 'categories',
    columns: [
      'id',
      'origin_id',
      'channel',
      'parent_id',
      'name',
      'sort_order',
      'is_custom',
      'created_at'
    ]
  },
  {
    name: 'images',
    columns: ['id', 'book_id', 'mime', 'bytes', 'data', 'created_at']
  },
  // 胶囊配色（全局配置表，无外键）：见 `schema/chipColors.ts`
  {
    name: 'chip_colors',
    columns: ['id', 'scope', 'module', 'preset_key', 'bg', 'fg', 'sort_order', 'updated_at']
  },
  // AI 对话（按书归属的会话 + 多轮消息；消息的 `chapter_id` 为纯来源标记）：见 `schema/aiChat.ts`
  {
    name: 'ai_chat_sessions',
    columns: ['id', 'book_id', 'provider', 'model', 'title', 'created_at', 'updated_at']
  },
  {
    name: 'ai_chat_messages',
    columns: [
      'id',
      'session_id',
      'chapter_id',
      'role',
      'content',
      'status',
      'usage_json',
      'created_at'
    ]
  },
  // 违禁词库（全局共享词表，无书域 / 实体外键）：见 `schema/cleanWords.ts`
  {
    name: 'clean_word_list',
    columns: [
      'id',
      'word',
      'category',
      'source',
      'replacement',
      'enabled',
      'sort_order',
      'updated_at'
    ]
  },
  {
    name: 'world_entities',
    columns: [
      'id',
      'uuid',
      'book_id',
      'entity_type',
      'subtype_id',
      'name',
      'revision',
      'created_at',
      'updated_at',
      'deleted_at'
    ]
  },
  // 子类分类表（批 1）：见 `./expectedWorldSubtypes`
  ...EXPECTED_WORLD_SUBTYPE_TABLES,
  // 世界观六种子类专属子表（批 K1）：见 `./expectedWorldviewSubtypes`
  ...EXPECTED_WORLDVIEW_SUBTYPE_TABLES,
  {
    name: 'world_character',
    columns: ['entity_id', 'role']
  },
  // 物品功法 / 势力子类专属子表（批 L1，物品前 5 张含 grade / rank）：
  // 见 `./expectedItemFactionSubtypes`
  ...EXPECTED_ITEM_SUBTYPE_TABLES,
  ...EXPECTED_FACTION_SUBTYPE_TABLES,
  // 用户自定义类型通用表（批 L1 → 第 5 批键值行式）：仅 item / faction 的自定义子类
  // （无 preset_key）使用，一实体多行。
  ...EXPECTED_CUSTOM_TABLES,
  {
    name: 'world_texts',
    columns: ['entity_id', 'body', 'body_json']
  },
  {
    name: 'world_aliases',
    columns: ['id', 'entity_id', 'alias', 'kind', 'sort_order']
  },
  {
    name: 'world_tags',
    columns: ['id', 'book_id', 'name']
  },
  {
    name: 'world_entity_tags',
    columns: ['entity_id', 'tag_id']
  },
  {
    name: 'world_semantic_codes',
    columns: ['code', 'from_type', 'to_type', 'note']
  },
  {
    name: 'world_refs',
    columns: [
      'id',
      'book_id',
      'from_id',
      'to_id',
      'semantic_code',
      'role',
      'sort_order',
      'valid_from',
      'valid_to',
      'note'
    ]
  },
  // schema/worldPowers.ts（境界体系 1 表，分片见 `./expectedWorldPowers`）
  ...EXPECTED_POWER_TABLES
]

/**
 * 设计命名索引清单（`sqlite_autoindex_*` 由 SQLite 自动生成，不在此列、自检时过滤）。
 * 计数：本文件静态清单 43（含违禁词库 2 + 伏笔 3 + 灵感 2）+ `./expectedWorldSubtypes` 1
 * + `./expectedWorldPowers` 0 + `./expectedItemFactionSubtypes` 1（`world_custom`）
 * = **45**。
 */
export const EXPECTED_INDEXES: readonly string[] = [
  // schema/chapters.ts（6）
  'idx_volumes_book',
  'idx_volumes_trash',
  'idx_chapters_book',
  'idx_chapters_volume',
  'idx_chapters_trash',
  'idx_chapters_live',
  // schema/outlineItems.ts（5，含 1 个部分唯一索引）
  'idx_outline_items_book',
  'idx_outline_items_volume',
  'idx_outline_items_standalone',
  'idx_outline_items_trash',
  'idx_outline_items_volume_scope',
  // schema/foreshadows.ts（3：按书取列表 / 正文埋点按章反查 / 大纲埋点按条目反查）
  'idx_foreshadows_book',
  'idx_foreshadows_body_chapter',
  'idx_foreshadows_outline_item',
  // schema/inspirations.ts（2：按书取未删除列表 / 按最近编辑排序）
  'idx_inspirations_book',
  'idx_inspirations_updated',
  // schema/entities.ts（6）
  'idx_entities_book',
  'idx_entities_book_type',
  'idx_entity_aliases_alias',
  'idx_entity_aliases_entity',
  'idx_entity_relations_entity',
  'idx_entity_relations_target',
  // schema/plot.ts（5）
  'idx_plot_lines_book',
  'idx_plot_scenes_book',
  'idx_plot_scenes_line',
  'idx_plot_scenes_book_year',
  'idx_plot_scene_world_entities_entity',
  // schema/categories.ts（1）
  'idx_categories_channel',
  // schema/images.ts（1）
  'idx_images_book',
  // schema/aiChat.ts（2：按书查会话 / 按会话按序取消息）
  'idx_ai_chat_sessions_book',
  'idx_ai_chat_messages_session',
  // schema/worldEntities.ts（10）
  'idx_world_entities_book_type',
  'idx_world_entities_name',
  'idx_world_entities_subtype',
  'idx_world_aliases_entity',
  'idx_world_aliases_alias',
  'idx_world_tags_book',
  'idx_world_entity_tags_tag',
  'idx_world_refs_book',
  'idx_world_refs_from_code',
  'idx_world_refs_to_code',
  // schema/worldSubtypes.ts（1：按书 + 实体类型）
  ...EXPECTED_WORLD_SUBTYPE_INDEXES,
  // schema/worldCustom.ts（1：自定义子类键值行按实体取）
  ...EXPECTED_CUSTOM_INDEXES,
  // schema/cleanWords.ts（2：检测热路径 enabled 前缀 / 来源过滤 + 按来源类别聚合）
  'idx_clean_word_list_enabled_category',
  'idx_clean_word_list_source_category',
  // schema/worldPowers.ts（0 索引，分片见 `./expectedWorldPowers`）
  ...EXPECTED_POWER_INDEXES
]

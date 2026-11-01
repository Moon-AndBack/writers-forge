# 数据库表分层规范

Writer's Forge 的本地数据全部落在单个 SQLite 文件（`userData/writers-forge.db`），由 better-sqlite3 在 `getDb()` 首次打开时幂等建齐，并在同一次装配中执行一次性结构迁移。本文说明 **49 张表**的分层归属、关键列、子类预设与读写口径。

真源声明：表名 / 列名的唯一真源是 DDL（`src/main/database/index.ts` + `src/main/database/schema/*.ts`，18 个文件、1,288 行非空代码，全文 1,342 行）；设计侧镜像为 `src/main/database/diagnostics/expected.ts`（385 行）及其 4 个分片。本文与二者逐字对齐，**任何 DDL 改动须同时改三处**。

## 1. 表来源分布

schema 目录下 18 个文件承载 46 张表；`settings` / `books` / `book_covers` 三张表由 `database/index.ts` 内联建表（`books` 为驼峰列名，与其余域的 snake_case 不同）。

| schema 文件                      | 表                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `chapters.ts`                    | `volumes`、`chapters`                                                                                                                        |
| `paragraphs.ts`                  | `paragraphs`                                                                                                                                 |
| `outlineItems.ts`                | `outline_items`                                                                                                                              |
| `entities.ts`                    | `entities`、`entity_aliases`、`entity_relations`                                                                                             |
| `plot.ts`                        | `plot_lines`、`plot_scenes`、`plot_scene_world_entities`                                                                                     |
| `dailyStats.ts`                  | `daily_stats`                                                                                                                                |
| `categories.ts`                  | `categories`                                                                                                                                 |
| `images.ts`                      | `images`                                                                                                                                     |
| `chipColors.ts`                  | `chip_colors`                                                                                                                                |
| `aiChat.ts`                      | `ai_chat_sessions`、`ai_chat_messages`                                                                                                       |
| `cleanWords.ts`                  | `clean_word_list`                                                                                                                            |
| `worldSubtypes.ts`               | `world_subtypes`                                                                                                                             |
| `worldEntities.ts`               | `world_entities`、`world_character`、`world_texts`、`world_aliases`、`world_tags`、`world_entity_tags`、`world_semantic_codes`、`world_refs` |
| `worldWorldviewSubtypes.ts`      | `world_overview`、`world_geography`、`world_culture`、`world_race`、`world_economy`、`world_ruleset`                                         |
| `worldItemSubtypes.ts`           | `world_weapon`、`world_skill`、`world_pill`、`world_talent`、`world_equipment`、`world_material`                                             |
| `worldFactionSubtypes.ts`        | `world_sect`、`world_family`、`world_dynasty`、`world_guild`、`world_alliance`、`world_demonic`                                              |
| `worldCustom.ts`                 | `world_custom`                                                                                                                               |
| `worldPowers.ts`                 | `world_power_system`                                                                                                                         |
| `database/index.ts`（非 schema） | `settings`、`books`、`book_covers`                                                                                                           |

合计：46 + 3 = **49**。注意 `world_entities` 由模板函数 `worldEntitiesTableDdl('world_entities')`（`schema/worldEntities.ts:80-104`）生成，**按 `CREATE TABLE` 字面量做正则会漏 1 张表**，统计表数一律以 `EXPECTED_TABLES` 为准。

## 2. 分层总览

| 层              | 表数 | 代表表                                            | 判定依据                                   |
| --------------- | ---- | ------------------------------------------------- | ------------------------------------------ |
| L0 基础层       | 12   | `books`、`chapters`、`paragraphs`、`settings`     | 不含统一设定库语义的书稿 / 全局基础数据    |
| L1 主表与附属   | 7    | `world_entities`、`world_subtypes`、`world_texts` | 五类实体共用的身份、分类与通用附属         |
| L1.5 自定义字段 | 1    | `world_custom`                                    | 用户自建子类的键值行                       |
| L2 模块子表     | 2    | `world_character`、`world_power_system`           | 与主表一对一、按 `entity_type` 落行        |
| L3 子分类表     | 18   | `world_overview` … `world_demonic`                | 按 `preset_key` 路由的一对一强类型子表     |
| L3.5 关系边     | 1    | `world_refs`                                      | 实体间的有向语义边                         |
| L4 境界专表     | 0    | （已下线）                                        | 渠道 / 层级 / 晋升边 / 角色境界 4 表已删除 |
| 剧情域          | 3    | `plot_lines`、`plot_scenes`                       | 独立两级结构，不复用卷章                   |
| AI 域           | 2    | `ai_chat_sessions`、`ai_chat_messages`            | 按章归属的对话过程数据                     |
| 旧实体域        | 3    | `entities`、`entity_aliases`、`entity_relations`  | 早期实体 CRUD，仅保留旧链路                |

分层求和：12 + 7 + 1 + 2 + 18 + 1 + 0 + 3 + 2 + 3 = **49**。

## 3. 各层详细说明

### 3.1 L0 基础层（12 张）

按用途再分三组：全局单例（`settings`、`daily_stats`、`chip_colors`、`clean_word_list`）、书域根（`books`、`book_covers`、`categories`、`images`）、卷章与大纲（`volumes`、`chapters`、`paragraphs`、`outline_items`）。

| 表                | 关键列                                                                               | 设计意图                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `settings`        | `key`（PK）、`value`、`updated_at`                                                   | 应用级键值配置；语言、迁移守卫键（`*:vN`）均落此表                                       |
| `books`           | `id`（TEXT PK）、`title`、`words`、`chapters`、`progress`、`coverChar`、`coverColor` | 书稿根；**14 列全为驼峰**，无 `author` / `targetWords`                                   |
| `book_covers`     | `bookId`（PK/FK）、`mime`、`data`（BLOB）                                            | 封面二进制独立存表，避免撑大 `books` 行                                                  |
| `volumes`         | `kind`（`normal`/`custom`/`group`）、`title`、`sort_order`、`UNIQUE (book_id, id)`   | 卷池三分；复合唯一键供子表做**同书**复合外键                                             |
| `chapters`        | `volume_id`（NOT NULL）、`kind`、`special_prefix`、`pin`、`status`                   | 每章必属一卷；`pin` 仅特殊章可用（表级 CHECK）；复合外键带上 `book_id` 防跨书挂载        |
| `paragraphs`      | `chapter_id`、`idx`、`text`、`content_json`、`UNIQUE (chapter_id, idx)`              | 正文唯一真源，一段一行；不冗余 `book_id`                                                 |
| `outline_items`   | `kind`（`standalone`/`entry`）、`scope`（`entry`/`volume`）、`text`、`content_json`  | 两层大纲；每卷至多一条卷纲行，由部分唯一索引 `idx_outline_items_volume_scope` 强制       |
| `daily_stats`     | `date`（PK，本地日历日）、`words`                                                    | 增量流水，`words` 允许为负（跨日删改），展示层 `max(0, …)`                               |
| `categories`      | `channel`、`parent_id`、`origin_id`、`is_custom`                                     | 官方 + 自定义两级树；`CHECK (channel IS NULL OR channel IN ('male','female','publish'))` |
| `images`          | `book_id`、`mime`、`bytes`、`data`（BLOB）                                           | 大纲内嵌图片；正文 JSON 只存 id；无软删除                                                |
| `chip_colors`     | `scope`（`preset`/`module`）、`module`、`preset_key`、`bg`、`fg`                     | 胶囊配色真源；`UNIQUE (scope, module, preset_key)` 为隐式索引，不登记命名索引            |
| `clean_word_list` | `word`（UNIQUE）、`category`、`source`、`enabled`                                    | **全局共享**违禁词表，无 `book_id`；`builtin` 行只能禁用不能删除                         |

### 3.2 L1 主表与附属（7 张）

`world_entities` 是五类实体的统一寻址入口，其余 6 张围绕它做分类、正文、别名、标签与语义码字典。

| 表                     | 关键列                                                                                             | 设计意图                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `world_entities`       | `uuid`（UNIQUE）、`book_id`、`entity_type`、`subtype_id`、`name`、`revision`、`deleted_at`         | 10 列；`entity_type` CHECK 五类（`worldview`/`character`/`item`/`faction`/`power_system`）；**无 `summary`**、无 `sub_type` 文本列、无 `status`/`source`/`visibility`/`parent_id` |
| `world_subtypes`       | `book_id`、`entity_type`、`name`、`is_custom`、`preset_key`、`UNIQUE (book_id, entity_type, name)` | 子类**唯一真源**；`is_custom = 0` 预设 / `1` 自定义；软删除                                                                                                                       |
| `world_texts`          | `entity_id`（PK）、`body`、`body_json`                                                             | `body` 为派生纯文本（列表 / 搜索 / 字数），`body_json` 为块级 Tiptap JSON；空串 = 未富文本化                                                                                      |
| `world_aliases`        | `entity_id`、`alias`、`kind`、`sort_order`                                                         | `kind` 为自由文本，默认 `other`                                                                                                                                                   |
| `world_tags`           | `book_id`、`name`、`UNIQUE (book_id, name)`                                                        | 按书隔离的标签字典                                                                                                                                                                |
| `world_entity_tags`    | `entity_id`、`tag_id`、`PRIMARY KEY (entity_id, tag_id)`                                           | 多对多连接表                                                                                                                                                                      |
| `world_semantic_codes` | `code`（PK）、`from_type`、`to_type`、`note`                                                       | 关系类型字典；`from_type`/`to_type` 全为 `NULL`（不限模块）；`note` 即展示名                                                                                                      |

### 3.3 L1.5 自定义字段（1 张）

`world_custom`：`PRIMARY KEY (entity_id, field_key)`，其余列为 `field_value`、`sort_order`。键值行式，一实体多行；字段名去空白后 1–64 字符、值 ≤2000 字符、每实体 ≤64 行（主进程校验）。仅 `item` / `faction` 的**自定义**子类写本表，命中预设或未分类都不写。

### 3.4 L2 模块子表（2 张）

与主表一对一（主键 = `world_entities.id`，FK CASCADE）。第 3 批下线 `world_worldview` / `world_item` / `world_faction` 后只剩两张：

| 表                   | 关键列                       | 设计意图                                                              |
| -------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `world_character`    | `entity_id`（PK/FK）、`role` | 角色**唯一**的模块级字段；角色仍有 4 个预设子类，但**无角色专属子表** |
| `world_power_system` | `entity_id`（PK/FK）、`kind` | 境界体系类型，自由文本（不设枚举 CHECK）；**无 `summary`**            |

两张表的行由触发器保证（见 §8）：只要有 `entity_type='character'` 或 `'power_system'` 的主行，就必有对应子行。

### 3.5 L3 子分类表（18 张）

一对一强类型子表，按 `world_subtypes.preset_key` 路由；字段除 `entity_id` 与物品的 `rank` 外均为 `TEXT NOT NULL DEFAULT ''`。未命中预设时**不写**这些表。

| 组          | 表（关键列）                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 世界观（6） | `world_overview`（`era`/`scale`/`population`/`epoch`）、`world_geography`（`coordinates`/`climate`/`area`/`terrain`）、`world_culture`（`language`/`customs`/`religion`/`art`）、`world_race`（`lifespan`/`body_size`/`reproduction`/`habits`）、`world_economy`（`currency`/`tax_rate`/`trade_routes`/`resources`）、`world_ruleset`（`physics`/`magic`/`taboo`/`boundary`）                                                                                        |
| 物品（6）   | `world_weapon`（`attack`/`durability`/`weight`/`material` + `grade`/`rank`）、`world_skill`（`tier`/`practice`/`cost`/`requirement` + 品阶）、`world_pill`（`effect`/`side_effect`/`difficulty`/`shelf_life` + 品阶）、`world_talent`（`talent_type`/`awaken_condition`/`growth`/`limitation` + 品阶）、`world_equipment`（`defense`/`slot`/`set_bonus`/`durability` + 品阶）、`world_material`（`usage`/`grade_label`/`origin`/`reserve`，**不带** `grade`/`rank`） |
| 势力（6）   | `world_sect`（`gate`/`disciples`/`heritage`/`precepts`）、`world_family`（`patriarch`/`family_rules`/`bloodline`/`ancestral_teaching`）、`world_dynasty`（`territory`/`law`/`army`/`capital`）、`world_guild`（`business`/`funds`/`branches`/`reputation`）、`world_alliance`（`form`/`members`/`goal`/`freedom`）、`world_demonic`（`doctrine`/`ritual`/`taboo`/`sphere`）                                                                                          |

物品品阶：`grade TEXT`（显示标签，如「上品」「S」）+ `rank INTEGER`（0 起可比较档位，0 = 未定级）。第 3 批从已删除的 `world_item` 下沉到前 5 张表；`world_material` 用自身 `grade_label`，语义重叠故不重复建列。

### 3.6 L3.5 关系边（1 张）

`world_refs`：`from_id`、`to_id`（均 FK `world_entities` CASCADE）、`semantic_code`（FK `world_semantic_codes(code)`）、`role`（补充说明）、`sort_order`、`valid_from`、`valid_to`、`note`、`CHECK (from_id <> to_id)`。三条命名索引分别服务按书、正向（`from_id, semantic_code`）、反向（`to_id, semantic_code`）。

### 3.7 L4 境界专表（0 张，已下线）

`world_power_paths` / `world_power_tiers` / `world_power_transitions` / `world_character_powers` 四表在第 6 批由 `database/worldTablesDropDown.ts` 一次性 DROP，层级化结构改由「体系说明」自由文本表达，故本层计数为 **0**。

### 3.8 剧情域（3 张）

`plot_lines`（`line_type` 8 型默认 `main`、`line_color` 默认 `purple`、`timeline_id` 默认 `default`、`default_origin`、`deleted_at`）→ `plot_scenes`（`line_id` NOT NULL / FK CASCADE、`time_text`/`time_era`/`time_year`/`time_desc`、`description` 纯文本 + `description_json` 富文本）两级结构；`plot_scene_world_entities` 为场景 ↔ 设定库实体多对多连接表（`PRIMARY KEY (scene_id, entity_id)`）。剧情域**不复用**卷章与大纲表。

### 3.9 AI 域（2 张）

`ai_chat_sessions`（`book_id`、`chapter_id`、`provider`、`model`、`title`、`updated_at`）按章归属；`ai_chat_messages`（`session_id`、`role` CHECK `system`/`user`/`assistant`、`content`、`usage_json`）。无软删除，删除即物理删除并级联。

### 3.10 旧实体域（3 张）

`entities`（`book_id`、`name`、`type`、`description`）、`entity_aliases`、`entity_relations`（`entity_id`、`target_id`、`relation` 为自由文本）。这是统一设定库之前的实体 CRUD 三表，目前仅保留给旧链路；正文实体匹配已改走 `world_entities` + `world_aliases`（见 `database/entities.ts:270-273`），新功能不得再扩这两套并行结构。

## 4. 子类预设清单（23 条）

真源 `database/worldSubtypes.ts:92-115` 的 `PRESET_WORLD_SUBTYPES`，由 `ensurePresetSubtypes(bookId)` 按书 `INSERT OR IGNORE` 幂等补齐（每本新书 23 行）。名称为数据常量（不译），`sortOrder` 在各模块内独立从 0 递增。

| 类型         | 名称     | `preset_key`        | 落表                            |
| ------------ | -------- | ------------------- | ------------------------------- |
| worldview    | 世界概况 | `overview`          | `world_overview`                |
| worldview    | 地理环境 | `geography`         | `world_geography`               |
| worldview    | 文化背景 | `culture`           | `world_culture`                 |
| worldview    | 种族生物 | `race`              | `world_race`                    |
| worldview    | 经济体系 | `economy`           | `world_economy`                 |
| worldview    | 世界规则 | `ruleset`           | `world_ruleset`                 |
| item         | 武器     | `weapon`            | `world_weapon`                  |
| item         | 功法     | `skill`             | `world_skill`                   |
| item         | 丹药     | `pill`              | `world_pill`                    |
| item         | 天赋     | `talent`            | `world_talent`                  |
| item         | 装备     | `equipment`         | `world_equipment`               |
| item         | 材料     | `material`          | `world_material`                |
| faction      | 宗门     | `sect`              | `world_sect`                    |
| faction      | 家族     | `family`            | `world_family`                  |
| faction      | 王朝     | `dynasty`           | `world_dynasty`                 |
| faction      | 商会     | `guild`             | `world_guild`                   |
| faction      | 散修联盟 | `alliance`          | `world_alliance`                |
| faction      | 魔教     | `demonic`           | `world_demonic`                 |
| character    | 主角     | `character-lead`    | 无专属子表（`world_character`） |
| character    | 配角     | `character-support` | 无专属子表（`world_character`） |
| character    | 龙套     | `character-extra`   | 无专属子表（`world_character`） |
| character    | 反派     | `character-villain` | 无专属子表（`world_character`） |
| power_system | 境界体系 | `power_system`      | `world_power_system`            |

6 + 6 + 6 + 4 + 1 = **23**。境界体系不显示分类选择器，写入时由 `resolveDefaultSubtypeId` 自动补该默认分类。

## 5. 关键设计规则

**5.1 `subtype_id` 是子类唯一真源。** 主表不存文本子类；展示名与路由键均 `JOIN world_subtypes` 取得（`name` / `preset_key`）。外键 `ON DELETE SET NULL`，删分类不会级联删实体。

**5.2 子类三层互斥。** 任一实体只能是三者之一：未分类（`subtype_id IS NULL`）、预设子类（`preset_key` 非空）、自定义子类（`subtype_id` 非空且 `preset_key = ''`）。三者对应的字段落点互不重叠——未分类不写任何子表，预设写 L3 对应表，自定义写 `world_custom`。`worldEntitySubtypeFields.ts` 的 `resolveTarget` 是这条规则的单点实现。

**5.3 模块层表始终有行。** `world_character` / `world_power_system` 不允许出现「有主行无子行」：由 §8 的触发器在插入与类型变更时补建。注意这只覆盖 L2，**L3 子分类表不预建空行**（预设子类在创建 / 子类变更 / 首次写字段时才 `INSERT OR IGNORE`），`world_custom` 更是只在写入字段时产生行。

**5.4 关系只有四码。** `superior`（上级）/ `subordinate`（下级）/ `peer`（平级）/ `belongs_to`（属于），真源 `database/worldSemanticCodes.ts:32-47`，展示名真源 `src/shared/worldRelationCodes.ts`。字典的 `from_type` / `to_type` 全为 `NULL`，某对模块能选哪些码由渲染层 `relationCodesForPair` 计算，字典本身不收窄。新建引用时 `semanticCode` 必填。

**5.5 `preset_key` 是稳定键。** 路由、配色（`chip_colors.preset_key`）、字段白名单（`src/shared/worldSubtypeFields.ts`）全部按 ASCII 键匹配，**不按中文名称**：名称可被改名，键不可变。

## 6. 读写口径差异（`subtype_id` 为 NULL）

历史数据存在「未分类」实体，读侧必须容忍，写侧不再产生。两者口径**必须分开**，不可互相套用：

| 场景          | 规则                                                                                                                    | 依据                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 读主表行      | `subtype_id IS NULL` 合法，`subType` / `presetKey` 回显空串，不读任何子表                                               | `worldEntityQueries.ts` 直接 JOIN 回显 |
| 读子类字典    | `deleted_at IS NULL` 过滤；软删分类不返回                                                                               | `listWorldSubtypes`                    |
| 写创建 / 更新 | `subtypeId = null` 视为**非法**，IPC 直接拒绝（境界体系先补默认分类，其余仍拒绝）                                       | `ipc/worldEntities.ts:281-294`         |
| 写子类字段    | 未分类时不接受 `worldviewFields` / `itemFields` / `factionFields` / `customFields`                                      | `ipc/worldSubtypeFields.ts:154-162`    |
| 解析引用      | `resolveEntitySubtype` 对 `null` 返回 `null`（调用方按非法处理）；分类须存在、未软删、且 `book_id` / `entity_type` 一致 | `worldSubtypes.ts:34-56`               |
| 删分类        | 软删分类并同事务把其下实体 `subtype_id` 置 `NULL`（实体回到未分类，不改 `revision`）                                    | `deleteWorldSubtype`                   |

## 7. 归属歧义说明

| 表                                                 | 可能被误判为 | 实际归属     | 理由                                                                        |
| -------------------------------------------------- | ------------ | ------------ | --------------------------------------------------------------------------- |
| `world_semantic_codes`                             | L3.5 关系层  | **L1**       | 它是字典（码 → 展示名），不是边；`world_refs` 通过外键引用它                |
| `world_refs`                                       | L1 附属表    | **L3.5**     | 语义上高于子分类字段、低于主表，且跨模块通用                                |
| `world_custom`                                     | L3 子分类表  | **L1.5**     | 无预设键、无强类型列，是「无表可落」时的兜底，介于主表与子分类之间          |
| `plot_scene_world_entities`                        | L3.5 关系边  | **剧情域**   | 它只服务「场景 ↔ 实体」的手动关联，与 `world_refs` 的实体间语义关系互不影响 |
| `world_tags` / `world_entity_tags`                 | 标签域独立层 | **L1**       | 挂在主表上、按书隔离，属主表的通用附属                                      |
| `chip_colors` / `clean_word_list`                  | 设定库附属   | **L0**       | 二者全局共享、无 `book_id`、无实体外键，不属任何书域                        |
| `entities` / `entity_aliases` / `entity_relations` | L1 的等价物  | **旧实体域** | 与统一设定库并行存在，仅保留旧 CRUD 链路，不参与正文匹配                    |

## 8. 触发器策略

全库**只有 2 个触发器**，都在 `schema/worldEntities.ts`，且每次启动 `DROP` 后重建（触发器定义不随 `CREATE TRIGGER IF NOT EXISTS` 更新）：

| 触发器                              | 时机                                          | 行为                                                                            |
| ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| `trg_world_entities_subtype_insert` | `AFTER INSERT ON world_entities`              | 按 `entity_type` 向 `world_character` / `world_power_system` `INSERT OR IGNORE` |
| `trg_world_entities_subtype_update` | `AFTER UPDATE OF entity_type`，且类型确实变化 | 先清两张 L2 子表，再按新类型补建                                                |

边界必须写清：触发器**只维护 L2 这两张模块子表**；18 张 L3 子分类表、`world_custom`、`world_texts` / 别名 / 标签 / `world_refs` 全部由应用层事务保证一致性（`worldEntityWrites.ts` 的 `applyChildFields` 等）。除上述 2 个触发器外，全库再无 `CREATE TRIGGER`（`schema/*.ts` 已逐文件核实），其余表的引用完整性靠外键 `ON DELETE CASCADE` + 应用层事务，不靠触发器。

## 9. 诊断层

`diagnostics/expected.ts` 是**设计一侧的唯一真源**，导出 `EXPECTED_TABLES`（49 项，含逐表列清单）与 `EXPECTED_INDEXES`（40 个命名索引），并聚合 4 个分片：

- `expectedWorldSubtypes.ts`：1 表 + 1 索引；
- `expectedWorldviewSubtypes.ts`：6 表；
- `expectedItemFactionSubtypes.ts`：12 表 + `world_custom` 1 表 + 1 索引；
- `expectedWorldPowers.ts`：1 表 + 0 索引。

比对是**严格相等**（`diagnostics/structure.ts`）：表 / 列 / 索引缺失与多出**都**报问题（`structure.missingTable` / `extraTable` / `missingColumn` / `extraColumn` / `missingIndex` / `extraIndex`）。只比索引**名**集合，不比定义；`sqlite_%` 自动对象被过滤（`sqlite_sequence`、`sqlite_autoindex_*` 不算问题）。

索引计数：静态清单 36 + 违禁词库 2 = 38，加 `world_subtypes` 1、`world_custom` 1、境界 0 = **40**。

DDL 变更同步清单（缺一即被自检误报）：

1. 改 `schema/*.ts` 或 `database/index.ts` 的建表 / 加列 / 建索引；
2. 同步 `expected.ts`（或对应分片）的表名、列名、索引名（`books` 驼峰列名逐字照抄）；
3. 一次性迁移（`*Drop*.ts`、`*Migration.ts`）删列 / 删表后，**从清单中移除**旧项，否则老库收敛后仍报 `extraColumn` / `extraTable`；
4. 同步本文的层表与 §10 对应表。

## 10. 代码文件对应表

| 层 / 域 | 表                                                                   | schema                      | 读写模块（`src/main/database/`）                                                              |
| ------- | -------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| L0      | `settings`                                                           | `index.ts`                  | `settings.ts`                                                                                 |
| L0      | `books`                                                              | `index.ts`                  | `books.ts`、`booksDropColumns.ts`（迁移）                                                     |
| L0      | `book_covers`                                                        | `index.ts`                  | `covers.ts`                                                                                   |
| L0      | `volumes`                                                            | `chapters.ts`               | `volumes.ts`、`chapterGroups.ts`、`chapterOrdering.ts`、`chapterReorder.ts`                   |
| L0      | `chapters`                                                           | `chapters.ts`               | `chapters.ts`、`chapterStatus.ts`、`chapterTrash.ts`、`chapterSearch.ts`、`chapterMappers.ts` |
| L0      | `paragraphs`                                                         | `paragraphs.ts`             | `paragraphs.ts`、`wordCount.ts`                                                               |
| L0      | `outline_items`                                                      | `outlineItems.ts`           | `outline.ts`                                                                                  |
| L0      | `daily_stats`                                                        | `dailyStats.ts`             | `stats.ts`                                                                                    |
| L0      | `categories`                                                         | `categories.ts`             | `categories.ts`、`categoriesWrite.ts`                                                         |
| L0      | `images`                                                             | `images.ts`                 | `images.ts`                                                                                   |
| L0      | `chip_colors`                                                        | `chipColors.ts`             | `chipColors.ts`                                                                               |
| L0      | `clean_word_list`                                                    | `cleanWords.ts`             | `cleanWords.ts`、`cleanWordSeed.ts`                                                           |
| L1      | `world_entities`                                                     | `worldEntities.ts`          | `worldEntities.ts`、`worldEntityQueries.ts`、`worldEntityWrites.ts`、`worldEntityMeta.ts`     |
| L1      | `world_subtypes`                                                     | `worldSubtypes.ts`          | `worldSubtypes.ts`、`worldSubtypePresetSeed.ts`、`worldSubtypeCharacterSplit.ts`（迁移）      |
| L1      | `world_texts` / `world_aliases` / `world_tags` / `world_entity_tags` | `worldEntities.ts`          | `worldEntityMeta.ts`                                                                          |
| L1      | `world_semantic_codes`                                               | `worldEntities.ts`          | `worldSemanticCodes.ts`、`worldEntitySeed.ts`（播种）                                         |
| L1.5    | `world_custom`                                                       | `worldCustom.ts`            | `worldCustomKeyValue.ts`、`worldEntitySubtypeFields.ts`                                       |
| L2      | `world_character`                                                    | `worldEntities.ts`          | `worldEntityWrites.ts`（`role`）                                                              |
| L2      | `world_power_system`                                                 | `worldPowers.ts`            | `worldPowerQueries.ts`、`worldPowerWrites.ts`                                                 |
| L3      | 世界观 6 表                                                          | `worldWorldviewSubtypes.ts` | `worldEntityWrites.ts` / `worldEntityQueries.ts`（`WV_SUBTYPE_TABLE`）                        |
| L3      | 物品 6 表                                                            | `worldItemSubtypes.ts`      | `worldEntitySubtypeFields.ts`、`worldItemGradeRank.ts`                                        |
| L3      | 势力 6 表                                                            | `worldFactionSubtypes.ts`   | `worldEntitySubtypeFields.ts`                                                                 |
| L3.5    | `world_refs`                                                         | `worldEntities.ts`          | `worldRefs.ts`、`worldRefsHierarchyMigration.ts`、`worldRefsPruneDeletedEndpoints.ts`         |
| 剧情    | `plot_lines` / `plot_scenes`                                         | `plot.ts`                   | `plot.ts`、`plotLines.ts`、`plotScenes.ts`、`plotShared.ts`                                   |
| 剧情    | `plot_scene_world_entities`                                          | `plot.ts`                   | `plotSceneEntities.ts`                                                                        |
| AI      | `ai_chat_sessions` / `ai_chat_messages`                              | `aiChat.ts`                 | `aiChat.ts`                                                                                   |
| 旧实体  | `entities` / `entity_aliases` / `entity_relations`                   | `entities.ts`               | `entities.ts`（仅旧 CRUD）                                                                    |

## 11. 注意事项（易抄错，均以代码为准）

1. **`summary` 两列都已删除。** `world_entities.summary` 属于「五域统一删简介列」，`world_power_system.summary` 同时删除（`worldEntitiesDropSummary.ts`，守卫键 `worldEntities:dropSummary:v1`）。`world_entities` 现为 **10 列**，`world_power_system` 仅 `entity_id` / `kind` 两列。任何写作「主表含 summary」的旧描述都是错的。
2. **子类预设是 23 条，不是 20 条。** 6 世界观 + 6 物品 + 6 势力 + **4 角色** + 1 境界。角色在 `worldSubtypeCharacterSplit.ts` 迁移中由单条「角色」拆为主角 / 配角 / 龙套 / 反派，旧键 `character` 已下线。
3. **关系语义码是 4 个，不是 11 个。** `superior` / `subordinate` / `peer` / `belongs_to`；`worldRefs:hierarchy:v1` 迁移已清空全部旧码关系。不要再引用「上级 / 下属 / 师父 / 弟子…」这类历史枚举。
4. **`world_character` 只有 `role` 一列，但角色确有 4 个预设子类。** 准确表述是「角色**无专属子表**」，不是「角色不拆子类」。这 4 条预设只体现在 `world_subtypes` 行与 `chip_colors` 配色上。
5. **`subtype_id` 允许 NULL 是读侧兼容，不是写侧合法。** 读：未分类照常回显空子类名；写：IPC 拒绝 `null`（境界体系自动补默认分类），且未分类不接受任何子类字段。把「可空」直接读成「可以不选分类」是最常见的误解。
6. **`books` 是 14 列且列为驼峰。** 无 `author` / `targetWords`（已由 `booksDropColumns.ts` 一次性 DROP）。粘贴列清单时不要归一化大小写。
7. **统计表数别用正则。** `world_entities` 由 `worldEntitiesTableDdl()` 模板生成，按 `CREATE TABLE` 字面量扫只会得到 48。

最后核对：2026-10-31

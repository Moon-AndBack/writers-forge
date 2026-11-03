# 数据库架构

Writer's Forge 的全部书稿、设定与配置都落在一个本地 SQLite 文件里，由主进程通过 better-sqlite3 同步访问。本文说明连接方式、建表装配、结构真源、一次性迁移、种子、教学书重灌与自检机制。

- 数据层入口：`src/main/database/index.ts`（单例连接 + 装配）
- 结构定义：`src/main/database/schema/`（18 个文件）与 `index.ts` 内联的 3 张表
- 设计清单：`src/main/database/diagnostics/expected.ts`（含 4 个分片文件）
- 表分层规范：`docs/specs/database/table-layers.md`

> 口径：代码是唯一真源。本文的表名、列名、settings 键名均与源码逐字一致；与代码冲突时以代码为准。

## 1. 连接与 PRAGMA

### 1.1 惰性单例

`src/main/database/index.ts` 维护模块级变量 `db: Database.Database | null`，首次调用 `getDb()` 时打开数据库，之后全进程复用同一连接：

```ts
const dbPath = join(app.getPath('userData'), 'writers-forge.db')
instance = new Database(dbPath)
instance.pragma('journal_mode = WAL')
instance.pragma('foreign_keys = ON')
```

关键点：

- **路径固定**：`userData/writers-forge.db`。`userData` 在 app ready 之前由 `src/main/appPaths.ts` 的 `configureAppPaths()` 固定：打包态为系统 AppData 下的 `Writer's Forge`，开发态为项目根下的 `user_data/`，两套数据互不干扰。
- **WAL 模式**：读写并发更好，但运行期会额外产生 `writers-forge.db-wal` / `writers-forge.db-shm`。备份不能直接复制主文件，必须用 `db.backup()`（见 §9）。
- **外键显式开启**：SQLite 默认关闭外键，`foreign_keys = ON` 必须在任何 DDL / DML 之前执行，`books → volumes / chapters / outline_items` 等 `ON DELETE CASCADE` 才生效。
- **无连接池**：better-sqlite3 为同步 API，所有数据访问模块共享 `getDb()` 返回的同一连接；IPC handler 在主进程串行执行，不存在多连接写冲突。

### 1.2 启动与关闭时机

启动链路（`src/main/index.ts`）：

1. 顶层同步执行 `configureAppPaths()`，固定 `userData`；
2. `app.whenReady()` 内先 `getDb()`：同步完成建表、种子、一次性迁移；
3. 紧接着 `runDiagnostics()`，结果存主进程内存；
4. `registerIpc(diagnosticsReport)` 注册 IPC；
5. 最后 `createMainWindow()`。

因此渲染层挂载时数据库与自检报告都已就绪，无竞态。

关闭由 `app.on('before-quit')` 调用 `closeDb()`：若单例存在则 `db.close()` 并置 `null`。macOS 关闭全部窗口不退出应用，数据库保持打开；再次激活窗口直接复用。没有其他手动关闭入口。

初始化失败时 `getDb()` 记录日志并抛出，启动随之中断。注意模块级 `db` 在装配一开始就已赋值：若上层捕获异常后再次调用 `getDb()`，会直接复用这个半初始化的连接，没有内建重试；因此不要在启动路径吞掉该异常。

## 2. 建表装配顺序

`getDb()` 内按固定顺序完成全部装配：`settings` / `books` / `book_covers` 的首次 DDL 在 `try` 之前执行，其余建表、迁移与种子在 `try` 内执行。顺序不是随意的：子表依赖父表、迁移依赖新列/新表、种子依赖表与分类，错序会触发外键失败或让迁移读到旧结构。

| #   | 调用                                 | 作用与依赖                                                                                                                                                            |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 内联 DDL + `migrateBooksDropColumns` | 建 `settings` / `books` / `book_covers`；随后老库删除 `books.author` / `books.targetWords`                                                                            |
| 2   | `seedBooksIfEmpty`                   | 空实现（样例书已下线），首启书籍由教学书重灌负责                                                                                                                      |
| 3   | `createChapterSchema`                | `volumes` / `chapters`，引用 `books`，必须在其后                                                                                                                      |
| 4   | `createAiChatSchema`                 | `ai_chat_sessions` → `ai_chat_messages`，引用 `books` / `chapters`                                                                                                    |
| 5   | `createParagraphSchema`              | `paragraphs`，引用 `chapters`                                                                                                                                         |
| 6   | `createOutlineItemsSchema`           | `outline_items`，复用 `volumes` 卷池（复合外键）                                                                                                                      |
| 7   | `createEntitySchema`                 | 旧实体域 `entities` / `entity_aliases` / `entity_relations`                                                                                                           |
| 8   | `createWorldSubtypesSchema`          | `world_subtypes`；主表 `subtype_id` 外键指向它，必须先建                                                                                                              |
| 9   | `createWorldEntitiesSchema`          | `world_entities` + 通用附属表 + 索引 + 2 个触发器                                                                                                                     |
| 10  | `migrateDropLegacyDossierTables`     | 下线旧四域表（`worldviews` / `characters` / `factions` / `items` 等）                                                                                                 |
| 11  | `createWorldPowersSchema`            | `world_power_system`；触发器会写该表，须紧随主表                                                                                                                      |
| 12  | `applyCleanWordsSetup`               | 建 `clean_word_list` → 删旧违禁词表 → 首播内置词库（顺序不可换）                                                                                                      |
| 13  | `migrateWorldTablesDropDown`         | 下线 22 张境界专表 / 专用关系表 / 明细表，须在建表后、种子前                                                                                                          |
| 14  | `createPlotSchema` + 3 个剧情迁移    | 建 `plot_lines` / `plot_scenes` / `plot_scene_world_entities`；删 `characters`、富文本化、时间线归属收敛                                                              |
| 15  | 设定库结构收敛                       | `powerSystemType` → `dropUnusedColumns` → 建子类表（世界观 / 物品 / 势力 / 自定义 4 组）→ 关系属性下线 → 关系四码收敛 → 清脏端点                                      |
| 16  | 设定库字段收敛                       | `gradeRankDown` → `dropSubTypeText` → `dropSummary` → `characterSplit` → `customKeyValue`                                                                             |
| 17  | 其余域建表                           | `daily_stats` / `categories` / `images` / `chip_colors`，随后 `ensureChipColors()`                                                                                    |
| 18  | 种子与回填                           | `seedCategoriesOnce` → `resetChapterDataOnce` → `seedSemanticCodeDictionary` → 正文 JSON 回填与派生文本重算 → `seedDemoWorldEntities` → `seedWorldSubtypePresetsOnce` |
| 19  | 时间线与 i18n 收尾                   | `migrateAllTimelines` → `migrateI18nChineseDefaults`，清理必须覆盖前面种子写入的行                                                                                    |

依赖要点：

- **先分类后实体**：`world_subtypes` 先于 `world_entities`，后者 `subtype_id` 外键 `ON DELETE SET NULL`。
- **先主表后迁移**：主表重建类迁移（四类→五类、删四列）依赖 `world_entities` 已存在；子类表必须等主表重建完成后再建。
- **先建表后删表**：`world:tablesDropDown:v1` 必须在建表之后、种子之前，避免老库残留结构被自检判为多余。
- **种子最后**：演示实体依赖书行、分类、剧情线均已就绪；i18n 清理必须在全部种子之后。

任一步抛错都会记录 `数据库建表 / 种子 / 迁移失败` 并向上抛出；各迁移内部自带事务，失败即回滚且不写守卫键，下次启动重试。

## 3. schema 文件与表来源

设计表共 **49 张**：`index.ts` 内联 3 张，`schema/*.ts` 46 张。

| 文件                               | 表数 | 表名                                                                                                                                         |
| ---------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/index.ts`（内联）        | 3    | `settings`、`books`、`book_covers`                                                                                                           |
| `schema/chapters.ts`               | 2    | `volumes`、`chapters`                                                                                                                        |
| `schema/paragraphs.ts`             | 1    | `paragraphs`                                                                                                                                 |
| `schema/outlineItems.ts`           | 1    | `outline_items`                                                                                                                              |
| `schema/entities.ts`               | 3    | `entities`、`entity_aliases`、`entity_relations`                                                                                             |
| `schema/plot.ts`                   | 3    | `plot_lines`、`plot_scenes`、`plot_scene_world_entities`                                                                                     |
| `schema/aiChat.ts`                 | 2    | `ai_chat_sessions`、`ai_chat_messages`                                                                                                       |
| `schema/dailyStats.ts`             | 1    | `daily_stats`                                                                                                                                |
| `schema/categories.ts`             | 1    | `categories`                                                                                                                                 |
| `schema/images.ts`                 | 1    | `images`                                                                                                                                     |
| `schema/chipColors.ts`             | 1    | `chip_colors`                                                                                                                                |
| `schema/cleanWords.ts`             | 1    | `clean_word_list`                                                                                                                            |
| `schema/worldSubtypes.ts`          | 1    | `world_subtypes`                                                                                                                             |
| `schema/worldEntities.ts`          | 8    | `world_entities`、`world_character`、`world_texts`、`world_aliases`、`world_tags`、`world_entity_tags`、`world_semantic_codes`、`world_refs` |
| `schema/worldPowers.ts`            | 1    | `world_power_system`                                                                                                                         |
| `schema/worldWorldviewSubtypes.ts` | 6    | `world_overview`、`world_geography`、`world_culture`、`world_race`、`world_economy`、`world_ruleset`                                         |
| `schema/worldItemSubtypes.ts`      | 6    | `world_weapon`、`world_skill`、`world_pill`、`world_talent`、`world_equipment`、`world_material`                                             |
| `schema/worldFactionSubtypes.ts`   | 6    | `world_sect`、`world_family`、`world_dynasty`、`world_guild`、`world_alliance`、`world_demonic`                                              |
| `schema/worldCustom.ts`            | 1    | `world_custom`                                                                                                                               |

**`world_entities` 的陷阱**：它不在 `worldEntities.ts` 里以字面量 `CREATE TABLE` 出现，而是由 `worldEntitiesTableDdl(tableName, options?)` 模板函数生成——新库建表与两处老库重建迁移共用同一份 DDL。用 `grep "CREATE TABLE.*world_entities"` 会漏掉它，必须查函数调用。

`worldEntities.ts` 还维护 2 个触发器：`trg_world_entities_subtype_insert`（插入主行按 `entity_type` 补建 `world_character` / `world_power_system` 子行）与 `trg_world_entities_subtype_update`（类型变更时迁行）。触发器每次启动 `DROP + CREATE`，保证老库定义同步。

命名索引共 **40 个**，按文件分布：`chapters` 6、`outlineItems` 5、`entities` 6、`plot` 5、`categories` 1、`images` 1、`aiChat` 2、`worldEntities` 10、`worldSubtypes` 1、`worldCustom` 1、`cleanWords` 2。`UNIQUE` 约束产生的 `sqlite_autoindex_*` 属自动对象，不计入。

## 4. 一次性迁移与守卫键

一次性迁移统一采用「settings 守卫键 + 事务」模式：

1. `SELECT 1 FROM settings WHERE key = ?`，命中即返回；
2. `db.transaction(() => { ...业务...; INSERT/UPDATE settings 键 })()`；
3. 任一步失败整体回滚且不置键，下次启动自动重试。

守卫键值通常为 `'1'`；内置违禁词播种存导入结果 JSON，便于排查。**更换键名即可强制老库重跑**（教学书重灌即用此机制）。

| 域                                    | 守卫键                               | 实现文件                            | 作用                                                                                   |
| ------------------------------------- | ------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------- |
| 书籍                                  | `books:dropAuthorTargetWords:v1`     | `booksDropColumns.ts`               | 删除 `books.author` / `books.targetWords` 两列                                         |
| 教学书（跨章节 / 大纲 / 剧情 / 实体） | `chapterData:v59:migrated`           | `chapterSeed.ts`                    | 教学书全量重灌（详见 §6）                                                              |
| 剧情                                  | `plot:dropCharacters:v1`             | `plotMigrations.ts`                 | 删除 `plot_scenes.characters`                                                          |
| 剧情                                  | `plot:descriptionRich:v1`            | `plotMigrations.ts`                 | 纯文本 `description` 包成富文本写入 `description_json`                                 |
| 剧情                                  | `plot:lineTimeline:v1`               | `plotMigrations.ts`                 | `timeline_id` / `default_origin` 空值收敛                                              |
| 剧情                                  | `plot:descriptionBlocks:v1`          | `derivedTextBlocksBackfill.ts`      | 按块级分隔口径重算派生 `description`                                                   |
| 设定库                                | `dossier:dropLegacyTables:v1`        | `legacyDossierDrop.ts`              | 下线旧四域表及别名 / 关系 / 类型表                                                     |
| 设定库                                | `world:tablesDropDown:v1`            | `worldTablesDropDown.ts`            | 下线境界 4 表 + 专用关系 15 表 + 明细 3 表                                             |
| 设定库                                | `worldEntities:powerSystemType:v1`   | `worldPowerSystemMigration.ts`      | 重建主表，四类扩为五类（`power_system`）                                               |
| 设定库                                | `worldEntities:dropUnusedColumns:v1` | `worldEntitiesDropUnusedColumns.ts` | 重建主表，删 `status` / `source` / `visibility` / `parent_id`                          |
| 设定库                                | `worldRefs:dropAttrs:v1`             | `worldRefAttrsDrop.ts`              | 下线 `world_ref_attrs`                                                                 |
| 设定库                                | `worldRefs:hierarchy:v1`             | `worldRefsHierarchyMigration.ts`    | 清空存量关系，字典收敛为四码                                                           |
| 设定库                                | `worldRefs:pruneDeletedEndpoints:v1` | `worldRefsPruneDeletedEndpoints.ts` | 清理端点为软删实体的关系 / 场景关联                                                    |
| 设定库                                | `worldItem:gradeRankDown:v1`         | `worldItemGradeRankDown.ts`         | 品阶下沉到物品子表，删 3 张模块子表                                                    |
| 设定库                                | `worldEntities:dropSubTypeText:v1`   | `worldEntitiesDropSubTypeText.ts`   | 文本 `sub_type` 回填为 `subtype_id` 后删列                                             |
| 设定库                                | `worldEntities:dropSummary:v1`       | `worldEntitiesDropSummary.ts`       | 删除主表与境界表的 `summary` 列                                                        |
| 设定库                                | `worldSubtypes:characterSplit:v1`    | `worldSubtypeCharacterSplit.ts`     | 「角色」拆为主角 / 配角 / 龙套 / 反派                                                  |
| 设定库                                | `worldCustom:keyValue:v1`            | `worldCustomKeyValue.ts`            | `world_custom` 由固定 4 列改为键值行式                                                 |
| 设定库                                | `world_texts:bodyJson:v1`            | `worldTextsBodyJsonBackfill.ts`     | `world_texts.body` 纯文本回填 `body_json`                                              |
| 设定库                                | `world_texts:bodyBlocks:v1`          | `derivedTextBlocksBackfill.ts`      | 按 `body_json` 重算派生 `body`                                                         |
| 分类                                  | `categories:seed:v1`                 | `categories.ts`                     | 官方分类首播（一级 33 / 二级 145）                                                     |
| 违禁词                                | `cleanWords:dropWorldDetails:v1`     | `schema/cleanWords.ts`              | 下线 `world_forbidden_words` / `world_substitutions`                                   |
| 违禁词                                | `cleanWords:seed:v1`                 | `schema/cleanWords.ts`              | 内置词库首播（853 个去重词条）                                                         |
| 时间线                                | `timeline:migrated:v1`               | `timeline.ts`                       | 老 `timeline:origin:<bookId>` 迁入列表 / 选中键；另按书写 `timeline:migrated:<bookId>` |
| i18n                                  | `i18n:defaultsCleanup:v1`            | `i18nDefaultsCleanup.ts`            | 清空存量中文默认值（时间线 / 剧情线 / 场景时间）                                       |

> 例外：`timeline:migrated:v1` 是**完成标记**而非短路守卫。`migrateAllTimelines()` 每次启动都会遍历书籍调用 `ensureTimelineList()`，后者按书判断 `timeline:list:<bookId>` 是否已存在，已存在时只校正选中 id，因此重复执行安全；全局键仅用于标记该批迁移已跑过。

补充约定：

- 重建主表类迁移共用 `worldEntitiesTableDdl()`，新旧列定义逐字一致，避免「新库 / 迁移后」结构漂移。
- 迁移只删固定白名单表名，不做动态 SQL 拼接；`DROP TABLE IF EXISTS` 本身也保证重复执行为空操作。
- 迁移与建表同属启动关键路径，**不要**在迁移里做 JSON 解析等易抛错的重活；`i18nDefaultsCleanup` 将解析放在事务外。

## 5. 种子体系

种子分「一次性」与「每次启动幂等补齐」两类：

| 种子           | 规模               | 守卫                            | 行为                                               |
| -------------- | ------------------ | ------------------------------- | -------------------------------------------------- |
| 官方分类       | 一级 33 / 二级 145 | `categories:seed:v1`            | 单事务插入两级树，`is_custom = 0`                  |
| 胶囊配色       | 28 行色对          | 无 settings 键                  | 每次启动 `INSERT OR IGNORE`，不覆盖用户改色        |
| 教学书         | 1 本 / 5 卷        | `chapterData:v59:migrated`      | 全量重灌卷章、正文、大纲、剧情、实体（§6）         |
| 子类预设       | 23 条 / 书         | `worldSubtypes:presets:v1`      | 为既有书籍补齐；新建书由 `createBook` 即时写入     |
| 关系语义码     | 4 个               | 无键                            | 每次启动 `ON CONFLICT(code) DO NOTHING` 补齐新增码 |
| 内置违禁词     | 853 行             | `cleanWords:seed:v1`            | 首次导入；已存在同词保留用户启停意图               |
| 教学书演示实体 | 5 类若干           | `worldEntities:seeded:<bookId>` | 按书播种；重灌时先删标记再重播                     |
| 样例书籍       | 0                  | 无                              | `seedBooksIfEmpty()` 为空实现，样例书已下线        |

要点：

- **分类名称是数据常量**（`BOOK_CATEGORIES` 镜像），不进入 i18n 资源；`origin_id` 保留官方 ID 便于对齐。
- **23 条预设子类**：世界观 6 / 物品 6 / 势力 6 / 角色 4 / 境界体系 1，定义在 `worldSubtypes.ts` 的 `PRESET_WORLD_SUBTYPES`；`preset_key` 为 ASCII 路由键，与胶囊配色、专属子表映射共用。
- **4 个语义码**：`superior` / `subordinate` / `belongs_to` / `peer`，码表真源 `worldSemanticCodes.ts` 的 `HIERARCHY_SEMANTIC_CODES`；**展示名真源为渲染层 i18n**（`dossier` ns 的 `detail.relation.typeName.*` 类型名、`detail.relation.peerLabel.*` 对端身份标签），`src/shared/worldRelationCodes.ts` 的中文名只写进 `world_semantic_codes.note`，供未知 / 自定义码兜底。
- **无键种子必须真幂等**：胶囊配色与语义码每次启动都会执行，只允许 `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING`，不得覆盖用户数据。

## 6. 教学书重灌机制

教学书是首启唯一书籍，固定 `id = 'guide'`，标题「Writer's Forge · 使用指南」。重灌入口 `src/main/database/chapterSeed.ts` 的 `resetChapterDataOnce()`，守卫键：

```ts
const MIGRATION_KEY = 'chapterData:v59:migrated'
```

### 6.1 重灌范围

同一事务内依次执行：

1. `clearChapterDomain(GUIDE_BOOK.id)`：按书删除 `paragraphs` → `chapters` → `outline_items` → `volumes`，最后删 `plot_lines`（其下场景由外键级联）；
2. `clearWorldEntitySeedMarker`：删除 `worldEntities:seeded:guide`，允许演示实体重播；
3. `seedGuideBook()`：写书行 + 卷章 + 正文段落 + 大纲（含置顶独立条目）+ 2 条剧情线；
4. `seedDemoWorldEntities(GUIDE_BOOK.id)`：清空教学书设定库实体后按新文案重播；
5. `relinkGuidePlotSceneEntities`：实体 id 已变化，按名称回填场景关联；
6. 写入 `MIGRATION_KEY = '1'`。

范围严格按 `bookId` 隔离：用户自建书籍的正文、卷章、大纲、剧情与设定数据不受影响。

### 6.2 幂等边界

- 守卫键存在即直接返回；只有「换键」才会让老库重灌。当前键内含 `v52`，历史批次靠递增版本强制刷新教学文案。
- 事务失败整体回滚且不置键，下次启动重试；不会留下「清空一半」的教学书。
- 用户删除教学书后不会自动重灌——守卫键仍在，这是有意行为，避免删书后反复复活。
- 重灌会覆盖教学书的时间线 settings（`timeline:list:<bookId>` / `timeline:active:<bookId>`）。

### 6.3 已知盲区：`books` 行不更新

`seedGuideBook()` 写书行使用：

```sql
INSERT INTO books (...) VALUES (...)
ON CONFLICT(id) DO NOTHING
```

因此老库已存在 `guide` 行时，**书籍元信息不会更新**：`title` / `intro` / `categories` / `status` / `coverColor` 保持旧值，即便教学书正文、大纲、实体都已按新版本重灌。修改书籍元信息（例如简介、封面色）时，只改种子不会影响老库；需要同步更新老库时必须另写一次性 `UPDATE` 迁移，或在重灌事务内显式更新该行。

`seedBooksIfEmpty()` 为空实现（`books.ts:369-371`），首启书籍完全由教学书重灌产生；旧样例书已不存在，文档与排查脚本不要假设其存在。

## 7. 诊断自检

### 7.1 设计结构真源

`src/main/database/diagnostics/expected.ts` 是「设计」一侧的唯一真源：

- `EXPECTED_TABLES`：49 张表 + 逐表列集合（顺序无关，大小写敏感，`books` 的驼峰列名不可归一化）；
- `EXPECTED_INDEXES`：40 个命名索引，只比对**索引名集合**，不比对索引列 / WHERE 文本（避免 SQL 文本规范化造成假阳性）；
- 分片：`expectedWorldSubtypes.ts`（1 表 1 索引）、`expectedWorldviewSubtypes.ts`（6 表）、`expectedItemFactionSubtypes.ts`（12 表 + `world_custom` 1 表 1 索引）、`expectedWorldPowers.ts`（1 表 0 索引）。

新库和老库的实测结构都必须与清单**严格相等**：多一张表、少一列、多一个索引都会报问题。

### 7.2 检查项

`runDiagnostics()` 在 `getDb()` 之后、窗口创建之前同步执行一次，结果存主进程内存：

1. **结构**（`structure.ts`）：`sqlite_master` + `PRAGMA table_info` 与设计清单严格比对，过滤 `sqlite_%` 自动对象；问题码 `structure.missingTable` / `extraTable` / `missingColumn` / `extraColumn` / `missingIndex` / `extraIndex`。
2. **外键悬空**（`checks.ts`）：`PRAGMA foreign_key_check` 一次覆盖全部声明外键，问题码 `foreignKey.orphan`。
3. **应用层不变量**（`checks.ts`）：B1 每卷必有卷纲行、B7 每卷至多一条、B2 分组卷下不得有章、B3 特殊章须有前段与名段、B4 普通章不得 `pin`、B5 特殊章不得在自定义卷、B6 大纲条目 `kind` / `volume_id` / `scope` 一致；对应 `invariant.*`。
4. **设定库 / 剧情关联**（`worldChecks.ts`）：孤儿子表行、实体类型与子表错位、`world_refs` 自反、`plot_scene_world_entities` 悬空；对应 `world.*` / `plot.sceneEntityOrphan`。
5. **文件完整性**（`checks.ts`）：`PRAGMA quick_check`，问题码 `integrity.corrupt`。

自检自身异常不会中断启动：降级为 `diagnostics.internalError` 或 `diagnostics.checkFailed`；表缺失时依赖它的检查自动跳过，避免连锁报错。

### 7.3 对外通道

- 主进程启动时跑一次，报告存内存；
- IPC 通道 `diagnostics:get` 只读回传（`src/main/ipc/diagnostics.ts`），preload 暴露为 `window.api.diagnostics.get()`；
- 报告只含问题码与参数（`code` + `params`），**不含用户可见文案**；渲染层经 `diagnostics` 命名空间按 `issue.<code>.title` / `.detail` 渲染。新增问题码必须同步双端 i18n 资源与 `types.ts` 的字面量联合。

## 8. 维护义务

改动数据库结构时，以下三处必须同一提交内同步：

1. **DDL**：`src/main/database/index.ts` 或 `src/main/database/schema/*.ts`；
2. **结构真源**：`src/main/database/diagnostics/expected.ts`（表 / 列 / 索引名逐字一致；分片表改对应分片文件）；
3. **分层文档**：`docs/specs/database/table-layers.md`。

漏改任一处，新库启动自检会报 `structure.*`，或文档与实现漂移。另需注意：

- **迁移顺序**：新增迁移必须插入到依赖满足的位置（建表之后、种子之前、相关列仍存在时），并在注释中写明「须在 X 之后」。
- **守卫键**：一次性迁移必须有 settings 键、事务包裹、失败不置键；新键命名沿用 `<域>:<动作>:v1`。
- **种子文档**：新增功能或不兼容交互变更时，按 AGENTS §7.5 同步 `seedGuideBook/`，教学文案与按钮、快捷键、默认值逐条一致。
- **i18n 数据边界**：分类枚举、预设子类名仍是数据常量，不拆进 i18n 资源；**关系语义码展示名例外**——四个内置码的展示名已改由渲染层 i18n 提供（`dossier` ns 的 `detail.relation.typeName.*` / `peerLabel.*`），`world_semantic_codes.note` 收缩为未知 / 自定义码的兜底文案（仍为中文数据常量、不译）。
- **单文件上限**：数据层单文件不得超过 500 行；装配逻辑过多时按域拆到独立模块，由 `getDb()` 单行调用（`applyCleanWordsSetup` 即此模式的范例）。

## 9. 数据文件位置

| 内容         | 路径                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| 数据库主文件 | `<userData>/writers-forge.db`                                           |
| WAL 日志     | `<userData>/writers-forge.db-wal`（运行期存在）                         |
| 共享内存索引 | `<userData>/writers-forge.db-shm`（运行期存在）                         |
| 主进程日志   | `<userData>/logs/main.log`                                              |
| 备份临时快照 | `<系统临时目录>/writers-forge-backups/writers-forge-YYYYMMDD-HHmmss.db` |
| 云端备份     | OneDrive 应用专属目录 `backups/` 下同名 `.db` 文件                      |

`userData` 目录：打包安装态为系统 AppData 下的 `Writer's Forge`，本地开发态为项目根下的 `user_data/`（`src/main/appPaths.ts`）。排查前先确认当前是哪个目录，两者数据完全独立。

备份入口：设置弹窗「OneDrive 云备份」分区（`onedrive:backup` IPC）。流程为 `getDb().backup()` 生成一致性快照 → 上传到 OneDrive approot 的 `backups/`；快照生成在 WAL 模式下是安全的，**不要**用文件复制替代。当前没有本地手动导出入口，「数据与备份」分区仍是禁用占位。

最后核对：2026-10-31

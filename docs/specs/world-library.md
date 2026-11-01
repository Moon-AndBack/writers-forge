# 统一设定库（世界库）规范

Writer's Forge 的「世界观 / 角色 / 物品功法 / 势力 / 境界体系」五类设定，共用一张主表 `world_entities` 与一套子类、附属、关系体系，本文统称**统一设定库**。本文说明其领域模型、表结构、子类与字段白名单、关系语义、正文双列、胶囊配色链路、读写路径与界面落点。

真源声明：结构以 `src/main/database/schema/worldEntities.ts`（模板 DDL）+ `schema/world{Worldview,Item,Faction}Subtypes.ts` / `schema/worldCustom.ts` / `schema/worldPowers.ts` 为准；类型与枚举以 `src/main/database/worldEntityTypes.ts` 为准；子类预设以 `worldSubtypes.ts` 的 `PRESET_WORLD_SUBTYPES` 为准；字段白名单以 `src/shared/worldSubtypeFields.ts` 为准；语义码以 `src/shared/worldRelationCodes.ts` 为准。文档只做解释，冲突一律以代码为准。

## 1. 领域模型总览

```
                    ┌───────────────────────────────────────────┐
                    │        world_entities（统一主表）         │
                    │  id · uuid · book_id · entity_type        │
                    │  subtype_id · name · revision             │
                    │  created_at · updated_at · deleted_at     │
                    └───────┬───────────────┬───────────────────┘
                            │ 1:1 附属      │ N:1 分类
              ┌─────────────┴──────┐   ┌────┴─────────────────────────┐
              │ world_texts        │   │ world_subtypes               │
              │  body / body_json  │   │  23 预设 + 用户自定义（软删）│
              ├────────────────────┤   └────┬─────────────────────────┘
              │ world_aliases      │        │ preset_key 路由
              │ world_tags         │   ┌────┴─────────────────────────┐
              │ world_entity_tags  │   │ L3 子分类表（18 张，一对一） │
              └────────────────────┘   │ world_overview … ruleset     │
                                       │ world_weapon … material      │
              ┌────────────────────┐   │ world_sect … demonic         │
              │ world_refs（有向） │   └────┬─────────────────────────┘
              │  from_id · to_id   │        │ 未命中预设
              │  semantic_code     │   ┌────┴─────────────────────────┐
              │  role / note / 序  │   │ world_custom（键值行，仅     │
              └─────────┬──────────┘   │ item / faction 自定义子类）  │
                        │              └──────────────────────────────┘
              ┌─────────┴──────────┐
              │ world_semantic_codes│  4 码字典（superior / subordinate
              │  code / note       │  / peer / belongs_to）
              └────────────────────┘
```

模块级子表只剩 2 张：`world_character`（仅 `role`）与 `world_power_system`（仅 `kind`）。世界观 / 物品 / 势力的模块子表已在第 3 批下线，其字段全部下沉到 L3 子分类表。

**为什么是单表 + subtype，而不是五张表**

- 「统一寻址」：`id` 全局唯一，`world_refs` 两端、`world_texts` / `world_aliases` / `world_tags` 外键、正文实体高亮、悬停卡取详情都能只认一个 id，不必按类型分叉查询。
- 跨模块关系天然成立：角色属于势力、物品属于角色、势力与世界观互为上下级，只需一条 `(from_id, to_id, semantic_code)` 边，无需 N 张关系表或多态列。
- 类型只在**写入时**判别（`entity_type` CHECK 五值），读路径统一 `LEFT JOIN world_subtypes`；新增模块只扩枚举与子表，不改主表结构。
- 代价：类型专属字段不能放主表，必须靠子类表 / 模块子表承载（见 §4），行内只有身份与元信息。

## 2. 主表 `world_entities`

DDL 由 `worldEntitiesTableDdl('world_entities')` 生成，新库建表与两处老库重建迁移共用同一个模板函数，保证列定义逐字一致。

| 列            | 类型 / 约束                                                | 含义                                                                             |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `id`          | `INTEGER PRIMARY KEY AUTOINCREMENT`                        | 全库统一实体 id（关系、附属表、界面均以此寻址）                                  |
| `uuid`        | `TEXT NOT NULL UNIQUE`                                     | 稳定外部标识，创建时 `randomUUID()` 生成                                         |
| `book_id`     | `TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE`     | 归属书；删书级联删实体                                                           |
| `entity_type` | `TEXT NOT NULL CHECK (...)`                                | 类型判别列，五值 `worldview` / `character` / `item` / `faction` / `power_system` |
| `subtype_id`  | `INTEGER REFERENCES world_subtypes(id) ON DELETE SET NULL` | 子类外键；`NULL` 仅用于历史数据读取兼容（见 §10）                                |
| `name`        | `TEXT NOT NULL`                                            | 名称；**不设库级唯一约束**，同书允许重名实体                                     |
| `revision`    | `INTEGER NOT NULL DEFAULT 1`                               | 版本号；任何字段变更（含仅改别名 / 标签 / 正文）`+1`，供匹配缓存失效             |
| `created_at`  | `TEXT NOT NULL DEFAULT (datetime('now'))`                  | 创建时间                                                                         |
| `updated_at`  | `TEXT NOT NULL DEFAULT (datetime('now'))`                  | 更新时间；写路径用毫秒精度 `strftime('%Y-%m-%d %H:%M:%f','now')`                 |
| `deleted_at`  | `TEXT`                                                     | 非空 = 已软删；所有读路径过滤 `deleted_at IS NULL`                               |

合计 **10 列**（自增主键 `id` + 9 条业务列）；`summary`、`sub_type` 文本列、`status` / `source` / `visibility` / `parent_id` 均已从 DDL 删除。

- **软删除**：删除即终态，不提供回收站。`deleteWorldEntity` 在同一事务内置 `deleted_at`、`revision+1` 并**物理删除**该实体全部 `world_refs` 行（出边 + 入边），避免对端留下悬空关系；别名 / 标签 / 正文 / 子表字段随主行保留，由各自过滤条件保证不可见。
- **类型判别**：仅 `entity_type` 一列。数据库触发器 `trg_world_entities_subtype_insert` 在插入主行时按类型自动补建 `world_character` / `world_power_system` 行（`INSERT OR IGNORE`）；`trg_world_entities_subtype_update` 在 `entity_type` 变更时先清两张子表再按新类型补建。触发器每次启动 `DROP + CREATE`，保证老库定义同步。
- **索引**：`idx_world_entities_book_type (book_id, entity_type)`、`idx_world_entities_name (name)`、`idx_world_entities_subtype (subtype_id)`；旧 `..._book_type_status` / `..._parent` 随列下线并在启动时幂等清理。

## 3. 子类分类

子类**唯一真源**是 `world_subtypes` 表（`world_entities.subtype_id` → 本表），`name` 是展示名、`preset_key` 是稳定路由键。表约束 `UNIQUE (book_id, entity_type, name)`，删除为软删（仅置 `deleted_at`），读接口一律过滤 `deleted_at IS NULL`。

**23 条预设子类**（`PRESET_WORLD_SUBTYPES`，`is_custom = 0`，`sort_order` 各模块内独立从 0 递增）：

| 模块     | 名称     | `preset_key`        | 序  |
| -------- | -------- | ------------------- | --- |
| 世界观   | 世界概况 | `overview`          | 0   |
| 世界观   | 地理环境 | `geography`         | 1   |
| 世界观   | 文化背景 | `culture`           | 2   |
| 世界观   | 种族生物 | `race`              | 3   |
| 世界观   | 经济体系 | `economy`           | 4   |
| 世界观   | 世界规则 | `ruleset`           | 5   |
| 物品     | 武器     | `weapon`            | 0   |
| 物品     | 功法     | `skill`             | 1   |
| 物品     | 丹药     | `pill`              | 2   |
| 物品     | 天赋     | `talent`            | 3   |
| 物品     | 装备     | `equipment`         | 4   |
| 物品     | 材料     | `material`          | 5   |
| 势力     | 宗门     | `sect`              | 0   |
| 势力     | 家族     | `family`            | 1   |
| 势力     | 王朝     | `dynasty`           | 2   |
| 势力     | 商会     | `guild`             | 3   |
| 势力     | 散修联盟 | `alliance`          | 4   |
| 势力     | 魔教     | `demonic`           | 5   |
| 角色     | 主角     | `character-lead`    | 0   |
| 角色     | 配角     | `character-support` | 1   |
| 角色     | 龙套     | `character-extra`   | 2   |
| 角色     | 反派     | `character-villain` | 3   |
| 境界体系 | 境界体系 | `power_system`      | 0   |

- **`preset_key` 稳定键**：名称为数据常量（中文原文、不译），但**路由与配色一律按 `preset_key`**，用户改名不影响字段落表与配色；字段白名单、L3 子表选择、`.chip-p-*` 类名全部以它为准。
- **自定义子类**：`is_custom = 1`、`preset_key = ''`，由用户在界面新增（`worldSubtype:create`）。名称为空或同书同类型重名时被拒（唯一约束，IPC 收敛为 `null`）；同名分类若已软删则直接复活该行。
- **预设播种**：`ensurePresetSubtypes(bookId)` 为 `INSERT OR IGNORE` 语义，新建书即时播种，老库由 `worldSubtypes:presets:v1` 守卫一次性补播；不会复活用户已软删的预设行。
- **删除子类**：软删分类并在同一事务把其下实体的 `subtype_id` 置 `NULL`（归为未分类），不改实体 `updated_at` / `revision`（非内容变更）。
- **境界体系默认分类**：该模块不显示分类选择器，创建 / 更新缺省时由 `resolveDefaultSubtypeId` 自动补 `power_system` 预设分类；缺失则幂等补播一次，仍缺失按非法处理。
- **角色拆分**：原单条「角色」（`preset_key = 'character'`）已由一次性迁移 `worldSubtypeCharacterSplit.ts` 下线并重映射到上述四类。

## 4. 子类字段

字段白名单真源为 `src/shared/worldSubtypeFields.ts`（纯数据常量，主进程与渲染层共用，经 `worldEntityTypes.ts` 再导出）。路由规则：`subtype_id = null` → 不读写任何子表；`preset_key` 非空且命中预设 → 只读写对应 L3 子表；`preset_key = ''` → 只读写 `world_custom`，两者互斥。

| 模块   | `preset_key` | 允许的字段（4 个）                                                |
| ------ | ------------ | ----------------------------------------------------------------- |
| 世界观 | `overview`   | `era` · `scale` · `population` · `epoch`                          |
| 世界观 | `geography`  | `coordinates` · `climate` · `area` · `terrain`                    |
| 世界观 | `culture`    | `language` · `customs` · `religion` · `art`                       |
| 世界观 | `race`       | `lifespan` · `body_size` · `reproduction` · `habits`              |
| 世界观 | `economy`    | `currency` · `tax_rate` · `trade_routes` · `resources`            |
| 世界观 | `ruleset`    | `physics` · `magic` · `taboo` · `boundary`                        |
| 物品   | `weapon`     | `attack` · `durability` · `weight` · `material`                   |
| 物品   | `skill`      | `tier` · `practice` · `cost` · `requirement`                      |
| 物品   | `pill`       | `effect` · `side_effect` · `difficulty` · `shelf_life`            |
| 物品   | `talent`     | `talent_type` · `awaken_condition` · `growth` · `limitation`      |
| 物品   | `equipment`  | `defense` · `slot` · `set_bonus` · `durability`                   |
| 物品   | `material`   | `usage` · `grade_label` · `origin` · `reserve`                    |
| 势力   | `sect`       | `gate` · `disciples` · `heritage` · `precepts`                    |
| 势力   | `family`     | `patriarch` · `family_rules` · `bloodline` · `ancestral_teaching` |
| 势力   | `dynasty`    | `territory` · `law` · `army` · `capital`                          |
| 势力   | `guild`      | `business` · `funds` · `branches` · `reputation`                  |
| 势力   | `alliance`   | `form` · `members` · `goal` · `freedom`                           |
| 势力   | `demonic`    | `doctrine` · `ritual` · `taboo` · `sphere`                        |

五类的其余专属字段：

| 模块                  | 落表                             | 字段                                                                                     |
| --------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| 角色                  | `world_character`（模块子表）    | `role`（自由文本）                                                                       |
| 境界体系              | `world_power_system`（模块子表） | `kind`（体系类型，自由文本，无 CHECK）                                                   |
| 物品预设 5 类         | 对应 L3 子表                     | `grade`（显示标签）+ `rank`（可比较档位，0 = 未定级）；材料沿用 `grade_label`，无 `rank` |
| 物品 / 势力自定义子类 | `world_custom`（键值行）         | 字段名与值均由用户填写                                                                   |
| 世界观自定义子类      | 无                               | 无专属字段存储，只可写正文 / 别名 / 标签 / 关系                                          |

**自定义字段边界**（`CUSTOM_FIELD_LIMITS`）：单实体最多 **64** 行；字段名去首尾空白后 1–64 字符（`keyMaxLength = 64`）；字段值 ≤2000 字符（`valueMaxLength = 2000`）。写入语义为**整体替换**（先删后插），空数组即清空；空白键 / 重复键跳过，按 `sort_order, field_key` 读取。

**校验位置（三层）**：

1. 渲染层：`CustomKeyValueEditor` 提前收敛空键 / 重复键，`SubtypeFieldsPanel` 按 `presetKey` 取字段组，只渲染该子类的字段。
2. IPC 层：`ipc/worldEntities.ts` 解析入参时按「该类型全部预设子类字段并集」初筛；`ipc/worldSubtypeFields.ts` 的 `validateSubtypeFields` 再按**生效子类**复核白名单 / 键值边界，不通过整单拒绝（返回 `null`）。
3. 数据层：`worldEntitySubtypeFields.ts` 写入前再按白名单过滤一次（非法键静默丢弃），子表行按需 `INSERT OR IGNORE` / `DELETE`；子类迁移时物品品阶随行搬运。

## 5. 关系模型

关系存于 `world_refs`，一条行 = 一条**有向**边：`from_id → to_id`，附 `semantic_code`（必填）、`role`、`note`、`sort_order`、`valid_from` / `valid_to`。约束 `CHECK (from_id <> to_id)`；两端须同书、未软删，端点类型不受限制（世界观同样可作起点 / 终点）。

**4 个语义码**（`HIERARCHY_SEMANTIC_CODES` / `RELATION_SEMANTIC_LABELS`，`from_type` / `to_type` 全为 `NULL`，字典不按模块收窄）：

| 码            | 展示名 | 方向语义              | 可选组合（渲染层过滤）        |
| ------------- | ------ | --------------------- | ----------------------------- |
| `superior`    | 上级   | `from` 是 `to` 的上级 | 世界观 / 势力 → 世界观 / 势力 |
| `subordinate` | 下级   | `from` 是 `to` 的下级 | 同上                          |
| `peer`        | 平级   | 两端互不统属          | 同上                          |
| `belongs_to`  | 属于   | `from` 属于 `to`      | 其余任意模块组合              |

- **双向查询**：`listWorldRefs(entityId, code?)` 取出边（`from_id`），`listWorldRefsTo(...)` 取入边（`to_id`），各按 `sort_order, id` 排序，均可按语义码筛选。卡片摘要由 `loadRelationSummaryMap` 批量补齐（两条 IN 查询，出边在前、入边在后，避免逐卡 N+1），摘要自带对端 `peerEntityType` / `peerSubType` / `peerPresetKey` 供上色。
- **反向存储**：角色 → 物品固定记为「物品属于角色」（`from = 物品`、`to = 角色`），不出现「角色属于物品」；`isReverseRelation` 判定，写库时交换两端。
- **`role` 与 `note`**：`role` 原为关系名，第 7 批起降级为补充说明（界面上已移除该输入，写库固定空串，存量值不再展示）；`note` 为备注，可空。
- **去重规则**：数据层**没有** `(from_id, to_id, semantic_code)` 唯一约束，`addWorldRef` 只拦自指、跨书、端点已软删、空码与字典外码。重复建边由交互层规避：候选列表排除已有关联目标（出边 `toId` 全排除；角色 → 物品反向场景额外排除入边中的物品），因此同一对实体在界面上不会出现同向重复边。
- **删除**：`removeWorldRef` 物理删除单行；实体软删时 `deleteWorldRefsForEntity` 清空其全部出入边。

## 6. 别名 / 标签 / 正文

- **别名**（`world_aliases`）：一条实体多行，`alias` + `kind`（自由文本，默认 `other`）+ `sort_order`。写入为**整体替换**（先清后插），去首尾空白、去空串、按首次出现去重；列表按 `sort_order, id`。别名同时是实体高亮匹配的词表来源（`entities:match`）。
- **标签**（`world_tags` + `world_entity_tags`）：标签是**按书隔离的字典**，`UNIQUE (book_id, name)`；实体与标签多对多，写入先 upsert 字典再重建关联。`listWorldTags` 返回每标签的 `usageCount`（`COUNT(entity_id)`）。
- **正文**（`world_texts`，与实体一对一）：

| 列          | 角色                                     | 可见性                                      |
| ----------- | ---------------------------------------- | ------------------------------------------- |
| `body_json` | **真源**：整条块级 Tiptap JSON           | 仅详情（`worldEntity:get` / `getText`）返回 |
| `body`      | **派生**纯文本摘要，块级之间以 `\n` 分隔 | 列表与详情都返回，供卡片截断 / 搜索         |

写入为 upsert 且**两列整体替换**：`writeWorldText(entityId, body, bodyJson)` 未提供的列按空串落库，故调用方必须成对传参（`DossierUpdatePatch.body` 与 `bodyJson` 成对提交），否则摘要与真源失步。

两条一次性迁移（`settings` 键守卫，均事务包裹、失败回滚不置键）：

1. `world_texts:bodyJson:v1`（`worldTextsBodyJsonBackfill.ts`）：`body → body_json`，仅处理 `body_json = '' AND body <> ''` 的行，按行拆 `paragraph` 生成块级 JSON。
2. `world_texts:bodyBlocks:v1`（`derivedTextBlocksBackfill.ts`）：`body_json → body`，按现行「块间插 `\n`」口径重算派生列，派生为空或与原值相同则跳过。

## 7. 胶囊配色

配色真源是 `chip_colors` 表，共 **28 行** = `scope = 'preset'` 的 **23 行**（对齐 23 条预设子类）+ `scope = 'module'` 的 **5 行**（五模块自定义分类兜底色）。每行即一个「`bg` 实色底 + `fg` 配对文字色」色对，`CHECK` 限定 `scope` / `module`，`UNIQUE (scope, module, preset_key)`；种子 `CHIP_COLOR_SEEDS` 用 `INSERT OR IGNORE` 幂等补齐，**不覆盖**用户改过的颜色，故无需 settings 守卫键。

| scope    | 行数 | 键                          | 用途                                                |
| -------- | ---- | --------------------------- | --------------------------------------------------- |
| `preset` | 23   | `preset_key`（如 `weapon`） | 预设子类独立色（`.chip-p-<presetKey>`）             |
| `module` | 5    | `preset_key = ''`           | 自定义分类 / 未分类兜底色（`.chip-m-<entityType>`） |

**类名查表优先级**（`presetChipColors.ts` / `relationChip.ts`）：

1. `presetKey` 命中 23 预设 → 挂 `.chip-m-<type> .chip-p-<presetKey>`，**预设色生效**；
2. 未命中（自定义子类 / 未分类 / 空串）→ 只挂 `.chip-m-<type>`，回落模块兜底色；
3. 都未命中 → `chip-pill-tokens.css` 的 `:root` 默认 `--chip-mix` 兜底，保证始终有色可辨。

`presetKey` 判定用 `hasOwnProperty`，避免 `toString` 等原型链键被误判。

**注入链路**：`ChipColorProvider`（挂在应用根部）启动时经 `window.api.chipColors.list()` 读一次全表 → `applyChipColors(rows)`（`theme/chipColorInject.ts`）→ 生成 `.chip-p-*` / `.chip-m-*` 类规则写入 `<style id="chip-color-overrides">` 追加到 `document.head` 末尾。之所以必须注入**类规则**而非改 `:root` 变量：`--chip-*` 在各胶囊类规则内被重新赋值，根节点值会被就地覆盖。注入时**模块规则在前、预设规则在后**，同特异性（0,1,0）下预设色胜出；选择器经 `^[a-z_-]+$` 白名单、色值经 `#rrggbb` 校验，非法行跳过并回落静态 CSS。

`styles/chip-preset-colors.css` 是**首帧副本**（23 条 `.chip-p-*` + 5 条模块色的静态值），仅用于避免「启动旧色 → 注入新色」跳变；改数据库配色时必须同步该文件与 `chip-pill-tokens.css`。

## 8. 读写路径与 IPC 摘要

数据层按职责拆分，`worldEntities.ts` 只做再导出（`worldEntityTypes` / `worldEntityMeta` / `worldRefs` / `worldPower*` / `worldEntityQueries` / `worldEntityWrites` / `worldSubtypeFields`）。读：`listWorldEntities(bookId, type?, subtypeId?)`、`getWorldEntity(id)`；写：`createWorldEntity` / `updateWorldEntity` / `deleteWorldEntity`，均包事务，子表行由触发器保证存在。

IPC 共 **19 个** `worldEntity:*` 通道，按用途分四组：

| 组        | 通道                                                                                         | 说明                                                                                    |
| --------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 主表 CRUD | `list` / `get` / `create` / `update` / `delete`                                              | `delete` 为软删；`create` 缺分类时自动补境界体系默认分类，其余类型缺分类直接返回 `null` |
| 附属      | `listAliases` / `setAliases` / `getText` / `saveText` / `listTags` / `setTags`               | 别名 / 标签 / 正文整体替换；正文单字段上限 2 MB 字符                                    |
| 关系      | `listRefs` / `listIncomingRefs` / `listSemanticCodes` / `addRef` / `updateRef` / `removeRef` | 出边 / 入边 / 字典 / 增改删                                                             |
| 境界体系  | `listPowerSystems` / `updatePowerSystem`                                                     | 列表只读 + 写「体系类型」                                                               |

另有独立前缀：`worldSubtype:list|create|update|delete|ensurePresets`（5 个）与 `chipColors:list`（1 个）。入参校验口径统一：非法一律返回 `[]` / `null` / `false`，不向渲染层抛异常；写失败记 error 日志后按通道语义回落。

实体匹配不在本前缀：`entities:match(bookId, text)` 与 `entities:revision(bookId)` 的词表已切到 `world_entities` + `world_aliases`，通道名保留以兼容既有调用方。

## 9. 渲染层落点

主目录 `src/renderer/src/pages/writer/dossier/`，五域共用同一套组件，按 `DossierModule`（`worldview` / `characters` / `factions` / `power_system` / `items`）参数化，`MODULE_ENTITY_TYPE` 映射到 `entity_type`。

| 文件                                                                         | 职责                                                                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DossierView.tsx`                                                            | 中栏装配：新建入口 + 卡片网格 + 编辑 / 关系 / 删除三个弹窗；两层悬停卡（关系胶囊 → 对端详情，「+N」浮窗内胶囊 → 第二层详情）的浮层状态机 |
| `DossierCard.tsx`                                                            | 单卡：名称 / 别名 / 正文摘要 / 关系行；关系行按容器实测宽度做「+N」折叠                                                                  |
| `dossierCardRelations.ts` / `relationChip.ts`                                | 关系胶囊文案与配色类名（纯函数，卡片 / 悬停卡 / 浮窗三处共用）                                                                           |
| `DossierCreateDialog.tsx` / `DossierEditDialog.tsx` / `SubTypeSelect.tsx`    | 名称、类别（子类）、别名、标签编辑；类别下拉含新增 / 删除自定义子类                                                                      |
| `DossierDetail.tsx`                                                          | 右栏上下两张卡 + 底部保存条：上卡子类字段，下卡富文本正文；集中持草稿、比对脏态、点保存才提交「仅变更字段」补丁                          |
| `SubtypeFieldsPanel.tsx` / `CustomKeyValueEditor.tsx`                        | 子类专属字段面板（按 `presetKey` 路由）、自定义子类键值编辑器；受控组件，不直接写库                                                      |
| `DossierBodyEditor.tsx`                                                      | 正文富文本编辑器，`EntityHighlight` 按书匹配（`entities:match`），与章节 / 剧情正文同一高亮口径；正文两列成对提交                        |
| `DossierRelationsDialog.tsx` / `RelationList.tsx`                            | 关联关系弹窗：出边 / 入边同表渲染、就地改类型与备注；新增区按「当前模块 × 目标模块」过滤可选语义码                                       |
| `useDossierWorkspace.ts` / `useDossierBundle.ts` / `useDossierMutations.ts`  | 列表 / 详情 / 别名 / 标签 / 关系装配与写入链串行化（写后重拉缓存失效）                                                                   |
| `useRelationDraft.ts` / `useRelationTargets.ts` / `useRelationCategories.ts` | 新增关系草稿：跨模块候选、已关联目标排除、反向存储判定、类别下拉数据                                                                     |

正文高亮与悬停卡：`pages/writer/entities/entityHighlight.ts` 的 `EntityHighlight` 扩展按段落缓存匹配结果（键 = 书 + 词表版本 + 段落文本），装饰类名复用 `entityChipClass(type, presetKey)`；`pages/writer/entities/HoverCard.tsx` 按 `peerId` 走 `worldEntity:get` 取详情并内置 LRU 缓存。

## 10. 已知边界与技术债

- **旧 `entities` 三表仍在**：`entities` / `entity_aliases` / `entity_relations`（`schema/entities.ts`）与 `world_*` 体系并存，属历史遗留。`entities:list|get|create|update|delete` 仍服务旧表，新功能不得再写入；仅 `entities:match` / `entities:revision` 已切到统一设定库。后续清理批次统一下线旧表与旧通道。
- **无聚合视图**：早期按类型的 5 个视图（`v_worldview` 等）零查询，已随第 2 批删除；当前**没有**跨模块聚合 / 统计视图，汇总需渲染层按 `entity_type` 拉取后自行归并。
- **`subtype_id` 的 NULL 读写口径**：读路径兼容（`LEFT JOIN world_subtypes ... AND st.deleted_at IS NULL`，为 `NULL` 或指向已软删分类时回显空分类名，不丢行）；写路径视为非法 —— `create` 必须解析到合法分类（境界体系自动补默认），`update` 显式传 `null` 直接拒绝，仅境界体系的历史未分类行会在任意更新时补默认分类。老库 `NULL` 数据仍可编辑，但界面要求用户重新选类别。
- **`kind` 字段已废弃**：`WorldEntityDetail.kind` 恒为空串，`Create/Update` 入参中的 `kind` 被忽略；子类真源为 `subtypeId`，境界体系类型走 `powerKind`（`world_power_system.kind`）。
- **已删列不可回读**：`summary`、`sub_type` 文本列、`status` / `source` / `visibility` / `parent_id` 均为一次性迁移删列，历史值已丢弃（简介并入正文）。
- **世界观自定义子类无字段存储**：`world_custom` 仅承载 item / faction 的自定义子类，世界观自定义分类只能写正文 / 别名 / 标签 / 关系，右栏不出字段组。
- **关系缺少库级唯一约束**：同向重复边只能靠交互层候选过滤规避，脚本 / 批量导入路径需自行去重。
- **旧语义码已被清空**：`worldRefs:hierarchy:v1` 迁移删除了白名单外的存量关系，读取侧仍保留 `semantic_code IS NULL` 的空码兜底（界面按「自定义关系」只显示对端名）。

最后核对：2026-10-31

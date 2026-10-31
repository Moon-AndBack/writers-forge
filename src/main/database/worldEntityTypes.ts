/**
 * 统一设定库 · 数据层公共类型与枚举常量（五类统一寻址）。
 *
 * 结构真源见 `schema/worldEntities.ts` / `schema/worldPowers.ts`。类型集中于此，
 * 由 `worldEntities.ts` 统一再导出，供 IPC / preload / 渲染层以单一入口取用。
 */

/** 统一设定库实体类型（五类）。 */
export type WorldEntityType = 'worldview' | 'character' | 'item' | 'faction' | 'power_system'

/** 实体类型可选值，供 IPC 层入参校验。 */
export const WORLD_ENTITY_TYPES: readonly WorldEntityType[] = [
  'worldview',
  'character',
  'item',
  'faction',
  'power_system'
]

/**
 * 列表 / 详情行携带的关系摘要：语义码 + 对端名称 + 方向，出边在前、入边在后，
 * 各自按 `sort_order, id` 排序。
 *
 * 列表与详情路径都会填充：列表按页批量补齐（出边 / 入边各一次 IN 查询，避免逐卡
 * N+1），详情填充单个实体自身的关系摘要。
 *
 * 供卡片底部展示「类型 + 对端名」，并按对端实体的模块 / 子类给关系标签上色；
 * 需要备注等完整引用行时走 `listWorldRefs` / `listWorldRefsTo`。
 */
export interface WorldEntityRelationSummary {
  /**
   * 相对当前实体的方向：
   * - `'out'` 出边（`from_id = 当前实体`），展示「语义码 + 对端名」，如「上级 文心城」；
   * - `'in'` 入边（`to_id = 当前实体`），展示「对端名 + 反向语义」，如角色卡「锻笔剑 属于我」。
   */
  direction: 'out' | 'in'
  semanticCode: string
  /**
   * 对端实体 id：出边取 `world_refs.to_id`，入边取 `world_refs.from_id`。
   * 供卡片关系标签悬停时按 id 取目标实体详情（`worldEntity:get`），不必回查引用行。
   */
  peerId: number
  targetName: string
  /**
   * 对端实体所属模块（`world_entities.entity_type`，出边取 `to_id`、入边取 `from_id`）。
   *
   * 供卡片关系标签按**目标实体的模块**着色，随摘要一并返回，渲染层无需再按 `peerId` 回查。
   */
  peerEntityType: WorldEntityType
  /** 对端子类分类外键（`world_entities.subtype_id`）；`null` = 未分类。 */
  peerSubtypeId: number | null
  /** 对端子类展示名（`JOIN world_subtypes.name`）；未分类为空串。 */
  peerSubType: string
  /**
   * 对端子类预设路由键（`JOIN world_subtypes.preset_key`）；
   * 自定义子类或未分类为空串。
   */
  peerPresetKey: string
}

/** 主表行：统一身份 + 元信息（含别名 / 正文 excerpt 源，不含标签）。 */
export interface WorldEntityRow {
  id: number
  uuid: string
  bookId: string
  entityType: WorldEntityType
  /**
   * 子类**展示名**（只读）：来自 `JOIN world_subtypes.name`。
   *
   * 第 4 批起主表不再存文本子类，写入请用 {@link subtypeId}；未分类时为空串。
   */
  subType: string
  /** 子类分类外键（`world_subtypes.id`）；`null` = 未分类。 */
  subtypeId: number | null
  /**
   * 子类预设路由键（只读，`JOIN world_subtypes.preset_key`）：
   * 非空表示命中预设子类（按此键路由到专属子表）；空串表示自定义子类或未分类。
   */
  presetKey: string
  name: string
  /** 别名（`world_aliases.alias`，按 sort_order, id 排序；列表直接透出，供卡片取前 3 展示）。 */
  aliases: string[]
  /** 长文本正文（`world_texts.body`，无行时为空串；列表经 JOIN 直接透出，供卡片截断用）。 */
  body: string
  /**
   * 关系摘要（出边 + 入边，出边在前；各方向按 `sort_order, id`）。
   *
   * 列表路径批量填充；详情路径填充该实体自身的摘要。供卡片底部展示；需要备注等
   * 完整引用行时见 `listWorldRefs` / `listWorldRefsTo`。
   */
  relations: WorldEntityRelationSummary[]
  /**
   * 物品 / 天赋等级显示标签。
   *
   * 第 3 批起存于物品预设子分类表（`world_weapon` / `world_skill` / `world_pill` /
   * `world_talent` / `world_equipment`）的 `grade` 列；非物品或未命中这 5 个子类时为空串。
   */
  grade: string
  /**
   * 物品 / 天赋可比较档位（0 = 未定级）。
   *
   * 与 `grade` 同表存放；非物品或未命中这 5 个子类时为 0。
   */
  rank: number
  revision: number
  createdAt: string
  updatedAt: string
  /** 非 null 表示已软删除（详情 / 列表不会返回软删行）。 */
  deletedAt: string | null
}

/**
 * 实体子类引用（第 4 批）：数据层与 IPC 共用。
 *
 * - `subtypeId = null`：未分类 —— 不做任何子表读写；
 * - `presetKey` 非空：命中预设子类 —— 路由到对应预设子表；
 * - `subtypeId` 非空且 `presetKey` 为空：用户自定义子类 —— 路由到 `world_custom`
 *   的键值行（字段名由用户自定，见 {@link WorldCustomField}）。
 */
export interface WorldEntitySubtypeRef {
  subtypeId: number | null
  presetKey: string
}

/**
 * 用户自定义子类的键值字段行（第 5 批，`world_custom`）。
 *
 * 一条自定义实体可有多行：`key` 为字段名（去首尾空白后 1–64 字符），`value` 为文本值
 * （≤2000 字符），`sortOrder` 为展示序（读取时已按 `sort_order, field_key` 排序）。
 */
export interface WorldCustomField {
  key: string
  value: string
  sortOrder: number
}

/**
 * 写入用的键值字段入参：`sortOrder` 缺省时由数据层按数组下标补齐。
 */
export interface WorldCustomFieldInput {
  key: string
  value: string
  sortOrder?: number
}

/**
 * 世界观六种子类专属字段接口（批 K1）。
 *
 * 每类独立子表强类型列；字段均为字符串。自定义分类无专属字段。
 */
export interface WorldviewOverviewFields {
  era: string
  scale: string
  population: string
  epoch: string
}

export interface WorldviewGeographyFields {
  coordinates: string
  climate: string
  area: string
  terrain: string
}

export interface WorldviewCultureFields {
  language: string
  customs: string
  religion: string
  art: string
}

export interface WorldviewRaceFields {
  lifespan: string
  body_size: string
  reproduction: string
  habits: string
}

export interface WorldviewEconomyFields {
  currency: string
  tax_rate: string
  trade_routes: string
  resources: string
}

export interface WorldviewRulesetFields {
  physics: string
  magic: string
  taboo: string
  boundary: string
}

/** 世界观六种子类专属字段联合入口。 */
export type WorldviewSubtypeFields =
  | WorldviewOverviewFields
  | WorldviewGeographyFields
  | WorldviewCultureFields
  | WorldviewRaceFields
  | WorldviewEconomyFields
  | WorldviewRulesetFields

/**
 * 子类专属字段白名单：真源为 `src/shared/worldSubtypeFields.ts`（主进程与渲染层共用）。
 * 此处再导出，保持既有 `import { ... } from './worldEntityTypes'` 调用方无需改动。
 */
export {
  WORLDVIEW_SUBTYPE_FIELDS,
  ITEM_SUBTYPE_FIELDS,
  FACTION_SUBTYPE_FIELDS,
  CUSTOM_FIELD_LIMITS
} from '../../shared/worldSubtypeFields'

/**
 * 实体详情：主表行 + 五类子表专属字段（扁平化，未命中类型时为默认值）
 * + 别名 / 标签 / 正文。
 */
export interface WorldEntityDetail extends WorldEntityRow {
  /** 角色专属（`world_character.role`）。 */
  role: string
  /**
   * @deprecated 批 L1 起废弃，恒为 `''`。
   *
   * 子类真源已统一为 `subtype_id`（→ `world_subtypes`）；`world_item.kind` /
   * `world_faction.kind` 两列随第 3 批删表一并消失，不再参与读写。
   * 保留本字段只为避免渲染层类型大范围破坏。
   * 境界体系类型请取 {@link powerKind}。
   */
  kind: string
  /**
   * 境界体系类型（`world_power_system.kind`，自由文本）。
   *
   * 仅 `entityType = 'power_system'` 有值，其余实体为空串；随右栏上段
   * 「体系类型」字段与通用更新补丁一起读写（见 `UpdateWorldEntityPatch.powerKind`）。
   */
  powerKind: string
  /** 世界观六种子类专属字段（仅 worldview 且 `presetKey` 命中六类时有值，其余为空对象）。 */
  worldviewFields: Record<string, string>
  /** 物品功法子类专属字段（仅 item 且 `presetKey` 命中预设时有值，其余为空对象）。 */
  itemFields: Record<string, string>
  /** 势力子类专属字段（仅 faction 且 `presetKey` 命中预设时有值，其余为空对象）。 */
  factionFields: Record<string, string>
  /** 用户自定义类型自由字段（仅 item / faction 的自定义子类有值，其余为空数组）。 */
  customFields: WorldCustomField[]
  aliases: string[]
  tags: string[]
  /** 长文本正文纯文本摘要（`world_texts.body`，无行时为空串）。 */
  body: string
  /**
   * 长文本正文富文本 JSON（`world_texts.body_json`，无行 / 尚未富文本化时为空串）。
   *
   * 仅**详情**返回；列表只透出纯文本 `body`，避免传输膨胀。
   */
  bodyJson: string
}

/** 创建实体入参：必填书 / 类型 / 名称，其余缺省取 schema 默认值。 */
export interface CreateWorldEntityInput {
  bookId: string
  entityType: WorldEntityType
  name: string
  /**
   * 子类分类外键（可空，`null` / 缺省 = 未分类）。
   *
   * 第 4 批起为子类**唯一**写入入口：分类必须存在、未软删，且与 `bookId` / `entityType`
   * 一致（IPC 与数据层双重校验，不满足视为未分类）。
   */
  subtypeId?: number | null
  role?: string
  /**
   * @deprecated 批 L1 起废弃，数据层忽略、IPC 不再解析。
   *
   * 仅为兼容既有种子（仍传 `kind`）而保留；子类真源请用 `subtypeId` + 对应专属字段。
   */
  kind?: string
  grade?: string
  rank?: number
  aliases?: string[]
  tags?: string[]
  body?: string
  /** 富文本正文 JSON（`world_texts.body_json`，缺省 = 空串；`body` 仍为纯文本摘要）。 */
  bodyJson?: string
  worldviewFields?: Record<string, string>
  itemFields?: Record<string, string>
  factionFields?: Record<string, string>
  /** 用户自定义子类的键值字段（整体替换：先删后插，缺省表示不改动）。 */
  customFields?: WorldCustomFieldInput[]
}

/** 更新补丁：字段缺省则保持不变；提供 aliases / tags / body 则整体替换。 */
export interface UpdateWorldEntityPatch {
  name?: string
  /** 子类分类外键（可空，`null` = 置为未分类）；缺省表示不变更。 */
  subtypeId?: number | null
  role?: string
  /** @deprecated 批 L1 起废弃，数据层忽略、IPC 不再解析；子类真源为 `subtypeId`。 */
  kind?: string
  /**
   * 境界体系类型（`world_power_system.kind`，自由文本）；仅 `power_system` 实体生效，
   * 其余类型静默忽略。子行不存在时由数据层补建。
   */
  powerKind?: string
  grade?: string
  rank?: number
  aliases?: string[]
  tags?: string[]
  body?: string
  /** 富文本正文 JSON（`world_texts.body_json`，缺省 = 空串；`body` 仍为纯文本摘要）。 */
  bodyJson?: string
  worldviewFields?: Record<string, string>
  itemFields?: Record<string, string>
  factionFields?: Record<string, string>
  /** 用户自定义子类的键值字段（整体替换：先删后插，缺省表示不改动）。 */
  customFields?: WorldCustomFieldInput[]
}

/** 别名行（`kind` 为自由文本分类，默认 other；`sortOrder` 为展示序）。 */
export interface WorldAliasRow {
  id: number
  entityId: number
  alias: string
  kind: string
  sortOrder: number
}

/** 标签行：按书隔离的标签字典，附带被引用次数。 */
export interface WorldTagRow {
  id: number
  bookId: string
  name: string
  usageCount: number
}

/** 通用引用行（有向）：附带两端名称 + 语义码展示名，便于列表直接展示。 */
export interface WorldRefRow {
  id: number
  bookId: string
  fromId: number
  fromName: string
  toId: number
  toName: string
  semanticCode: string | null
  /** 语义码展示名（`JOIN world_semantic_codes.note`；无码为空串）。 */
  semanticNote: string
  role: string
  sortOrder: number
  validFrom: string | null
  validTo: string | null
  note: string
}

/**
 * 新增通用引用入参（第 7 批起 `semanticCode` **必填**）。
 *
 * 字典四码：层级三码 `superior` / `subordinate` / `peer`（仅势力之间可选）+ 归属码
 * `belongs_to`（属于，其他模块组合通用）；具体组合由渲染层过滤，写路径只校验码存在。
 * 补充说明写 `role`；老库中 `semantic_code IS NULL` 的行已由
 * `worldRefs:hierarchy:v1` 迁移清空，写路径不再产生空码。
 */
export interface WorldRefInput {
  bookId: string
  fromId: number
  toId: number
  semanticCode: string
  role?: string
  sortOrder?: number
  validFrom?: string | null
  validTo?: string | null
  note?: string
}

/** 更新通用引用补丁：字段缺省则保持不变。 */
export interface UpdateWorldRefPatch {
  semanticCode?: string
  role?: string
  sortOrder?: number
  validFrom?: string | null
  validTo?: string | null
  note?: string
}

/** 语义码字典行（`world_semantic_codes`，供界面关系类型下拉）。 */
export interface WorldSemanticCodeRow {
  code: string
  /** 建议的源实体类型（元数据，不强制约束）；`null` = 通用。 */
  fromType: string | null
  /** 建议的目标实体类型（元数据，不强制约束）；`null` = 通用。 */
  toType: string | null
  /** 展示名（关系类型：上级 / 下级 / 平级 / 属于）。 */
  note: string
}

/** 境界体系行（`entity_type = 'power_system'` 的实体）。 */
export interface WorldPowerSystemRow {
  entityId: number
  bookId: string
  name: string
  /** 子类展示名（JOIN `world_subtypes.name`，未分类为空串）。 */
  subType: string
  /** 体系类型（`world_power_system.kind`，自由文本）。 */
  kind: string
}

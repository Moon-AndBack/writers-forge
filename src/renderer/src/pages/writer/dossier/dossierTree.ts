/**
 * 设定档案五域（世界观 / 角色 / 势力 / 境界体系 / 物品功法）前端**域描述符**与共享类型。
 *
 * 数据层统一走 `window.api.worldEntity`（`entity_type` 映射：worldview / character /
 * faction / power_system / item）。`DossierModule → entity_type` 映射的**真源**已收敛到
 * `shell/activityBarModules`（活动栏筛选面板与页面共用，避免 shell 反向依赖 pages），
 * 本文件按原路径转出它并承载 `DossierBundle`，供中栏卡片视图 / 右栏详情 / 新建弹窗
 * **按 module 参数化复用**（§9 通用组件优先，禁止为五域复制平行实现）。
 *
 * 境界体系（`power_system`）与其他四域同构：中栏为卡片网格，点卡在**右栏**详情面板
 * 编辑（上段「体系类型」+ 下段富文本正文），名称 / 别名走卡片铅笔弹窗，删除走卡片垃圾桶；
 * 该域无「关联关系」入口。
 */
import type { RefObject } from 'react'
import type {
  WorldCustomField,
  WorldCustomFieldInput,
  WorldEntityDetail as UnifiedEntityDetail,
  WorldEntityRow as UnifiedEntityRow,
  WorldEntityType,
  WorldPowerSystemRow,
  WorldRefRow,
  WorldSemanticCodeRow
} from '../../../../../preload/types/worldEntity'
import {
  DOSSIER_MODULES,
  MODULE_ENTITY_TYPE,
  isDossierModule,
  type DossierModule
} from '../../../shell/activityBarModules'

export type {
  WorldCustomField,
  WorldCustomFieldInput,
  WorldEntityType,
  WorldPowerSystemRow,
  WorldRefRow,
  WorldSemanticCodeRow
}

/**
 * 五域子类专属字段白名单：真源为共享层 `src/shared/worldSubtypeFields.ts`
 * （纯数据常量、无 Node 依赖，主进程与渲染层共用），此处再导出，不复制字面量。
 * 渲染层**不得**引用 `src/main/**`（§2 分层）。
 */
export {
  CUSTOM_FIELD_LIMITS,
  FACTION_SUBTYPE_FIELDS,
  ITEM_SUBTYPE_FIELDS,
  WORLDVIEW_SUBTYPE_FIELDS
} from '../../../../../shared/worldSubtypeFields'

/* 五域域描述（模块清单 / 模块 → 实体类型 / 类型守卫）真源见顶部 import：
   `shell/activityBarModules`（活动栏浮层与页面共用同一份）。此处扩大导出面，
   既有 `from './dossierTree'` 引用全部不变。 */
export { DOSSIER_MODULES, MODULE_ENTITY_TYPE, isDossierModule }
export type { DossierModule }

/**
 * 关系「关联对象」可选模块（顺序同模块栏）：世界观 / 角色 / 势力 / 境界体系 /
 * 物品功法五域全部可选，世界观同样可作为关联目标。关系天生跨模块，新增关系时
 * 按本清单渲染第一级模块下拉。
 */
export type RelationTargetModule = DossierModule

export const RELATION_TARGET_MODULES: readonly RelationTargetModule[] = [
  'worldview',
  'characters',
  'factions',
  'power_system',
  'items'
]

/**
 * 层级三码：世界观与势力之间可选（含世界观 ↔ 世界观、世界观 ↔ 势力、势力 ↔ 势力）。
 * 码值与主进程字典（`worldSemanticCodes.ts`）一致。
 */
const HIERARCHY_RELATION_CODES: readonly string[] = ['superior', 'subordinate', 'peer']

/** 归属码：语义为「from 属于 to」，其余模块组合通用。 */
export const BELONGS_TO_RELATION_CODE = 'belongs_to'

/** 全部关系码（目标模块未选时的下拉兜底，顺序同字典）。 */
const ALL_RELATION_CODES: readonly string[] = [
  ...HIERARCHY_RELATION_CODES,
  BELONGS_TO_RELATION_CODE
]

/** 是否世界层实体（势力或世界观）：两者之间适用层级三码。 */
function isWorldLayer(type: WorldEntityType | null): boolean {
  return type === 'faction' || type === 'worldview'
}

/**
 * 按「当前实体模块 C + 目标模块 T」计算可选关系类型（按下表规则，顺序即下拉顺序）：
 *
 * | C | T | 可选 |
 * |---|---|---|
 * | 世界观 / 势力 | 世界观 / 势力 | 上级 / 下级 / 平级 |
 * | 其他任意组合（含 character / item / power_system） | 其他 | 属于 |
 *
 * `toType === null`（尚未选目标模块）时返回全部四码，供先选类型后选目标；
 * 调用方在目标模块变更后必须把已选类型重置为该组合首项，避免残留非法组合。
 */
export function relationCodesForPair(
  fromType: WorldEntityType,
  toType: WorldEntityType | null
): readonly string[] {
  if (toType === null) return ALL_RELATION_CODES
  if (isWorldLayer(fromType) && isWorldLayer(toType)) return HIERARCHY_RELATION_CODES
  return [BELONGS_TO_RELATION_CODE]
}

/**
 * 是否反向存储：角色 → 物品固定记「物品属于角色」（from = 物品、to = 角色），
 * 不出现「角色属于物品」。
 */
export function isReverseRelation(
  fromType: WorldEntityType,
  toType: WorldEntityType | null
): boolean {
  return fromType === 'character' && toType === 'item'
}

/**
 * 世界观六种预设子类的**展示顺序**（数据常量，不译；名称与 `world_subtypes` 预设一致）。
 *
 * 第 4 批起子类真源为分类表（`worldSubtype:list`），本常量只用于卡片分组的稳定排序：
 * 先按本顺序输出六类，再按出现顺序输出自定义类，未分类最后。
 */
export const WORLDVIEW_SUBTYPES: readonly string[] = [
  '世界概况',
  '地理环境',
  '文化背景',
  '种族生物',
  '经济体系',
  '世界规则'
]

/**
 * 模块 → 是否显示子类选择器。
 *
 * 世界观 / 角色 / 势力 / 物品功法可选子类（选项来自分类表，可新增自定义子类）；
 * 角色为 主角 / 配角 / 龙套 / 反派 四条预设；仅境界体系沿用既有交互，不显示选择器。
 */
export const MODULE_HAS_SUBTYPE: Record<DossierModule, boolean> = {
  worldview: true,
  characters: true,
  factions: true,
  power_system: false,
  items: true
}

/** 列表行（统一设定库主表行；`relations` 为卡片摘要用的关系简要，含出边与入边）。 */
export type DossierRow = UnifiedEntityRow

/**
 * 详情：主表行 + 角色 / 物品 / 势力专属字段 + 别名 / 标签 / 正文 + 出边引用。
 *
 * 主表行的 `relations` 是列表卡片用的**摘要**（方向 + 语义码 + 对端名），详情侧改用
 * `listRefs` 取回的完整引用行，故先 `Omit` 再以 `WorldRefRow[]` 覆写，避免两义冲突。
 */
export type DossierDetail = Omit<UnifiedEntityDetail, 'relations'> & {
  /** 出边通用引用（`world_refs`，用于详情页的关系列表）。 */
  relations: WorldRefRow[]
}

/** 创建入参（名称必填；`subtypeId` 除境界体系外均必填，境界体系缺省由主进程补默认分类）。 */
export interface DossierCreateInput {
  name: string
  /** 子类分类 id；null 不再合法（仅类型兼容历史调用）。 */
  subtypeId?: number | null
}

/** 更新补丁：字段缺省保持不变；提供 aliases / tags / body / 各域字段则整体替换。 */
export interface DossierUpdatePatch {
  name?: string
  /** 子类分类 id；null 不再合法（清空类别会被主进程拒绝），缺省 = 不变更。 */
  subtypeId?: number | null
  aliases?: string[]
  tags?: string[]
  body?: string
  /**
   * 富文本正文 JSON（`world_texts.body_json`，空串 = 空正文）。
   * **必须与 `body` 成对传递**：`body` 为派生纯文本摘要、本项为整条块级 JSON 真源，
   * 数据层按「两列中任一提供即整体替换」写回（缺省列按空串写），缺一列会让摘要 / 真源失步。
   */
  bodyJson?: string
  /** 境界体系类型（`world_power_system.kind`）；仅境界体系条目写入，其余类型忽略。 */
  powerKind?: string
  worldviewFields?: Record<string, string>
  itemFields?: Record<string, string>
  /** 物品品阶（等级显示标签）；仅物品预设子类（weapon/skill/pill/talent/equipment）写入。 */
  grade?: string
  /** 物品档位（0 起可比较档位）；仅物品预设子类写入。 */
  rank?: number
  factionFields?: Record<string, string>
  /** 自定义子类键值字段（整体替换：提交的数组即全部字段）。 */
  customFields?: WorldCustomFieldInput[]
}

/**
 * 新增关系入参（第 7 批）：关系类型取自语义码字典（`semanticCode` 必填）。
 * 可选码由「当前实体模块 + 目标模块」组合决定（见 `relationCodesForPair`）：
 * 世界观与势力之间为 `superior` / `subordinate` / `peer`，其余组合为 `belongs_to`。
 * 补充说明（`role`）已从交互中移除，写库时由装配层固定传空串（老库存量值不再展示）。
 */
export interface DossierRelationInput {
  /** 目标实体 id（可跨模块）。 */
  targetId: number
  /** 关系类型（语义码）。 */
  semanticCode: string
  /** 备注（可选）。 */
  note?: string
  /**
   * 是否反向存储：`true` 时写 `from = targetId`、`to = 当前实体`。
   * 仅「角色 → 物品」为 true（恒记「物品属于角色」，不出现「角色属于物品」）。
   */
  reverse?: boolean
}

/** 更新关系补丁：字段缺省保持不变。 */
export interface DossierRelationPatch {
  semanticCode?: string
  note?: string
}

/**
 * 设定档案五域装配态（`useDossierWorkspace` 返回）。
 *
 * 自 `useDossierWorkspace.ts` 上提为纯类型（§3 单文件 ≤500 行）：
 * 与 `DossierBundle` 同属域描述层，页面 / hook 只依赖类型、不依赖实现。
 */
export interface DossierWorkspace {
  /** 当前域（非设定档案五域时为 null；此时数据为空）。 */
  module: DossierModule | null
  /** 当前书籍 id。 */
  bookId: string
  /** 未删除列表行（后端顺序：`entity_type, id`）。 */
  rows: DossierRow[]
  /** 当前选中行 id（null = 无行）。 */
  activeId: number | null
  /** 当前选中行详情（null = 未选中 / 加载中）。 */
  detail: DossierDetail | null
  /** 选中行已定但详情尚未回填（渲染层据此跳过空态，避免切换闪帧）。 */
  detailPending: boolean
  /** 是否仍在首次加载（当前域尚未拉过一次）。 */
  loading: boolean
  /** 当前域列表读取失败（列表为空时渲染错误态 + 重试，而非空态）。 */
  loadError: boolean
  /** 语义码字典（全局，关系类型下拉数据源）。 */
  semanticCodes: WorldSemanticCodeRow[]
  /** 当前选中行的入边关系（可改类型 / 备注、可删；关联对象只读）。 */
  incomingRelations: WorldRefRow[]
  /** 当前选中行是否有未保存改动（右栏保存按钮 + 切换守卫共用）。 */
  dirty: boolean
  /** 右栏编辑器上报脏态（表单挂载后按草稿与详情比对调用）。 */
  reportDirty: (dirty: boolean) => void
  /** 保存入口 ref：右栏表单挂载时写入 `saveNow`（仅变更字段补丁），供切换确认「保存」调用。 */
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
  /** 立即落库当前草稿；返回值 = 是否落库成功（无脏视为成功）。模块切换守卫据此决定是否切换。 */
  saveDraft: () => Promise<boolean>
  /** 放弃当前草稿（先清脏）：「放弃并切换」必须先清脏，否则切模块的清理 effect 会二次静默保存。 */
  discardDraft: () => void
  /** 是否有挂起的切换（有改动时点选卡片 / 新建暂缓，等两态确认）。 */
  switchPending: boolean
  /** 结算挂起的切换：`save=true` 先保存草稿再切换，`false` 丢弃草稿直接切换。 */
  resolveSwitch: (save: boolean) => Promise<boolean>
  /** 保存结算中：确认弹框禁用按钮，期间重复结算一律忽略。 */
  confirming: boolean
  /** 选中某行（不触发右栏展开，展开由页面层包装）。 */
  select: (id: number) => void
  /** 新建（名称必填），成功后选中新行并返回其 id（失败 / 守卫回 null）。 */
  create: (input: DossierCreateInput) => Promise<number | null>
  /** 更新某行（仅变更字段补丁；走写链串行化）；返回值 = 是否落库成功。 */
  update: (id: number, patch: DossierUpdatePatch) => Promise<boolean>
  /** 软删除某行。 */
  remove: (id: number) => Promise<void>
  /** 新增出边关系（关系类型取语义码；目标可跨模块）。 */
  addRelation: (id: number, input: DossierRelationInput) => Promise<void>
  /** 更新某实体的关系（出边 / 入边共用，按 `world_refs.id` 落库；类型 / 备注）。 */
  updateRelation: (id: number, refId: number, patch: DossierRelationPatch) => Promise<void>
  /** 删除关系（出边 / 入边共用）。 */
  removeRelation: (id: number, refId: number) => Promise<void>
  /** 重新拉取当前域列表（读取失败后由错误态「重试」调用）。 */
  reload: () => Promise<void>
}

/**
 * 设定档案五域装配包：中栏卡片视图与右栏详情面板共享的数据 + 动作。
 * 由页面层（`Writer.tsx`）经 `useDossierWorkspace` 组装后透传（仅活动模块属五域时非空）。
 */
export interface DossierBundle {
  /** 当前域。 */
  module: DossierModule
  /** 当前书籍 id（引用写入需要）。 */
  bookId: string
  /** 未删除列表行（后端顺序：`entity_type, id`）。 */
  rows: DossierRow[]
  /** 当前选中行 id（null = 无行）。 */
  activeId: number | null
  /** 当前选中行（列表派生；null = 无行）。 */
  activeRow: DossierRow | null
  /** 当前选中行详情（null = 未选中 / 加载中）。 */
  detail: DossierDetail | null
  /** 选中行已定但详情尚未回填（渲染层据此跳过空态，避免切换闪帧）。 */
  detailPending: boolean
  /** 是否仍在首次加载（当前域尚未拉过一次）。 */
  loading: boolean
  /** 当前域列表读取失败（列表为空时渲染错误态 + 重试，而非空态）。 */
  loadError: boolean
  /** 语义码字典（全局，关系类型下拉数据源）。 */
  semanticCodes: WorldSemanticCodeRow[]
  /** 当前选中行的**入边**关系（引用当前实体的关系；类型 / 备注可改、可删）。 */
  incomingRelations: WorldRefRow[]
  /** 当前选中行是否有未保存改动（右栏保存按钮 + 切换守卫共用）。 */
  dirty: boolean
  /** 右栏编辑器上报脏态。 */
  onDirtyChange: (dirty: boolean) => void
  /** 保存入口（右栏表单挂载时写入；切换确认「保存」/ 切模块兜底据此落库）。 */
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
  /** 立即落库当前草稿；返回值 = 是否落库成功（模块切换守卫据此决定是否切换）。 */
  saveDraft: () => Promise<boolean>
  /** 放弃当前草稿（先清脏）：「放弃并切换」必须先清脏，否则切模块的清理 effect 会二次静默保存。 */
  discardDraft: () => void
  /** 是否有挂起的切换（有改动时点选卡片 / 新建暂缓，等两态确认）。 */
  switchPending: boolean
  /** 结算挂起的切换：`save=true` 先保存再切换，`false` 丢弃草稿直接切换；返回是否已切换。 */
  onResolveSwitch: (save: boolean) => Promise<boolean>
  /** 保存结算中：确认弹框禁用按钮，期间重复结算一律忽略。 */
  confirming: boolean
  /** 选中某行（页面层包装：选中 + 右栏隐藏时自动展开）。 */
  onSelect: (id: number) => void
  /** 新建（名称必填），成功后选中新行并返回其 id（失败 / 守卫回 null）。 */
  onCreate: (input: DossierCreateInput) => Promise<number | null>
  /** 更新（名称 / 子类 / 别名 / 标签 / 正文 / 子类专属字段补丁；返回值 = 是否落库成功）。 */
  onUpdate: (id: number, patch: DossierUpdatePatch) => Promise<boolean>
  /** 软删除某行。 */
  onDelete: (id: number) => void
  /**
   * 新增出边关系（关系类型取语义码；目标可跨模块）。
   * 显式带源实体 id：卡片铅笔弹窗内编辑关系时，弹窗目标行不一定等于右栏选中行。
   */
  onAddRelation: (id: number, input: DossierRelationInput) => void | Promise<void>
  /** 更新关系（出边 / 入边共用，类型 / 备注），写后刷新该实体的出边与入边。 */
  onUpdateRelation: (id: number, refId: number, patch: DossierRelationPatch) => void | Promise<void>
  /** 删除关系（出边 / 入边共用），写后刷新该实体的出边与入边。 */
  onRemoveRelation: (id: number, refId: number) => void | Promise<void>
  /** 重新拉取当前域列表（读取失败后由错误态「重试」调用）。 */
  reload: () => Promise<void>
}

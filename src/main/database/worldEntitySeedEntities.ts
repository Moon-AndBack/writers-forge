import type { WorldCustomFieldInput, WorldEntityType } from './worldEntities'

/**
 * 教学书「Writer's Forge · 使用指南」的统一设定库 demo 实体数据
 * （自 `worldEntitySeed.ts` 拆出，§3 单文件 ≤500 行）。
 *
 * 覆盖五大类（worldview / character / item / faction / power_system）：
 * - 世界观：砚境（世界）、文心城（地点）；两者之间以「上级」示范世界观参与关联关系；
 * - 境界体系：**3 个示例**——文心九境（线性）、百艺殊途（多途径）、
 *   果位与闰位（果位 / 闰位两类），各自只写「体系类型」；
 * - 角色：砚秋（主角）、笔灵（配角）；
 * - 物品功法：锻笔剑（`武器`）、过目成诵（`天赋`）走预设子表；
 *   墨玉砚（自定义类型 `法器`）走 `world_custom` 的键值行；
 * - 势力：抄书阁（`宗门`）、砚京（`王朝`）、墨阁（`商会`）分别走
 *   `world_sect` / `world_dynasty` / `world_guild`。
 *
 * 子类口径（第 4 批）：`subTypeName` 为**子类名称**，播种时按
 * `(bookId, entityType, name)` 在 `world_subtypes` 查 id；命中 23 条预设时直接复用，
 * 未命中（如 `法器`）则新建一条自定义分类（`is_custom = 1`），
 * 再把 `subtypeId` 交给 `createWorldEntity`；
 * 境界体系三条示例统一落默认分类「境界体系」（与新建口径一致）。
 * `kind` 列已废弃，物品 / 势力条目**不写**（仅境界体系用 `kind` 表示体系类型，
 * 写入 `world_power_system.kind`）。
 */

/** 示范实体定义。 */
export interface SeedEntity {
  key: string
  entityType: WorldEntityType
  /** 子类名称；播种时解析为 `world_subtypes.id`。 */
  subTypeName: string
  name: string
  role?: string
  /** 仅境界体系使用（体系类型：线性 / 多途径 / 果位）；物品 / 势力子类走 `subTypeName`。 */
  kind?: string
  grade?: string
  rank?: number
  aliases: string[]
  tags: string[]
  body: string
  worldviewFields?: Record<string, string>
  itemFields?: Record<string, string>
  factionFields?: Record<string, string>
  /** 自定义子类键值字段（第 5 批：任意字段名 + 文本值，整体替换）。 */
  customFields?: WorldCustomFieldInput[]
}

/** 五大类示范实体。 */
export const DEMO_ENTITIES: ReadonlyArray<SeedEntity> = [
  {
    key: 'world',
    entityType: 'worldview',
    subTypeName: '世界概况',
    name: '砚境',
    aliases: ['砚界', '文心界'],
    tags: ['地理'],
    body: '砚境是这本指南演示用的总世界。天穹如砚，云气化墨，山川河流都是未干透的字迹。世界观条目也参与关联关系：卡片上的「关联关系」按钮可把砚境与势力、其它世界观条目的层级登记下来。本书示范里砚境以「上级」指向文心城。',
    worldviewFields: { era: '砚历元年', scale: '中型世界', population: '约三百万', epoch: '砚历' }
  },
  {
    key: 'city',
    entityType: 'worldview',
    subTypeName: '地理环境',
    name: '文心城',
    aliases: ['文心'],
    tags: ['地理'],
    body: '文心城位于砚境正中，城中的抄书阁负责誊抄与校勘。世界观条目也能作为关联目标；本书示范里砚境以「上级」指向文心城，文心城的关系摘要会显示「砚境 是我的上级」。',
    worldviewFields: {
      coordinates: '砚境·中央',
      climate: '温和',
      area: '方圆百里',
      terrain: '平原'
    }
  },
  {
    key: 'power-linear',
    entityType: 'power_system',
    subTypeName: '境界体系',
    name: '文心九境',
    kind: '线性',
    aliases: ['九境'],
    tags: ['体系'],
    body: '文心九境是线性体系示例：境界从第一境逐级升到第九境，顺序固定、层层递进。点卡片后右栏上段把「体系类型」填成线性，再把完整的境界序列写进下段正文，点底部「保存」落库。'
  },
  {
    key: 'power-paths',
    entityType: 'power_system',
    subTypeName: '境界体系',
    name: '百艺殊途',
    kind: '多途径',
    aliases: ['殊途'],
    tags: ['体系'],
    body: '百艺殊途是多途径体系示例：同一体系下可以并行多条修行方向（如剑修 / 书修）。点卡片后在右栏上段把「体系类型」填成多途径，每条方向的境界序列与突破条件都写进下段正文，点底部「保存」落库。'
  },
  {
    key: 'power-fruit',
    entityType: 'power_system',
    subTypeName: '境界体系',
    name: '果位与闰位',
    kind: '果位',
    aliases: ['果位'],
    tags: ['体系'],
    body: '果位与闰位演示特殊境界结构：果位是正位序列（下品 → 中品 → 上品），闰位是借位序列。点卡片后在右栏上段把「体系类型」填成果位，两者的转化条件写进下段正文，点底部「保存」落库。'
  },
  {
    key: 'hero',
    entityType: 'character',
    subTypeName: '主角',
    name: '砚秋',
    role: '主角',
    aliases: ['砚秋先生'],
    tags: ['人物'],
    body: '砚秋是抄书阁的抄书人，也是本指南的示范主角。角色条目可在卡片铅笔弹窗里改名称、类别（主角 / 配角 / 龙套 / 反派）与别名；角色卡片也有「关联关系」入口，可把角色挂到势力下（属于），或与物品建立「物品属于角色」。'
  },
  {
    key: 'spirit',
    entityType: 'character',
    subTypeName: '配角',
    name: '笔灵',
    role: '配角',
    aliases: ['笔灵子'],
    tags: ['人物'],
    body: '笔灵寄居在锻笔剑中，负责在正文里提醒错字，是本指南的示范配角。角色分 主角 / 配角 / 龙套 / 反派 四类，可在新建与编辑弹窗的「类别」里随时切换；角色卡片有「关联关系」入口，与物品之间的关系会按「物品属于角色」记录。'
  },
  {
    key: 'sword',
    entityType: 'item',
    subTypeName: '武器',
    name: '锻笔剑',
    grade: '上品',
    rank: 3,
    aliases: ['锻笔'],
    tags: ['器物'],
    body: '锻笔剑是物品功法域「武器」子类示例。物品功法共六种子类（武器 / 功法 / 丹药 / 天赋 / 装备 / 材料），子类决定右栏上段出现哪组专属字段——武器填攻击力 / 耐久 / 重量 / 材质；品阶与档位随「武器」子类存放，不记在条目主档，改完点右栏底部「保存」落库。',
    itemFields: {
      attack: '锋锐 +12',
      durability: '千年不损',
      weight: '三斤七两',
      material: '墨玉寒铁'
    }
  },
  {
    key: 'talent',
    entityType: 'item',
    subTypeName: '天赋',
    name: '过目成诵',
    grade: '甲等',
    rank: 2,
    aliases: ['过目不忘'],
    tags: ['天赋'],
    body: '过目成诵是物品功法域「天赋」子类示例：天赋是有品阶的独立实体，品阶 / 档位随「天赋」子类存放；右栏上段另有天赋类型 / 觉醒条件 / 成长性 / 限制四项专属字段，改完点底部「保存」落库。',
    itemFields: {
      talent_type: '记忆类',
      awaken_condition: '读破万卷',
      growth: '随阅读量提升',
      limitation: '只对自己读过的文字有效'
    }
  },
  {
    key: 'artifact',
    entityType: 'item',
    subTypeName: '法器',
    name: '墨玉砚',
    aliases: ['墨砚'],
    tags: ['器物', '古物'],
    body: '墨玉砚演示自定义类型：子类「法器」不在物品功法六个预设里，因此右栏上段显示可自由增删的键值字段（字段名 + 字段值），而不是任何一组预设专属字段。字段名由你自定，点「添加字段」增行，改完点底部「保存」落库，也可随时删除。',
    customFields: [
      { key: '砚式', value: '随形砚，砚池如未干的墨迹' },
      { key: '墨意', value: '砚台内里封存着一缕未干的墨意。' }
    ]
  },
  {
    key: 'faction',
    entityType: 'faction',
    subTypeName: '宗门',
    name: '抄书阁',
    aliases: ['誊抄阁'],
    tags: ['势力'],
    body: '抄书阁是势力域「宗门」子类示例。势力共六种子类（宗门 / 家族 / 王朝 / 商会 / 散修联盟 / 魔教），宗门专属字段为山门 / 弟子数 / 功法传承 / 戒律，改完点右栏底部「保存」落库。关系在卡片上的「关联关系」弹窗里登记，目标列本书世界观 / 角色 / 势力 / 境界体系 / 物品功法的条目；本书示范里抄书阁以「下级」指向砚京，并与墨阁以「平级」互不统属。',
    factionFields: {
      gate: '文心城北 · 墨崖',
      disciples: '三百余人',
      heritage: '《抄书九诀》',
      precepts: '不得涂改他人文字'
    }
  },
  {
    key: 'dynasty',
    entityType: 'faction',
    subTypeName: '王朝',
    name: '砚京',
    aliases: ['砚京王朝'],
    tags: ['势力'],
    body: '砚京是势力域「王朝」子类示例。王朝专属字段为疆域 / 律法 / 军队 / 都城，改完点右栏底部「保存」落库。本书示范里砚京以「上级」指向抄书阁，用来演示势力之间的层级关系；世界观条目同样可作为目标或来源。',
    factionFields: {
      territory: '砚境中枢 · 九城',
      law: '《砚律》',
      army: '墨甲三千',
      capital: '砚京'
    }
  },
  {
    key: 'guild',
    entityType: 'faction',
    subTypeName: '商会',
    name: '墨阁',
    aliases: ['墨阁商会'],
    tags: ['势力'],
    body: '墨阁是势力域「商会」子类示例。商会专属字段为经营范围 / 资金 / 分号 / 信誉，改完点右栏底部「保存」落库。本书示范里墨阁与抄书阁以「平级」互不统属，用来演示平级关系；世界观条目同样可作为目标或来源。',
    factionFields: {
      business: '文房器物与古卷',
      funds: '白银十万两',
      branches: '文心城 / 砚京 / 墨崖',
      reputation: '童叟无欺'
    }
  }
]

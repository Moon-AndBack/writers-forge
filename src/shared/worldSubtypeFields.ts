/**
 * 设定库子类专属字段白名单 · 主进程与渲染层共用常量。
 *
 * 本文件为**纯数据常量**，禁止引入任何 import、Node / Electron API 或副作用代码，
 * 以保证可被渲染层直接打包（不得反向依赖 `src/main/**`）。
 *
 * 第 4 批：键从「子类名称」改为 **`preset_key`**（`world_subtypes.preset_key`，ASCII 稳定键）。
 * 名称可被用户改名，路由键不可变；主进程按 `preset_key` 选表 / 校验字段，
 * 渲染层按同一键取字段组（`worldEntity.presetKey` 由数据层 JOIN 提供）。
 *
 * 主进程经 `src/main/database/worldEntityTypes.ts` 再导出，既有导入路径保持不变。
 */

/** 世界观子类（preset_key）→ 允许的专属字段名集合（供数据层 / IPC 校验共用）。 */
export const WORLDVIEW_SUBTYPE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  overview: ['era', 'scale', 'population', 'epoch'],
  geography: ['coordinates', 'climate', 'area', 'terrain'],
  culture: ['language', 'customs', 'religion', 'art'],
  race: ['lifespan', 'body_size', 'reproduction', 'habits'],
  economy: ['currency', 'tax_rate', 'trade_routes', 'resources'],
  ruleset: ['physics', 'magic', 'taboo', 'boundary']
}

/**
 * 物品功法子类（preset_key）→ 允许的专属字段名集合（批 L1）。
 *
 * 命中本映射的预设子类写对应专属子表；`preset_key = ''` 的自定义子类走 `world_custom`
 * 的键值行（字段名由用户自定，见 {@link CUSTOM_FIELD_LIMITS}）。数据层与 IPC 共用本白名单。
 */
export const ITEM_SUBTYPE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  weapon: ['attack', 'durability', 'weight', 'material'],
  skill: ['tier', 'practice', 'cost', 'requirement'],
  pill: ['effect', 'side_effect', 'difficulty', 'shelf_life'],
  talent: ['talent_type', 'awaken_condition', 'growth', 'limitation'],
  equipment: ['defense', 'slot', 'set_bonus', 'durability'],
  material: ['usage', 'grade_label', 'origin', 'reserve']
}

/** 势力子类（preset_key）→ 允许的专属字段名集合（批 L1）。自定义子类同样走 `world_custom`。 */
export const FACTION_SUBTYPE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  sect: ['gate', 'disciples', 'heritage', 'precepts'],
  family: ['patriarch', 'family_rules', 'bloodline', 'ancestral_teaching'],
  dynasty: ['territory', 'law', 'army', 'capital'],
  guild: ['business', 'funds', 'branches', 'reputation'],
  alliance: ['form', 'members', 'goal', 'freedom'],
  demonic: ['doctrine', 'ritual', 'taboo', 'sphere']
}

/**
 * 用户自定义类型通用表（`world_custom`）的键值行边界约束（第 5 批）。
 *
 * 自定义子类的字段名 / 取值由用户自由填写（动态键值），不再有固定白名单；
 * 主进程校验（`src/main/ipc/worldSubtypeFields.ts`）与渲染层输入限制共用本常量。
 *
 * - `maxEntries`：单个实体最多键值行数；
 * - `keyMaxLength`：字段名去首尾空白后的最大字符数（且不得为空串）；
 * - `valueMaxLength`：字段值的最大字符数。
 */
export const CUSTOM_FIELD_LIMITS = {
  maxEntries: 64,
  keyMaxLength: 64,
  valueMaxLength: 2000
} as const

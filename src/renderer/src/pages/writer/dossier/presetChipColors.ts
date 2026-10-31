/**
 * 预设子类独立配色的类名映射与查询（纯常量 + 纯函数，不依赖 React）。
 *
 * 配色口径（23 预设 + 5 自定义 = 28 色）：
 * - **预设子类**（真源：`src/main/database/worldSubtypes.ts` 的
 *   `PRESET_WORLD_SUBTYPES`，共 23 条）各占一种可明显分辨的独立颜色，色值定义在
 *   `styles/chip-preset-colors.css` 的 `.chip-p-<presetKey>`，只绑定 `--chip-base`；
 * - **用户自定义分类**没有 `preset_key`，本模块不返回类名，由调用方回落到
 *   `chip-pill-tokens.css` 的模块类 `.chip-m-*`（五模块色系，5 色）。
 *
 * 本模块只负责「presetKey → 类名」，不关心布局与具体色值；胶囊形态与底色 / 文字 /
 * 描边派生仍由 `chip-pill.css` 消费 `--chip-base` 完成，无需另写样式。
 */

/** 23 个预设子类的配色类名映射（presetKey → CSS 类名）。 */
export const PRESET_CHIP_CLASS: Readonly<Record<string, string>> = {
  overview: 'chip-p-overview',
  geography: 'chip-p-geography',
  culture: 'chip-p-culture',
  race: 'chip-p-race',
  economy: 'chip-p-economy',
  ruleset: 'chip-p-ruleset',
  weapon: 'chip-p-weapon',
  skill: 'chip-p-skill',
  pill: 'chip-p-pill',
  talent: 'chip-p-talent',
  equipment: 'chip-p-equipment',
  material: 'chip-p-material',
  sect: 'chip-p-sect',
  family: 'chip-p-family',
  dynasty: 'chip-p-dynasty',
  guild: 'chip-p-guild',
  alliance: 'chip-p-alliance',
  demonic: 'chip-p-demonic',
  'character-lead': 'chip-p-character-lead',
  'character-support': 'chip-p-character-support',
  'character-extra': 'chip-p-character-extra',
  'character-villain': 'chip-p-character-villain',
  power_system: 'chip-p-power_system'
}

/**
 * 解析一个子类应挂的配色类名（不含模块类）。
 * - 命中预设 `presetKey` → 返回 `chip-p-<key>`（23 种独立色之一）
 * - 未命中（自定义分类 / 未分类 / 旧数据）→ 返回空串，由调用方回落到模块类 `chip-m-*`
 *
 * 用 `hasOwnProperty` 判定而非直接索引，避免 `toString` / `constructor` 等
 * 原型链键被误判为预设（`preset_key` 来自数据库，需按不可信输入处理）。
 */
export function presetChipClass(presetKey: string): string {
  return Object.prototype.hasOwnProperty.call(PRESET_CHIP_CLASS, presetKey)
    ? PRESET_CHIP_CLASS[presetKey]
    : ''
}

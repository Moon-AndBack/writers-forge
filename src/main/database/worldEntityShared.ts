import type { WorldEntitySubtypeRef } from './worldEntityTypes'

/**
 * 统一设定库 · 主表读 / 写共用的模块私有常量。
 *
 * 仅供 `worldEntityQueries.ts` / `worldEntityWrites.ts` 内部使用，**不**从
 * `worldEntities.ts` 再导出（原为单文件内的模块私有符号，不扩大公共 API）。
 */

/** 世界观六种预设子类（`preset_key`）→ 专属子表名（批 K1；第 4 批改按路由键）。 */
export const WV_SUBTYPE_TABLE: Readonly<Record<string, string>> = {
  overview: 'world_overview',
  geography: 'world_geography',
  culture: 'world_culture',
  race: 'world_race',
  economy: 'world_economy',
  ruleset: 'world_ruleset'
}

/** 未分类引用（数据层兜底：分类非法 / 缺省时不做任何子表读写）。 */
export const NO_SUBTYPE: WorldEntitySubtypeRef = { subtypeId: null, presetKey: '' }

/** 时间戳：毫秒精度，保证同秒连续编辑可区分，并对齐 books / dossier 四域写法。 */
export const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

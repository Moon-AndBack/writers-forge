import { getDb } from './index'
import { WORLD_ENTITY_TYPES } from './worldEntityTypes'
import type { WorldEntityType } from './worldEntityTypes'

/**
 * 胶囊配色数据访问（`chip_colors`）。
 *
 * 结构真源见 `schema/chipColors.ts`。约定：
 * - 每行是一个「实色底 `bg` + 配对文字色 `fg`」色对，渲染层直接取用，不做混色派生；
 * - `scope = 'preset'` 命中预设子类（`preset_key` 对齐 `world_subtypes.preset_key`），
 *   `scope = 'module'` 是该模块自定义分类的兜底色（`preset_key = ''`）；
 * - 种子 `CHIP_COLOR_SEEDS` 为**首次建库 / 老库自愈**用，`INSERT OR IGNORE` 幂等：
 *   已存在的行（用户改过的颜色）**不会**被启动覆盖，故不设 settings 守卫键。
 */

/** 胶囊配色行。 */
export interface ChipColorRow {
  scope: 'preset' | 'module'
  module: WorldEntityType
  /** 预设子类路由键；模块兜底行为空串。 */
  presetKey: string
  /** 实色底（#rrggbb，小写）。 */
  bg: string
  /** 配对文字色（#rrggbb，小写）。 */
  fg: string
  sortOrder: number
}

/** 种子行类型：与领域行同构，便于直接映射入库参数。 */
export type ChipColorSeed = ChipColorRow

/**
 * 内置配色种子（28 条 = 23 条预设子类 + 5 条模块兜底）。
 *
 * 顺序即 `sort_order`：预设按**模块内**顺序 0..n 递增（各模块独立起算），
 * 模块兜底按 0..4 递增。色值与既有 CSS 设计稿逐字一致，**不得**随手调整。
 */
export const CHIP_COLOR_SEEDS: readonly ChipColorSeed[] = [
  // 世界观（6）
  {
    scope: 'preset',
    module: 'worldview',
    presetKey: 'overview',
    bg: '#326467',
    fg: '#ffffff',
    sortOrder: 0
  },
  {
    scope: 'preset',
    module: 'worldview',
    presetKey: 'geography',
    bg: '#437b7c',
    fg: '#ffffff',
    sortOrder: 1
  },
  {
    scope: 'preset',
    module: 'worldview',
    presetKey: 'culture',
    bg: '#54a0a0',
    fg: '#1a1a1a',
    sortOrder: 2
  },
  {
    scope: 'preset',
    module: 'worldview',
    presetKey: 'race',
    bg: '#6db6b3',
    fg: '#1a1a1a',
    sortOrder: 3
  },
  {
    scope: 'preset',
    module: 'worldview',
    presetKey: 'economy',
    bg: '#8dc8c3',
    fg: '#1a1a1a',
    sortOrder: 4
  },
  {
    scope: 'preset',
    module: 'worldview',
    presetKey: 'ruleset',
    bg: '#b0d8d3',
    fg: '#1a1a1a',
    sortOrder: 5
  },
  // 物品功法 / 天赋（6）
  {
    scope: 'preset',
    module: 'item',
    presetKey: 'weapon',
    bg: '#583267',
    fg: '#ffffff',
    sortOrder: 0
  },
  {
    scope: 'preset',
    module: 'item',
    presetKey: 'skill',
    bg: '#77428d',
    fg: '#ffffff',
    sortOrder: 1
  },
  {
    scope: 'preset',
    module: 'item',
    presetKey: 'pill',
    bg: '#9554ab',
    fg: '#ffffff',
    sortOrder: 2
  },
  {
    scope: 'preset',
    module: 'item',
    presetKey: 'talent',
    bg: '#a574b4',
    fg: '#1a1a1a',
    sortOrder: 3
  },
  {
    scope: 'preset',
    module: 'item',
    presetKey: 'equipment',
    bg: '#b893c2',
    fg: '#1a1a1a',
    sortOrder: 4
  },
  {
    scope: 'preset',
    module: 'item',
    presetKey: 'material',
    bg: '#cdb5d4',
    fg: '#1a1a1a',
    sortOrder: 5
  },
  // 势力（6）
  {
    scope: 'preset',
    module: 'faction',
    presetKey: 'sect',
    bg: '#8a6410',
    fg: '#ffffff',
    sortOrder: 0
  },
  {
    scope: 'preset',
    module: 'faction',
    presetKey: 'family',
    bg: '#a87c10',
    fg: '#1a1a1a',
    sortOrder: 1
  },
  {
    scope: 'preset',
    module: 'faction',
    presetKey: 'dynasty',
    bg: '#f8b500',
    fg: '#1a1a1a',
    sortOrder: 2
  },
  {
    scope: 'preset',
    module: 'faction',
    presetKey: 'guild',
    bg: '#c79a2e',
    fg: '#1a1a1a',
    sortOrder: 3
  },
  {
    scope: 'preset',
    module: 'faction',
    presetKey: 'alliance',
    bg: '#f2c85a',
    fg: '#1a1a1a',
    sortOrder: 4
  },
  {
    scope: 'preset',
    module: 'faction',
    presetKey: 'demonic',
    bg: '#5c4300',
    fg: '#ffffff',
    sortOrder: 5
  },
  // 角色（4）
  {
    scope: 'preset',
    module: 'character',
    presetKey: 'character-lead',
    bg: '#b7282e',
    fg: '#ffffff',
    sortOrder: 0
  },
  {
    scope: 'preset',
    module: 'character',
    presetKey: 'character-support',
    bg: '#bf4a54',
    fg: '#ffffff',
    sortOrder: 1
  },
  {
    scope: 'preset',
    module: 'character',
    presetKey: 'character-extra',
    bg: '#d19fa7',
    fg: '#1a1a1a',
    sortOrder: 2
  },
  {
    scope: 'preset',
    module: 'character',
    presetKey: 'character-villain',
    bg: '#772237',
    fg: '#ffffff',
    sortOrder: 3
  },
  // 境界体系（1）
  {
    scope: 'preset',
    module: 'power_system',
    presetKey: 'power_system',
    bg: '#1e50a2',
    fg: '#ffffff',
    sortOrder: 0
  },
  // 模块兜底（自定义分类用，5）
  {
    scope: 'module',
    module: 'worldview',
    presetKey: '',
    bg: '#7e9aa0',
    fg: '#1a1a1a',
    sortOrder: 0
  },
  { scope: 'module', module: 'item', presetKey: '', bg: '#94849b', fg: '#1a1a1a', sortOrder: 1 },
  { scope: 'module', module: 'faction', presetKey: '', bg: '#a5956c', fg: '#1a1a1a', sortOrder: 2 },
  {
    scope: 'module',
    module: 'character',
    presetKey: '',
    bg: '#a89494',
    fg: '#1a1a1a',
    sortOrder: 3
  },
  {
    scope: 'module',
    module: 'power_system',
    presetKey: '',
    bg: '#94adc7',
    fg: '#1a1a1a',
    sortOrder: 4
  }
]

const SELECT_COLUMNS = `scope, module, preset_key AS presetKey, bg, fg, sort_order AS sortOrder`

/** `PRAGMA table_info` 口径的原始行（枚举列按字符串读入，再做窄化）。 */
interface ChipColorDbRow {
  scope: string
  module: string
  presetKey: string
  bg: string
  fg: string
  sortOrder: number
}

/** 数据库行 → 领域行（脏数据兜底：未知 scope 视为 preset，未知 module 回退 worldview）。 */
function toChipColorRow(row: ChipColorDbRow): ChipColorRow {
  return {
    scope: row.scope === 'module' ? 'module' : 'preset',
    module: WORLD_ENTITY_TYPES.includes(row.module as WorldEntityType)
      ? (row.module as WorldEntityType)
      : 'worldview',
    presetKey: row.presetKey,
    bg: row.bg,
    fg: row.fg,
    sortOrder: row.sortOrder
  }
}

/**
 * 幂等补齐 28 条内置配色（`INSERT OR IGNORE`，按 `(scope, module, preset_key)` 去重）。
 *
 * 每次启动调用：只补**缺失**行，已存在行（用户改过颜色）原样保留，因此可自愈老库，
 * 又不会覆盖用户配置。返回本次是否新增了至少一行。
 */
export function ensureChipColors(): boolean {
  const db = getDb()
  const insert = db.prepare(
    `INSERT OR IGNORE INTO chip_colors (scope, module, preset_key, bg, fg, sort_order)
     VALUES (@scope, @module, @presetKey, @bg, @fg, @sortOrder)`
  )
  return db.transaction((): boolean => {
    let created = 0
    for (const seed of CHIP_COLOR_SEEDS) {
      const result = insert.run({
        scope: seed.scope,
        module: seed.module,
        presetKey: seed.presetKey,
        bg: seed.bg,
        fg: seed.fg,
        sortOrder: seed.sortOrder
      })
      created += Number(result.changes)
    }
    return created > 0
  })()
}

/** 列出全部配色行，按 `scope, module, sort_order` 排序（供渲染层一次性注入）。 */
export function listChipColors(): ChipColorRow[] {
  const rows = getDb()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM chip_colors ORDER BY scope, module, sort_order`)
    .all() as ChipColorDbRow[]
  return rows.map(toChipColorRow)
}

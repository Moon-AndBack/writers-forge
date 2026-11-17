/**
 * 剧情域**跨进程共享**的常量与纯函数（主进程 `database/plotShared` 与渲染层
 * `pages/writer/plot/plotTree` 共用的单一真源，AGENTS §2 / §9）。
 *
 * 本文件只允许**类型 + 纯数据 + 纯函数**，不得引入 `better-sqlite3` 等 Node 专有模块，
 * 也不得依赖 React——渲染层会直接打包它。
 *
 * 承接：剧情线类型 8 项 key、颜色 16 色板（稳定 key + 色值）、二者的归一化函数、
 * 结构化时间纪元白名单与时间线 origin 自由文本解析。
 *
 * 颜色名（紫罗兰 / 天青 …）**不在此处**：界面文案统一由 `plot` ns 的 `lineColors.*` 提供，
 * 本模块只保留持久化 key 与色值，避免中文字面量散落在两端数据层。
 */

/**
 * 剧情线类型 8 项 key（中文名由 `plot` ns 的 `lineTypes.*` 提供：
 * 主线 / 支线 / 感情 / 暗线 / 副线 / 成长 / 世界 / 悬念；默认 `'main'`）。
 *
 * **顺序即 UI 下拉顺序**，调整会改变用户看到的选项排列。
 */
export type PlotLineType =
  'main' | 'branch' | 'romance' | 'hidden' | 'sub' | 'growth' | 'world' | 'suspense'
export const PLOT_LINE_TYPES: readonly PlotLineType[] = [
  'main',
  'branch',
  'romance',
  'hidden',
  'sub',
  'growth',
  'world',
  'suspense'
]
export const DEFAULT_PLOT_LINE_TYPE: PlotLineType = 'main'

/** 归一化线类型：命中 8 型白名单才透传，其余一律回退 `'main'`。 */
export function normalizePlotLineType(value: unknown): PlotLineType {
  return typeof value === 'string' && (PLOT_LINE_TYPES as readonly string[]).includes(value)
    ? (value as PlotLineType)
    : DEFAULT_PLOT_LINE_TYPE
}

/**
 * 剧情线颜色选项：稳定 key 持久化 + 色值；前 8 复用封面 `ring`，后 8 新增
 * （展示两行 8 列）。**首项即默认色**，顺序不得改动（老数据缺省 / 非法值回退首色）。
 *
 * 颜色名由渲染层经 `plot` ns 的 `lineColors.<key>` 取用，本结构不携带 label。
 */
export interface PlotLineColorOption {
  key: string
  value: string
}
export const PLOT_LINE_COLORS: readonly PlotLineColorOption[] = [
  { key: 'purple', value: '#5b4de8' },
  { key: 'blue', value: '#2f9ae0' },
  { key: 'green', value: '#0f7b4f' },
  { key: 'orange', value: '#9d5d00' },
  { key: 'violet', value: '#5c3a8a' },
  { key: 'teal', value: '#0f7b7b' },
  { key: 'rose', value: '#c42b1c' },
  { key: 'slate', value: '#475069' },
  { key: 'pink', value: '#e64980' },
  { key: 'coral', value: '#f76707' },
  { key: 'gold', value: '#eab308' },
  { key: 'lime', value: '#74b816' },
  { key: 'cyan', value: '#15aabf' },
  { key: 'indigo', value: '#748ffc' },
  { key: 'brown', value: '#8c5a2b' },
  { key: 'gray', value: '#868e96' }
]
export const DEFAULT_PLOT_LINE_COLOR = PLOT_LINE_COLORS[0].key

/** 归一化线颜色：命中 16 色 key 才透传，其余一律回退首 key。 */
export function normalizePlotLineColor(value: unknown): string {
  return typeof value === 'string' && PLOT_LINE_COLORS.some((option) => option.key === value)
    ? value
    : DEFAULT_PLOT_LINE_COLOR
}

/** 结构化时间纪元白名单（'' = 未设置；bc 纪前 / zero 元年 / ad 纪后）。 */
export const PLOT_TIME_ERAS: readonly string[] = ['bc', 'zero', 'ad']

/** 解析时间线 origin 自由文本 → 结构化时间四字段。 */
export function parseTimelineOrigin(origin: unknown): {
  timeEra: string
  timeYear: number | null
  timeDesc: string
  timeText: string
} {
  const raw = typeof origin === 'string' ? origin.trim() : ''
  // 回填输出留空：展示层经 i18n 兜底（元年 / 时间未定）；
  // 下方判据中的 '元年' / '时间未定' 为存量数据格式，保持原样。
  if (raw === '' || raw === '元年')
    return { timeEra: 'zero', timeYear: null, timeDesc: '', timeText: '' }
  if (raw === '时间未定') return { timeEra: '', timeYear: null, timeDesc: '', timeText: '' }
  const bcMatch = raw.match(/^纪前\s*(\d+)\s*年?$/)
  if (bcMatch) return { timeEra: 'bc', timeYear: Number(bcMatch[1]), timeDesc: '', timeText: raw }
  const adMatch = raw.match(/^纪后\s*(\d+)\s*年?$/)
  if (adMatch) return { timeEra: 'ad', timeYear: Number(adMatch[1]), timeDesc: '', timeText: raw }
  return { timeEra: '', timeYear: null, timeDesc: raw, timeText: raw }
}

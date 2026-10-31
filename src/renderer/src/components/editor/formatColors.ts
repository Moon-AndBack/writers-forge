/**
 * 行内「高亮（背景色）/ 文字颜色（前景色）」共用色板（**固定色板**，不随主题变）。
 *
 * 单一数据源：本数组是两套下拉（高亮 / 字色）**唯一**的色板定义——两处 UI 均遍历
 * 同一 `FORMAT_PALETTE`，色相顺序、`key`、文案 key 完全一致。差异只在于取用哪个
 * 字段：高亮取 `background`，字色取 `foreground`。
 *
 * 为何每个色相给「背景 / 前景」两值：
 * - 高亮色是**背景**，其上叠正文（浅色主题为近黑 `#1a1a1a`、深色主题为白）——
 *   故取浅色变体，保证深色 / 浅色正文都能压住；
 * - 字色是**前景**，需在 light（`--pane: #ffffff`）与 dark（`--pane: #232326`）
 *   两种极端底色上都可读——故取中等饱和的中调变体：其相对亮度约 0.19–0.27，
 *   对白底与深底的对度约 3.5–5.2，是「单一色值同时兼顾两种极端底」的折中。
 * 若强行用同一色值既作浅底又作中调前景，则要么背景太深（压不住正文）、要么前景
 * 太浅（深色主题下不可读），故按角色分列两值。色板本体仍是**单数组单一来源**。
 *
 * ⚠️ 存储口径：高亮 mark 的 `color` 属性存 `background`；textStyle mark 的 `color`
 * 属性存 `foreground`。激活态据此逐值比对（见 `EditorColorButton`）。
 */

/**
 * 色板文案 key（限定在 `common` ns 的 `format.*` 子集）。
 * 收窄为字面量联合，保证 `t(entry.labelKey)` 在 zh-CN 真源类型下可校验。
 */
export type FormatPaletteLabelKey =
  | 'format.colorRed'
  | 'format.colorOrange'
  | 'format.colorAmber'
  | 'format.colorGreen'
  | 'format.colorTeal'
  | 'format.colorBlue'
  | 'format.colorIndigo'
  | 'format.colorPurple'
  | 'format.colorPink'
  | 'format.colorBrown'

export interface FormatPaletteEntry {
  /** 稳定 key：React key 与色板标识（不随文案 / 色值微调改名）。 */
  key: string
  /** `common` ns 下的文案 key（用于色块的无障碍名 / tooltip）。 */
  labelKey: FormatPaletteLabelKey
  /** 高亮（背景）色：浅色底，叠深 / 浅正文均清晰。 */
  background: string
  /** 文字（前景）色：中调饱和，浅 / 深主题底均可读。 */
  foreground: string
}

/** 固定色板（10 色，顺序即两套下拉的展示顺序）。 */
export const FORMAT_PALETTE: readonly FormatPaletteEntry[] = [
  { key: 'red', labelKey: 'format.colorRed', background: '#f5c9c9', foreground: '#c94a4a' },
  { key: 'orange', labelKey: 'format.colorOrange', background: '#f6d2ac', foreground: '#c9741f' },
  { key: 'amber', labelKey: 'format.colorAmber', background: '#f3e2a3', foreground: '#a9821a' },
  { key: 'green', labelKey: 'format.colorGreen', background: '#bde5c6', foreground: '#2f9e44' },
  { key: 'teal', labelKey: 'format.colorTeal', background: '#ade3dc', foreground: '#17948a' },
  { key: 'blue', labelKey: 'format.colorBlue', background: '#bcdbf7', foreground: '#2b7fd4' },
  { key: 'indigo', labelKey: 'format.colorIndigo', background: '#c6c6f5', foreground: '#6d6de0' },
  { key: 'purple', labelKey: 'format.colorPurple', background: '#dcc2f5', foreground: '#9d5ce0' },
  { key: 'pink', labelKey: 'format.colorPink', background: '#f4bcd6', foreground: '#d6457f' },
  { key: 'brown', labelKey: 'format.colorBrown', background: '#e5cdb4', foreground: '#a1744f' }
]

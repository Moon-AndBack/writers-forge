import { createContext, useContext } from 'react'

/**
 * 排版 / 缩放设置：值域即各设置项的 CSS 变量字面值（`--doc-font` /
 * `--doc-line` / `--doc-letter` / `--page-width` / `--doc-zoom`），
 * 与 template/index.html §10 的取值一致；恢复时逐项校验合法性。
 */
export interface TypographyState {
  /** 正文字体（--doc-font 的 font-family 值） */
  font: string
  /** 行距（--doc-line 的数值字符串，如 '2.0'） */
  line: string
  /** 字距（--doc-letter 的长度值，如 '0.01em'） */
  letter: string
  /** 页宽（--page-width 的长度值，如 '620px' 或 '100%'） */
  page: string
  /** 缩放（--doc-zoom 的无单位数值字符串，如 '1'） */
  zoom: string
}

/** 各设置项对应的 CSS 变量名（挂在文档根元素上，与原型 §10 相同作用域）。 */
export const TYPOGRAPHY_CSS_VARS = {
  font: '--doc-font',
  line: '--doc-line',
  letter: '--doc-letter',
  page: '--page-width',
  zoom: '--doc-zoom'
} as const

/** settings 表持久化键名：五项打包为一个 JSON 对象。 */
export const TYPOGRAPHY_SETTING_KEY = 'typography'

/** 字体档位：展示名走 `labelKey`（可译，取 `typography` ns），`value` 为 --doc-font 的
 *  CSS 族名（不译、逐字固定，作为持久化键）。共 7 档：系统默认 + 6 个字体品牌名。 */
export type FontOption = {
  labelKey:
    | 'font.system'
    | 'font.lxgwNeoXiHeiPlus'
    | 'font.lxgwWenKai'
    | 'font.lxgwWenKaiScreen'
    | 'font.lxgwZhenKaiGB'
    | 'font.moonStarsKai'
    | 'font.wenYuanRounded'
  value: string
}

export const FONT_OPTIONS: readonly FontOption[] = [
  {
    labelKey: 'font.system',
    value: "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif"
  },
  { labelKey: 'font.lxgwNeoXiHeiPlus', value: "'LXGW Neo XiHei Plus', sans-serif" },
  { labelKey: 'font.lxgwWenKai', value: "'LXGW WenKai', serif" },
  { labelKey: 'font.lxgwWenKaiScreen', value: "'LXGW WenKai GB Screen', serif" },
  { labelKey: 'font.lxgwZhenKaiGB', value: "'LXGW ZhenKai GB', serif" },
  { labelKey: 'font.moonStarsKai', value: "'Moon Stars Kai', serif" },
  { labelKey: 'font.wenYuanRounded', value: "'WenYuan Rounded SC', sans-serif" }
]

/** 默认正文字体（系统默认）：theme.css 的 --doc-font 默认值须与本字面值逐字一致。 */
export const DEFAULT_DOC_FONT =
  "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif"

/** 默认排版（重启无值 / 值非法时的回退）：与 styles/theme.css :root 令牌一致。 */
export const DEFAULT_TYPOGRAPHY: TypographyState = {
  font: DEFAULT_DOC_FONT,
  line: '2',
  letter: '0.01em',
  page: '620px',
  zoom: '1'
}

/** 行距档位（--doc-line）。 */
export const LINE_OPTIONS: readonly string[] = ['1.4', '1.6', '1.8', '2.0', '2.4', '3.0']

/** 字距档位：labelKey 取 `typography` ns，value 为 --doc-letter 值（对齐原型 §10）。 */
export const LETTER_OPTIONS: readonly {
  labelKey:
    'letter.compact' | 'letter.standard' | 'letter.loose' | 'letter.airy' | 'letter.veryAiry'
  value: string
}[] = [
  { labelKey: 'letter.compact', value: '-0.01em' },
  { labelKey: 'letter.standard', value: '0.01em' },
  { labelKey: 'letter.loose', value: '0.05em' },
  { labelKey: 'letter.airy', value: '0.1em' },
  { labelKey: 'letter.veryAiry', value: '0.16em' }
]

/** 页宽档位：labelKey 取 `typography` ns，value 为 --page-width 值（对齐原型 §10）。 */
export const PAGE_OPTIONS: readonly {
  labelKey: 'page.narrow' | 'page.medium' | 'page.wide' | 'page.full'
  value: string
}[] = [
  { labelKey: 'page.narrow', value: '520px' },
  { labelKey: 'page.medium', value: '620px' },
  { labelKey: 'page.wide', value: '760px' },
  { labelKey: 'page.full', value: '100%' }
]

/** 缩放档位（--doc-zoom，无单位倍率，对齐原型 §10）。 */
export const ZOOM_OPTIONS: readonly number[] = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0]

/** 归一化字体：兼容容器的展开 / 空白差异，避免恢复时因格式细差误判非法。 */
function normalizeFont(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** 恢复时逐项校验：任一项不在档位集合内即回退该项默认值。 */
export function resolveTypography(value: unknown): TypographyState {
  const raw = (value ?? {}) as Partial<Record<keyof TypographyState, unknown>>
  const font = normalizeFont(String(raw.font ?? ''))
  const line = String(raw.line ?? '')
  const letter = String(raw.letter ?? '')
  const page = String(raw.page ?? '')
  const zoom = Number(raw.zoom)

  return {
    font: FONT_OPTIONS.some((option) => normalizeFont(option.value) === font)
      ? font
      : DEFAULT_TYPOGRAPHY.font,
    line: LINE_OPTIONS.includes(line) ? line : DEFAULT_TYPOGRAPHY.line,
    letter: LETTER_OPTIONS.some((option) => option.value === letter)
      ? letter
      : DEFAULT_TYPOGRAPHY.letter,
    page: PAGE_OPTIONS.some((option) => option.value === page) ? page : DEFAULT_TYPOGRAPHY.page,
    zoom: ZOOM_OPTIONS.includes(zoom) ? String(zoom) : DEFAULT_TYPOGRAPHY.zoom
  }
}

/** 弹窗内「当前项」选中判断：值匹配即选中（含全档弹窗共用）。 */
export function isOptionSelected(value: string, current: string): boolean {
  return value === current
}

interface TypographyContextValue {
  /** 当前排版 / 缩放（值域即 CSS 变量字面值）。 */
  typography: TypographyState
  /** 更新一项并持久化（防抖由 Provider 实现）。 */
  setTypography: (patch: Partial<TypographyState>) => void
}

const TypographyContext = createContext<TypographyContextValue | null>(null)

/**
 * 读取排版 / 缩放设置。无 Provider（如独立测试渲染）时回退默认值 + 空操作，
 * 保证调用方不会因缺省上下文而崩溃。
 */
export function useTypography(): TypographyContextValue {
  const context = useContext(TypographyContext)
  if (!context) {
    return { typography: DEFAULT_TYPOGRAPHY, setTypography: () => undefined }
  }
  return context
}

/** context 仅供 TypographyProvider.tsx 内部装配使用。 */
export { TypographyContext }

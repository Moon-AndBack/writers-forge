import type { ChipColorRow } from '../../../preload/types/chipColors'

/**
 * 胶囊配色注入（纯函数，不依赖 React）。
 *
 * 为什么必须注入**类规则**而不是往 `:root` 写变量：
 * CSS 自定义属性在**声明处**就完成 `var()` 替换，结果随继承下传。`:root` 上的
 * `--chip-*` 会被 `.chip-p-*` / `.chip-m-*` 在自己的规则里重新赋值（这些类规则
 * 直接命中胶囊元素本身，覆盖掉从根节点继承来的值），因此改根节点对胶囊无效。
 * 唯一可靠做法是按配色行生成同名的 `.chip-p-<presetKey>` / `.chip-m-<module>`
 * 规则，并以「后加载者胜」的方式追加到 `document.head` 末尾（与静态 CSS 同
 * 特异性 0,1,0，但文档顺序更靠后），从而覆盖 CSS 里的设计稿兜底色。
 */

/** 注入样式元素的 id（全局唯一，便于重复调用时整体替换）。 */
const STYLE_ELEMENT_ID = 'chip-color-overrides'

/** 已知模块白名单（与主进程 `WorldEntityType` 的五个值一致）。 */
const KNOWN_MODULES: readonly string[] = [
  'worldview',
  'character',
  'item',
  'faction',
  'power_system'
]

/** 预设子类路由键白名单：只允许小写字母、下划线与连字符，杜绝选择器注入。 */
const PRESET_KEY_PATTERN = /^[a-z_-]+$/

/** 严格 hex 校验：仅接受 `#rrggbb`（大小写不敏感，规范化输出小写）。 */
function normalizeHex(value: string): string | null {
  if (typeof value !== 'string') return null
  const hex = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null
}

/**
 * 取（或惰性创建）注入用 `<style>` 元素。
 * 同 id 元素若非 style（极端脏 DOM），先移除再重建，保证 id 唯一。
 */
function getStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ELEMENT_ID)
  if (existing) {
    if (existing instanceof HTMLStyleElement) return existing
    existing.remove()
  }
  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  ;(document.head ?? document.documentElement).appendChild(style)
  return style
}

/**
 * 配色行 → 选择器。`presetKey` / `module` 均须过白名单，非法返回 null（该行跳过）。
 * 注意：预设色必须排在模块兜底色**之后**注入，才能在同特异性下覆盖模块基色。
 */
function resolveSelector(row: ChipColorRow): string | null {
  if (row.scope === 'preset') {
    return PRESET_KEY_PATTERN.test(row.presetKey) ? `.chip-p-${row.presetKey}` : null
  }
  return KNOWN_MODULES.includes(row.module) ? `.chip-m-${row.module}` : null
}

/** 单行 → 一条类规则；色值非法（或选择器非法）返回 null。 */
function buildRule(row: ChipColorRow): string | null {
  const selector = resolveSelector(row)
  if (!selector) return null
  const bg = normalizeHex(row.bg)
  const fg = normalizeHex(row.fg)
  if (!bg || !fg) return null
  // `--chip-bg` / `--chip-fg` 为配色对本身；`--chip-base` 是当前胶囊视觉
  // （chip-pill.css 的底色 / 描边 / hover 派生）实际消费的基色，一并写入，
  // 让数据库色值真正生效，且无需改动任何 CSS 文件。
  return `${selector} { --chip-bg: ${bg}; --chip-fg: ${fg}; --chip-base: ${bg}; }`
}

/**
 * 把配色行写成类规则注入 `<style id="chip-color-overrides">`。
 *
 * - `scope='preset'` → `.chip-p-<presetKey>`；`scope='module'` → `.chip-m-<module>`；
 * - 每条规则设置 `--chip-bg` / `--chip-fg`（并同步 `--chip-base` 供现有胶囊样式消费）；
 * - 选择器白名单 + hex 校验不通过的行直接跳过，回落到 CSS 静态兜底配色；
 * - 每次调用整体替换 `textContent`（幂等，不累积规则）。
 */
export function applyChipColors(rows: readonly ChipColorRow[]): void {
  const style = getStyleElement()
  const moduleRules: string[] = []
  const presetRules: string[] = []

  for (const row of rows) {
    const rule = buildRule(row)
    if (!rule) continue
    if (row.scope === 'preset') presetRules.push(rule)
    else moduleRules.push(rule)
  }

  // 模块兜底在前、预设在后：胶囊同时挂 `.chip-m-*` 与 `.chip-p-*` 时预设色胜出。
  style.textContent = [...moduleRules, ...presetRules].join('\n')
}

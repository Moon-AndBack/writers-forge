/**
 * Style Guide 专用主题切换（不触碰应用 settings 表）。
 *
 * 应用正式主题由 `ThemeProvider` 写 settings 并触发 View Transition；展示页是 dev
 * 工具，只需要「立即看效果」，故直接写 `documentElement.dataset.theme`，用
 * localStorage 记忆本次选择即可。四套主题与 `styles/theme.css` 的选择器同名。
 */
export const THEME_STORAGE_KEY = 'styleguide:theme'

/** 用户可选的五档：system 为逻辑档，落盘时按系统偏好解析成 light / dark。 */
export const THEME_OPTIONS = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '亮色模式' },
  { id: 'dark', label: '暗色模式' },
  { id: 'sage', label: '浅绿模式' },
  { id: 'honey', label: '浅黄模式' }
] as const

export type StyleguideThemeId = (typeof THEME_OPTIONS)[number]['id']
export type ResolvedTheme = 'light' | 'dark' | 'sage' | 'honey'

const THEME_IDS: ReadonlySet<string> = new Set(THEME_OPTIONS.map((option) => option.id))

export function isStyleguideThemeId(value: unknown): value is StyleguideThemeId {
  return typeof value === 'string' && THEME_IDS.has(value)
}

/** 读取上次选择；缺省 / 非法 / localStorage 不可用时回退「跟随系统」。 */
export function readStoredTheme(): StyleguideThemeId {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isStyleguideThemeId(stored)) return stored
  } catch {
    /* localStorage 被禁用（隐私模式等）：按默认档继续，不影响展示 */
  }
  return 'system'
}

export function storeTheme(id: StyleguideThemeId): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id)
  } catch {
    /* 写入失败不影响当前会话的主题切换 */
  }
}

function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 逻辑档 → 实际写入 data-theme 的四主题之一。 */
export function resolveTheme(id: StyleguideThemeId): ResolvedTheme {
  if (id === 'system') return prefersDark() ? 'dark' : 'light'
  return id
}

export function applyTheme(id: StyleguideThemeId): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolveTheme(id)
}

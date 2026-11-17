/**
 * 封面色板**跨进程共享**的单一真源（主进程 `database/books` 与渲染层
 * `pages/bookshelf/bookMeta` 共用，AGENTS §2 / §9）。
 *
 * 本文件只允许**类型 + 纯数据 + 纯函数**，不得引入 `better-sqlite3` 等 Node 专有模块，
 * 也不得依赖 React——渲染层会直接打包它。
 *
 * 承接：8 组预设渐变的稳定 key + 色值、默认色 key 与归一化函数。
 * 色板以颜色本身展示（无中文展示名）：原 `label` 字段两端均无消费方，已随本次收敛删除。
 */

/** 封面色预设选项：稳定 key + 渐变值 + 纯色环。 */
export interface CoverColorOption {
  /** 稳定 key，持久化到 books.coverColor */
  key: string
  /** CSS background-image 值（预设渐变） */
  value: string
  /** 纯色环 / 强调色，供渲染层选中态使用 */
  ring: string
}

/**
 * 封面色预设（8 组，有序）。前 6 组沿用 template/index.html 的 .cover-swatch
 * 渐变（其中 red 归入 rose 键），新增 teal / slate 两组。
 *
 * **首项即默认色，顺序即 UI 色板顺序**，均不得改动（老数据缺省 / 非法值回退首色）。
 */
export const COVER_COLORS: readonly CoverColorOption[] = [
  {
    key: 'purple',
    value: 'linear-gradient(135deg, #5b4de8, #7d8cf5)',
    ring: '#5b4de8'
  },
  {
    key: 'blue',
    value: 'linear-gradient(135deg, #2f9ae0, #5fc0ec)',
    ring: '#2f9ae0'
  },
  {
    key: 'green',
    value: 'linear-gradient(135deg, #0f7b4f, #4ccfa4)',
    ring: '#0f7b4f'
  },
  {
    key: 'orange',
    value: 'linear-gradient(135deg, #9d5d00, #f2b357)',
    ring: '#9d5d00'
  },
  {
    key: 'violet',
    value: 'linear-gradient(135deg, #5c3a8a, #a86ad4)',
    ring: '#5c3a8a'
  },
  {
    key: 'teal',
    value: 'linear-gradient(135deg, #0f7b7b, #4ccfc4)',
    ring: '#0f7b7b'
  },
  {
    key: 'rose',
    value: 'linear-gradient(135deg, #c42b1c, #ff7a6a)',
    ring: '#c42b1c'
  },
  {
    key: 'slate',
    value: 'linear-gradient(135deg, #475069, #94a0bd)',
    ring: '#475069'
  }
]

/** 默认封面色 key（预设第一组）。 */
export const DEFAULT_COVER_COLOR = COVER_COLORS[0].key

/** 归一化封面色：命中 8 色 key 才透传，其余一律回退默认 key。 */
export function normalizeCoverColor(value: unknown): string {
  return typeof value === 'string' && COVER_COLORS.some((option) => option.key === value)
    ? value
    : DEFAULT_COVER_COLOR
}

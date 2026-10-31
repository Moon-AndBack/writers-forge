/**
 * 书籍元数据（渲染层常量与选项）。
 *
 * ⚠️ 来源：`src/main/database/books.ts` 的 `COVER_COLORS`（分组、顺序、字面量逐字一致，
 * 主进程调整需同步本文件）。
 *
 * 分类真源已迁至 `categories` 表（经 `categories:list` 提供，`categories.name`
 * 为中文原文不译项），渲染层不再维护分类名字镜像。
 *
 * 另附少量纯函数（色板 key → 渐变 / 标签、状态 / 频道 / 篇幅选项），供表单与卡片共用。
 */

import type { BookChannel, BookLength, BookStatus, StatusLabelKey } from './data'

/** 封面色预设选项（与主进程 CoverColorOption 同构）。 */
export interface CoverColorOption {
  /** 稳定 key，持久化到 books.coverColor */
  key: string
  /** 中文展示名 */
  label: string
  /** CSS background-image 值（预设渐变） */
  value: string
  /** 纯色环 / 强调色，供渲染层选中态使用 */
  ring: string
}

/** 封面色预设（8 组，有序）。镜像自 src/main/database/books.ts。 */
export const COVER_COLORS: readonly CoverColorOption[] = [
  {
    key: 'purple',
    label: '紫罗兰',
    value: 'linear-gradient(135deg, #5b4de8, #7d8cf5)',
    ring: '#5b4de8'
  },
  {
    key: 'blue',
    label: '天青',
    value: 'linear-gradient(135deg, #2f9ae0, #5fc0ec)',
    ring: '#2f9ae0'
  },
  {
    key: 'green',
    label: '松林',
    value: 'linear-gradient(135deg, #0f7b4f, #4ccfa4)',
    ring: '#0f7b4f'
  },
  {
    key: 'orange',
    label: '琥珀',
    value: 'linear-gradient(135deg, #9d5d00, #f2b357)',
    ring: '#9d5d00'
  },
  {
    key: 'violet',
    label: '暮紫',
    value: 'linear-gradient(135deg, #5c3a8a, #a86ad4)',
    ring: '#5c3a8a'
  },
  {
    key: 'teal',
    label: '湖绿',
    value: 'linear-gradient(135deg, #0f7b7b, #4ccfc4)',
    ring: '#0f7b7b'
  },
  {
    key: 'rose',
    label: '绯红',
    value: 'linear-gradient(135deg, #c42b1c, #ff7a6a)',
    ring: '#c42b1c'
  },
  {
    key: 'slate',
    label: '石板',
    value: 'linear-gradient(135deg, #475069, #94a0bd)',
    ring: '#475069'
  }
]

/** 默认封面色 key（预设第一组，与主进程 DEFAULT_COVER_COLOR 一致）。 */
export const DEFAULT_COVER_COLOR = COVER_COLORS[0]?.key ?? 'purple'

/**
 * 状态六态选项（表单 Segmented 用，顺序沿用主进程 `BOOK_STATUSES`）：
 * 展示名复用 `bookshelf.status.*`（与 `data.STATUS_META` 同源），消费者 `t(option.labelKey)`。
 */
export const BOOK_STATUS_OPTIONS: ReadonlyArray<{ value: BookStatus; labelKey: StatusLabelKey }> = [
  { value: 'writing', labelKey: 'status.writing' },
  { value: 'done', labelKey: 'status.done' },
  { value: 'draft', labelKey: 'status.draft' },
  { value: 'paused', labelKey: 'status.paused' },
  { value: 'dropped', labelKey: 'status.dropped' },
  { value: 'revising', labelKey: 'status.revising' }
]

/**
 * 频道选项（表单用；「未设置」由调用侧以清空按钮/占位表达，不占枚举位）。
 * 展示名用 `bookshelf.channel.*`。
 */
export const BOOK_CHANNEL_OPTIONS: ReadonlyArray<{
  value: BookChannel
  labelKey: 'channel.male' | 'channel.female' | 'channel.publish'
}> = [
  { value: 'male', labelKey: 'channel.male' },
  { value: 'female', labelKey: 'channel.female' },
  { value: 'publish', labelKey: 'channel.publish' }
]

/**
 * 篇幅选项（表单用；「未设置」由调用侧以清空按钮/占位表达，不占枚举位）。
 * 展示名用 `bookshelf.length.*`。
 */
export const BOOK_LENGTH_OPTIONS: ReadonlyArray<{
  value: BookLength
  labelKey: 'length.long' | 'length.medium' | 'length.short'
}> = [
  { value: 'long', labelKey: 'length.long' },
  { value: 'medium', labelKey: 'length.medium' },
  { value: 'short', labelKey: 'length.short' }
]

/** 色板选择器选项（把镜像常量映射为 ColorSwatchPicker 需要的结构）。 */
export const COVER_SWATCHES: ReadonlyArray<{ value: string; css: string; ring: string }> =
  COVER_COLORS.map((option) => ({ value: option.key, css: option.value, ring: option.ring }))

/** 封面色 key → 渐变值；未知 key 回退默认色。 */
export function getCoverGradient(key: string): string {
  return (COVER_COLORS.find((option) => option.key === key) ?? COVER_COLORS[0]).value
}

/** 封面色 key → 中文展示名；未知 key 回退默认色。 */
export function getCoverColorLabel(key: string): string {
  return (COVER_COLORS.find((option) => option.key === key) ?? COVER_COLORS[0]).label
}

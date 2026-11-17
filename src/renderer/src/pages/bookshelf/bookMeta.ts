/**
 * 书籍元数据（渲染层常量与选项）。
 *
 * 封面色板的单一真源在 `src/shared/coverColors.ts`（与主进程共用），此处原样重导出，
 * 既有导入路径（`bookMeta`）零改动。
 *
 * 分类真源已迁至 `categories` 表（经 `categories:list` 提供，`categories.name`
 * 为中文原文不译项），渲染层不再维护分类名字镜像。
 *
 * 另附少量纯函数（色板 key → 渐变、状态 / 频道 / 篇幅选项），供表单与卡片共用。
 */

import {
  COVER_COLORS,
  DEFAULT_COVER_COLOR,
  normalizeCoverColor
} from '../../../../shared/coverColors'
import type { CoverColorOption } from '../../../../shared/coverColors'
import type { BookChannel, BookLength, BookStatus, StatusLabelKey } from './data'

export { COVER_COLORS, DEFAULT_COVER_COLOR }
export type { CoverColorOption }

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

/** 色板选择器选项（把共享色板映射为 ColorSwatchPicker 需要的结构）。 */
export const COVER_SWATCHES: ReadonlyArray<{ value: string; css: string; ring: string }> =
  COVER_COLORS.map((option) => ({ value: option.key, css: option.value, ring: option.ring }))

/** 封面色 key → 渐变值；未知 key 回退默认色。 */
export function getCoverGradient(key: string): string {
  const option =
    COVER_COLORS.find((item) => item.key === normalizeCoverColor(key)) ?? COVER_COLORS[0]
  return option.value
}

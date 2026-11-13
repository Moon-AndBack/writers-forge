import type { CleanWordCategory, CleanWordSource } from '../../../../preload/types/cleanWords'

/* ============================================================
   违禁词库共享元信息（弹窗 / 词表 / 导入解析三方共用）：类别枚举、类别文案 key、
   分批步长与单词长度上限。内置词表出处只保留在主进程
   `cleanWordSeed/meta.ts`，界面不再展示（见 docs/specs/clean-words.md）。
   ============================================================ */

/** 合法类别（镜像主进程 `cleanWordCategories.ts`：值导入会把主进程模块打进渲染包）。 */
export const CATEGORIES = [
  'sexual',
  'minorSexual',
  'gambling',
  'drug',
  'fraud',
  'violence',
  'weapon',
  'minor',
  'other'
] as const satisfies readonly CleanWordCategory[]

/** 类别文案 key（`chapters` ns）。 */
export const CATEGORY_LABEL_KEYS = {
  sexual: 'cleanWords.category.sexual',
  minorSexual: 'cleanWords.category.minorSexual',
  gambling: 'cleanWords.category.gambling',
  drug: 'cleanWords.category.drug',
  fraud: 'cleanWords.category.fraud',
  violence: 'cleanWords.category.violence',
  weapon: 'cleanWords.category.weapon',
  minor: 'cleanWords.category.minor',
  other: 'cleanWords.category.other'
} as const

/** 单批渲染行数（首屏与「显示更多」步长）。 */
export const PAGE_SIZE = 80
/** 单词长度上限（镜像主进程 `ipc/cleanWords.ts` 的 MAX_WORD_CHARS，超长行本地淘汰）。 */
export const MAX_WORD_CHARS = 100

export type SourceFilter = 'all' | CleanWordSource
export type CategoryFilter = 'all' | CleanWordCategory

export function isCategory(value: string): value is CleanWordCategory {
  return (CATEGORIES as readonly string[]).includes(value)
}

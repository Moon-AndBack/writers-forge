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

/** 批量输入中第一个非法词条的类型与位置（`index` 为 1-based 非空段序号）。 */
export interface CleanWordInputIssue {
  kind: 'multiline' | 'tooShort' | 'tooLong'
  /** 非空段序号（1-based）；`multiline` 针对整段输入，固定为 0。 */
  index: number
}

/**
 * 解析添加输入框：支持中文逗号（，）与英文逗号（,）分隔的批量词条。
 *
 * - 含换行 → `multiline`（整批拦截），不再拆分；
 * - 逐段 `trim()`（原生 trim 覆盖全角空格 U+3000 与 NBSP）、丢弃空段；
 * - 保序去重（保留首次出现位置）；
 * - 逐段校验 2–`MAX_WORD_CHARS` 字，`index` 按非空段计（1-based）；
 * - **不拆顿号（、）**：顿号常出现在正常短语中，误拆风险高。
 */
export function parseCleanWordInput(raw: string): {
  words: string[]
  issue: CleanWordInputIssue | null
} {
  if (/[\r\n]/.test(raw)) {
    return { words: [], issue: { kind: 'multiline', index: 0 } }
  }

  const segments = raw
    .split(/[,，]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '')

  const words: string[] = []
  const seen = new Set<string>()
  for (const segment of segments) {
    if (seen.has(segment)) continue
    seen.add(segment)
    words.push(segment)
  }

  for (let index = 0; index < segments.length; index += 1) {
    const length = segments[index].length
    if (length < 2) return { words, issue: { kind: 'tooShort', index: index + 1 } }
    if (length > MAX_WORD_CHARS) return { words, issue: { kind: 'tooLong', index: index + 1 } }
  }

  return { words, issue: null }
}

export type SourceFilter = 'all' | CleanWordSource
export type CategoryFilter = 'all' | CleanWordCategory

export function isCategory(value: string): value is CleanWordCategory {
  return (CATEGORIES as readonly string[]).includes(value)
}

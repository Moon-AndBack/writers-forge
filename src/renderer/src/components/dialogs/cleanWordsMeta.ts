import type { CleanWordCategory, CleanWordSource } from '../../../../preload/types/cleanWords'

/* ============================================================
   违禁词库共享元信息（弹窗 / 词表 / 导入解析三方共用）：类别枚举、类别文案 key、
   分批步长、单词长度上限与内置词表出处。`BUILTIN_META` 是主进程
   `cleanWordSeed/meta.ts` 中 `BUILTIN_CLEAN_WORDS_META` 的镜像（渲染层不能直接
   import 主进程模块）。
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

/**
 * 内置词表元信息（镜像主进程 `cleanWordSeed/meta.ts` 的 `BUILTIN_CLEAN_WORDS_META`；
 * 渲染层不能直接 import 主进程模块）。出处行按 `sources` 逐项拼接（来源名 + 许可证），
 * 不再维护单来源的冗余字段。
 */
export const BUILTIN_META = {
  version: 2,
  generatedAt: '2026-11-10',
  sources: [
    {
      id: 'fwwdn',
      repository: 'https://github.com/fwwdn/sensitive-stop-words',
      commit: 'a7d06bb1c321e669943b6841570d9da6dad8ce2b',
      license: 'Apache-2.0',
      files: ['广告.txt', '色情类.txt', '涉枪涉爆违法信息关键词.txt'],
      words: 195
    },
    {
      id: 'houbb',
      repository: 'https://github.com/houbb/sensitive-word-data',
      commit: 'fe6fc2921836217b8c90619db81b24af8b22d80f',
      license: 'Apache-2.0',
      files: ['src/main/resources/sensitive_word_tags.txt'],
      words: 531
    },
    {
      id: 'manual',
      description: '项目自建：反诈 / 诱导未成年 / 极端暴力 / 改装武器 / 赌博毒品补充',
      license: 'MIT',
      words: 548
    }
  ],
  counts: {
    sexual: 320,
    minorSexual: 25,
    gambling: 120,
    drug: 104,
    fraud: 270,
    violence: 70,
    weapon: 260,
    minor: 105
  },
  total: 1274
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

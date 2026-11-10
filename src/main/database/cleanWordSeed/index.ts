/**
 * 内置违禁词种子（9 类中的 8 类；other 保留给用户自建词）。
 *
 * 数据来源与固定 commit 见 ./meta.ts；由 scripts/build-clean-word-seed.mjs 生成，
 * 请勿手工编辑。取用一律走 listBuiltinCleanWords()，不要直接 split 字符串。
 */
import { SEXUAL_WORDS } from './sexual'
import { MINOR_SEXUAL_WORDS } from './minorSexual'
import { GAMBLING_WORDS } from './gambling'
import { DRUG_WORDS } from './drug'
import { FRAUD_WORDS } from './fraud'
import { VIOLENCE_WORDS } from './violence'
import { WEAPON_WORDS } from './weapon'
import { MINOR_WORDS } from './minor'

/** 内置违禁词：每类一条逗号分隔字符串（避免展开成数千行源码）。 */
export const BUILTIN_CLEAN_WORDS = {
  sexual: SEXUAL_WORDS,
  minorSexual: MINOR_SEXUAL_WORDS,
  gambling: GAMBLING_WORDS,
  drug: DRUG_WORDS,
  fraud: FRAUD_WORDS,
  violence: VIOLENCE_WORDS,
  weapon: WEAPON_WORDS,
  minor: MINOR_WORDS
} as const

/** 内置词表分类（8 类，顺序即灌库顺序）。 */
export type BuiltinCleanWordCategory = keyof typeof BUILTIN_CLEAN_WORDS

const BUILTIN_CATEGORIES = [
  'sexual',
  'minorSexual',
  'gambling',
  'drug',
  'fraud',
  'violence',
  'weapon',
  'minor'
] as const

/**
 * 展开为词条数组（供灌库使用），按分类顺序、类内词长 / code point 顺序输出。
 *
 * 返回新数组，调用方可随意修改。
 */
export function listBuiltinCleanWords(): Array<{
  word: string
  category: BuiltinCleanWordCategory
}> {
  const result: Array<{ word: string; category: BuiltinCleanWordCategory }> = []
  for (const category of BUILTIN_CATEGORIES) {
    for (const word of BUILTIN_CLEAN_WORDS[category].split(',')) {
      if (word !== '') result.push({ word, category })
    }
  }
  return result
}

export { BUILTIN_CLEAN_WORDS_META } from './meta'

/**
 * 种子文件生成 / 写盘 / 报告（`build-clean-word-seed.mjs` 的模板层）。
 *
 * 与拉取、过滤逻辑分离，保证主脚本 < 300 行；本文件只做字符串拼装与输出。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const GENERATED_AT = '2026-11-10'
export const FWWDN_COMMIT = 'a7d06bb1c321e669943b6841570d9da6dad8ce2b'
export const HOUBB_COMMIT = 'fe6fc2921836217b8c90619db81b24af8b22d80f'
export const MANUAL_SOURCE = 'manual'

/** 类别顺序 = 输出文件顺序 = `cleanWordCategories.ts` 顺序（不含 other）。 */
export const CATEGORIES = [
  ['sexual', 'SEXUAL_WORDS', '色情'],
  ['minorSexual', 'MINOR_SEXUAL_WORDS', '未成年性剥削'],
  ['gambling', 'GAMBLING_WORDS', '赌博'],
  ['drug', 'DRUG_WORDS', '毒品'],
  ['fraud', 'FRAUD_WORDS', '诈骗'],
  ['violence', 'VIOLENCE_WORDS', '暴力血腥虐待'],
  ['weapon', 'WEAPON_WORDS', '武器爆炸物改装'],
  ['minor', 'MINOR_WORDS', '诱导未成年']
]

export const compareCodePoints = (a, b) => {
  const left = Array.from(a, (char) => char.codePointAt(0))
  const right = Array.from(b, (char) => char.codePointAt(0))
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return left.length - right.length
}

/** 类别顺序 → 词长 → code point（确定性排序）。 */
export function sortWords(words) {
  return [...words].sort((a, b) => a.length - b.length || compareCodePoints(a, b))
}

function quote(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function seedFile(category, constName, label, words) {
  return `/**
 * 内置违禁词 · ${label}（${category}）。
 *
 * 由 scripts/build-clean-word-seed.mjs 生成，请勿手工编辑。
 * 来源：fwwdn / houbb / 自建；按词长与 code point 排序，逗号分隔。
 */
export const ${constName} = ${quote(sortWords(words).join(','))}
`
}

function metaFile(assigned) {
  const counts = Object.fromEntries(CATEGORIES.map(([category]) => [category, 0]))
  const sourceCounts = { fwwdn: 0, houbb: 0, [MANUAL_SOURCE]: 0 }
  for (const entry of assigned.values()) {
    counts[entry.category] += 1
    sourceCounts[entry.source] += 1
  }
  const sourceLines = [
    `    {
      id: 'fwwdn',
      repository: 'https://github.com/fwwdn/sensitive-stop-words',
      commit: '${FWWDN_COMMIT}',
      license: 'Apache-2.0',
      files: ['广告.txt', '色情类.txt', '涉枪涉爆违法信息关键词.txt'],
      words: ${sourceCounts.fwwdn}
    },
    {
      id: 'houbb',
      repository: 'https://github.com/houbb/sensitive-word-data',
      commit: '${HOUBB_COMMIT}',
      license: 'Apache-2.0',
      files: ['src/main/resources/sensitive_word_tags.txt'],
      words: ${sourceCounts.houbb}
    },
    {
      id: 'manual',
      description: '项目自建：反诈 / 诱导未成年 / 极端暴力 / 改装武器 / 赌博毒品补充',
      license: 'MIT',
      words: ${sourceCounts.manual}
    }`
  ].join(',\n')
  const countLines = CATEGORIES.map(([category]) => `    ${category}: ${counts[category]}`).join(
    ',\n'
  )
  return `/**
 * 内置违禁词元信息（生成于 ${GENERATED_AT}）。
 *
 * 计数为最终去重后的入库词数（单归属：一个词只进一个类别）。
 */
export const BUILTIN_CLEAN_WORDS_META = {
  version: 2,
  generatedAt: '${GENERATED_AT}',
  sources: [
${sourceLines}
  ],
  counts: {
${countLines}
  },
  total: ${assigned.size}
} as const
`
}

function indexFile() {
  const imports = CATEGORIES.map(
    ([category, constName]) => `import { ${constName} } from './${category}'`
  ).join('\n')
  const entries = CATEGORIES.map(([category, constName]) => `  ${category}: ${constName}`).join(
    ',\n'
  )
  const order = CATEGORIES.map(([category]) => `'${category}'`).join(', ')
  return `/**
 * 内置违禁词种子（9 类中的 8 类；other 保留给用户自建词）。
 *
 * 数据来源与固定 commit 见 ./meta.ts；由 scripts/build-clean-word-seed.mjs 生成，
 * 请勿手工编辑。取用一律走 listBuiltinCleanWords()，不要直接 split 字符串。
 */
${imports}

/** 内置违禁词：每类一条逗号分隔字符串（避免展开成数千行源码）。 */
export const BUILTIN_CLEAN_WORDS = {
${entries}
} as const

/** 内置词表分类（8 类，顺序即灌库顺序）。 */
export type BuiltinCleanWordCategory = keyof typeof BUILTIN_CLEAN_WORDS

const BUILTIN_CATEGORIES = [${order}] as const

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
`
}

/** 写 8 个类别文件 + index.ts + meta.ts。 */
export function writeSeed(assigned, outDir) {
  mkdirSync(outDir, { recursive: true })
  const byCategory = Object.fromEntries(CATEGORIES.map(([category]) => [category, []]))
  for (const [word, entry] of assigned) byCategory[entry.category].push(word)
  for (const [category, constName, label] of CATEGORIES) {
    writeFileSync(
      join(outDir, `${category}.ts`),
      seedFile(category, constName, label, byCategory[category])
    )
  }
  writeFileSync(join(outDir, 'index.ts'), indexFile())
  writeFileSync(join(outDir, 'meta.ts'), metaFile(assigned))
}

/** `--report`：每类保留数 / 丢弃原因 Top / 来源 / 抽样 20 条。 */
export function reportSeed(assigned, stats) {
  const counts = Object.fromEntries(CATEGORIES.map(([category]) => [category, 0]))
  for (const entry of assigned.values()) counts[entry.category] += 1
  console.log('保留数：')
  for (const [category] of CATEGORIES) console.log(`  ${category.padEnd(12)} ${counts[category]}`)
  console.log(`  total        ${assigned.size}`)
  console.log(`  tag0 排除    ${stats.tag0}`)
  const sourceCounts = { fwwdn: 0, houbb: 0, [MANUAL_SOURCE]: 0 }
  for (const entry of assigned.values()) sourceCounts[entry.source] += 1
  console.log('来源：', sourceCounts)
  console.log('丢弃原因 Top：')
  for (const [category, reasons] of Object.entries(stats.drops)) {
    const top = Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(', ')
    console.log(`  ${category.padEnd(12)} ${top}`)
  }
  console.log('抽样（每类 20 条）：')
  for (const [category] of CATEGORIES) {
    const words = sortWords(
      [...assigned].filter(([, entry]) => entry.category === category).map(([word]) => word)
    )
    console.log(`  ${category}: ${words.slice(0, 20).join(' / ')}`)
  }
}

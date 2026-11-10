/**
 * `build-clean-word-seed.mjs --check` 的离线校验器。
 *
 * 只读种子文件，不联网、不写盘：检查重复、长度、正常词 / 裸词黑名单、
 * 模板词泄漏（自建词豁免）、联系方式、纯英文 / 数字 token、总数下限。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BARE_WORD_BLACKLIST,
  CONTACT_PATTERN,
  NORMAL_WORD_BLACKLIST,
  TEMPLATE_WORDS,
  TOKEN_WHITELIST
} from './filters.mjs'
import { MANUAL_WORDS } from './manual-words.mjs'
import { CATEGORIES } from './seed-files.mjs'

const NORMAL_SET = new Set(NORMAL_WORD_BLACKLIST)
const BARE_SET = new Set(BARE_WORD_BLACKLIST)
const MANUAL_SET = new Set(Object.values(MANUAL_WORDS).flat())
const TOKEN_SET = new Set(TOKEN_WHITELIST)

export function checkSeed(outDir) {
  const errors = []
  const seen = new Set()
  const counts = {}
  let total = 0

  for (const [category, constName] of CATEGORIES) {
    const file = join(outDir, `${category}.ts`)
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      errors.push(`缺少文件：${file}`)
      continue
    }
    const match = text.match(new RegExp(`export const ${constName} =\\s*'([^']*)'`))
    if (!match) {
      errors.push(`无法解析：${file}`)
      continue
    }
    const words = match[1].split(',').filter(Boolean)
    counts[category] = words.length
    if (words.length === 0) errors.push(`空类别：${category}`)
    for (const word of words) {
      total += 1
      if (word.length < 2 || word.length > 10) errors.push(`长度越界：${category} / ${word}`)
      if (NORMAL_SET.has(word)) errors.push(`正常词黑名单：${category} / ${word}`)
      if (BARE_SET.has(word)) errors.push(`裸词黑名单：${category} / ${word}`)
      if (!MANUAL_SET.has(word) && TEMPLATE_WORDS.some((item) => word.includes(item))) {
        errors.push(`模板词泄漏：${category} / ${word}`)
      }
      if (CONTACT_PATTERN.test(word)) errors.push(`联系方式：${category} / ${word}`)
      if (/^\d+$/.test(word) || /^[a-zA-Z]+$/.test(word)) {
        if (!TOKEN_SET.has(word)) errors.push(`非法 token：${category} / ${word}`)
      }
      if (seen.has(word)) errors.push(`重复词：${word}`)
      seen.add(word)
    }
  }

  if (total < 1000) errors.push(`总数不足 1000：${total}`)

  try {
    const metaText = readFileSync(join(outDir, 'meta.ts'), 'utf8')
    const totalMatch = metaText.match(/total:\s*(\d+)/)
    if (!totalMatch || Number(totalMatch[1]) !== total) {
      errors.push(`meta.total 不一致：期望 ${total}，实际 ${totalMatch?.[1] ?? '缺失'}`)
    }
    const sourceSum = [...metaText.matchAll(/words:\s*(\d+)/g)].reduce(
      (sum, item) => sum + Number(item[1]),
      0
    )
    if (sourceSum !== total) errors.push(`meta.sources 计数之和不一致：${sourceSum} ≠ ${total}`)
    for (const [category] of CATEGORIES) {
      const countMatch = metaText.match(new RegExp(`${category}:\\s*(\\d+)`))
      if (!countMatch || Number(countMatch[1]) !== counts[category]) {
        errors.push(`meta.counts.${category} 不一致：${countMatch?.[1] ?? '缺失'}`)
      }
    }
  } catch {
    errors.push('缺少 meta.ts')
  }

  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log(`校验通过：${total} 条，无重复 / 无黑名单 / 无模板泄漏 / 长度与 token 合法。`)
  }
}

#!/usr/bin/env node
/**
 * 生成内置违禁词种子（9 类中的 8 类；`other` 保留给用户自建词）。
 *
 * 数据源（固定 commit，一次性拉取，生成结果提交进仓库）：
 * - fwwdn/sensitive-stop-words：广告 / 色情 / 涉枪涉爆三个 txt；
 * - houbb/sensitive-word-data：`sensitive_word_tags.txt`（`词 标签`，空格分隔）。
 *
 * 用法：
 *   node scripts/build-clean-word-seed.mjs           生成并写入种子目录
 *   node scripts/build-clean-word-seed.mjs --report  生成并打印每类数量 / 丢弃原因 / 抽样
 *   node scripts/build-clean-word-seed.mjs --check   只校验现有种子（不联网、不写盘）
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BARE_WORD_BLACKLIST,
  CONTACT_PATTERN,
  DRUG_GATES,
  FRAUD_GATES,
  GAMBLING_GATES,
  MINOR_CUES,
  MINOR_SEXUAL_SUBJECTS,
  MINOR_SUBJECTS,
  NORMAL_WORD_BLACKLIST,
  SEXUAL_GATES,
  TEMPLATE_WORDS,
  TOKEN_WHITELIST,
  VIOLENCE_GATES,
  WEAPON_GATES,
  isLowQuality
} from './clean-words/filters.mjs'
import { MANUAL_WORDS } from './clean-words/manual-words.mjs'
import { checkSeed } from './clean-words/seed-check.mjs'
import {
  CATEGORIES,
  FWWDN_COMMIT,
  HOUBB_COMMIT,
  MANUAL_SOURCE,
  compareCodePoints,
  reportSeed,
  writeSeed
} from './clean-words/seed-files.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'src/main/database/cleanWordSeed')
const FWWDN_BASE = `https://raw.githubusercontent.com/fwwdn/sensitive-stop-words/${FWWDN_COMMIT}/`
const HOUBB_URL =
  `https://raw.githubusercontent.com/houbb/sensitive-word-data/${HOUBB_COMMIT}/` +
  'src/main/resources/sensitive_word_tags.txt'
const FWWDN_FILES = ['广告.txt', '色情类.txt', '涉枪涉爆违法信息关键词.txt']
const HOUBB_TAG_SUFFIX = /\s+([\d,]+)$/
const NORMAL_SET = new Set(NORMAL_WORD_BLACKLIST)
const BARE_SET = new Set(BARE_WORD_BLACKLIST)
/** 每类上限（质量优先；总量约 1300，种子体积控制在 50 KB 以内）。 */
const CATEGORY_LIMITS = {
  sexual: 320,
  minorSexual: 30,
  gambling: 120,
  drug: 120,
  fraud: 270,
  violence: 70,
  weapon: 260,
  minor: 105
}
const ALL_GATES = [
  ...SEXUAL_GATES,
  ...GAMBLING_GATES,
  ...DRUG_GATES,
  ...FRAUD_GATES,
  ...VIOLENCE_GATES,
  ...WEAPON_GATES
]

const hasAny = (word, list) => list.some((item) => word.includes(item))

/** 按优先级返回唯一类别（minor / minorSexual 需「主体 + 线索」双命中）。 */
function classify(word) {
  if (hasAny(word, MINOR_SEXUAL_SUBJECTS) && hasAny(word, SEXUAL_GATES)) return 'minorSexual'
  if (hasAny(word, MINOR_SUBJECTS) && hasAny(word, MINOR_CUES)) return 'minor'
  if (hasAny(word, SEXUAL_GATES)) return 'sexual'
  if (hasAny(word, GAMBLING_GATES)) return 'gambling'
  if (hasAny(word, DRUG_GATES)) return 'drug'
  if (hasAny(word, WEAPON_GATES)) return 'weapon'
  if (hasAny(word, FRAUD_GATES)) return 'fraud'
  if (hasAny(word, VIOLENCE_GATES)) return 'violence'
  return null
}

/** 通用清洗：去所有空白与尾逗号 / 句号，统一到可匹配形态。 */
function normalize(word) {
  return word
    .replace(/\s+/g, '')
    .replace(/[,，。;；]+$/, '')
    .trim()
}

/** 上游词过滤：返回丢弃原因或 null。模板词只作用于上游词（自建词人工豁免）。 */
function exclusionReason(word, { manual }) {
  if (word.length < 2 || word.length > (manual ? 10 : 8)) return 'length'
  if (NORMAL_SET.has(word) || BARE_SET.has(word)) return 'blacklist'
  if (CONTACT_PATTERN.test(word)) return 'contact'
  if (/^\d+$/.test(word) || /^[a-zA-Z]+$/.test(word)) {
    if (!TOKEN_WHITELIST.includes(word)) return 'token'
  }
  if (!manual && TEMPLATE_WORDS.some((item) => word.includes(item))) return 'template'
  return null
}

/**
 * 规范化条目集合：manual 先登记（人工优先），再按 fwwdn → houbb 顺序收上游词。
 * 返回 `Map<word, { category, source }>` 与统计对象。
 */
function collect(fwwdnTexts, houbbText) {
  const assigned = new Map()
  const tag0Words = new Set()
  const stats = { drops: {}, tag0: 0 }
  const addDrop = (category, reason) => {
    stats.drops[category] ??= {}
    stats.drops[category][reason] = (stats.drops[category][reason] ?? 0) + 1
  }

  for (const [category, words] of Object.entries(MANUAL_WORDS)) {
    for (const raw of words) {
      const word = normalize(raw)
      const reason = exclusionReason(word, { manual: true })
      if (reason) {
        addDrop(category, `manual:${reason}`)
        continue
      }
      if (assigned.has(word)) {
        addDrop(category, 'duplicate')
        continue
      }
      assigned.set(word, { category, source: MANUAL_SOURCE })
    }
  }

  const seen = new Set()
  const pushUpstream = (raw, source) => {
    const word = normalize(raw)
    if (word === '' || seen.has(word)) return
    seen.add(word)
    if (assigned.has(word)) return
    const category = classify(word)
    if (category === null) {
      addDrop('__gate', 'gate')
      return
    }
    if (isLowQuality(word, category)) {
      addDrop(category, 'lowQuality')
      return
    }
    const reason = exclusionReason(word, { manual: false })
    if (reason) {
      addDrop(category, reason)
      return
    }
    assigned.set(word, { category, source })
  }

  for (const text of fwwdnTexts) {
    for (const line of text.split(/\r?\n/)) {
      const word = line.trim()
      if (word !== '') pushUpstream(word, 'fwwdn')
    }
  }
  for (const line of houbbText.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const match = line.match(HOUBB_TAG_SUFFIX)
    const tags = match ? match[1].split(',').map((tag) => tag.trim()) : []
    if (tags.length === 0) continue // 无标签词质量不可控，不收
    if (tags.includes('0')) {
      stats.tag0 += 1
      tag0Words.add(normalize(match ? line.slice(0, match.index) : line))
      continue
    }
    pushUpstream(match ? line.slice(0, match.index) : line, 'houbb')
  }
  // 即使某个词先由 fwwdn 收录，只要 houbb 同词带 tag0，也从最终种子剔除，
  // 保证「种子中无任何 tag0 词」这一外部可审计的硬条件。
  for (const [word, entry] of assigned) {
    if (tag0Words.has(word)) {
      assigned.delete(word)
      addDrop(entry.category, 'tag0')
    }
  }
  applyLimits(assigned, stats)
  return { assigned, stats }
}

/** 质量分：自建 > fwwdn > houbb；短词、多门控命中、纯中文优先。 */
function qualityScore(word, source) {
  let score = source === MANUAL_SOURCE ? 3000 : source === 'fwwdn' ? 1000 : 0
  score += Math.max(0, 30 - word.length * 4)
  score += Math.min(12, ALL_GATES.filter((gate) => word.includes(gate)).length * 2)
  if (/^[\u4e00-\u9fa5]+$/.test(word)) score += 6
  return score
}

/** 按类别上限裁剪：自建词全保留，fwwdn 优先于 houbb，同类按质量分 / 词长 / code point。 */
function applyLimits(assigned, stats) {
  const byCategory = Object.fromEntries(CATEGORIES.map(([category]) => [category, []]))
  for (const [word, entry] of assigned) byCategory[entry.category].push([word, entry])
  for (const [category, limit] of Object.entries(CATEGORY_LIMITS)) {
    const entries = byCategory[category]
    if (entries.length <= limit) continue
    entries.sort(
      (a, b) =>
        qualityScore(b[0], b[1].source) - qualityScore(a[0], a[1].source) ||
        a[0].length - b[0].length ||
        compareCodePoints(a[0], b[0])
    )
    for (const [word] of entries.slice(limit)) {
      assigned.delete(word)
      stats.drops[category] ??= {}
      stats.drops[category].limit = (stats.drops[category].limit ?? 0) + 1
    }
  }
}

async function fetchText(url) {
  let lastError
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'writers-forge-clean-word-seed/2.0' },
        signal: AbortSignal.timeout(60_000)
      })
      if (!response.ok) throw new Error(`拉取失败 ${response.status}：${url}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt))
    }
  }
  throw lastError
}

async function build() {
  const fwwdnTexts = await Promise.all(
    FWWDN_FILES.map((file) => fetchText(FWWDN_BASE + encodeURIComponent(file)))
  )
  const houbbText = await fetchText(HOUBB_URL)
  return collect(fwwdnTexts, houbbText)
}

const mode = process.argv[2] ?? ''
if (mode === '--check') {
  checkSeed(OUT_DIR)
} else {
  const { assigned, stats } = await build()
  writeSeed(assigned, OUT_DIR)
  if (mode === '--report') reportSeed(assigned, stats)
  console.log(`已生成 ${assigned.size} 条 → ${OUT_DIR}`)
}

import Database from 'better-sqlite3'
import { getDb } from './index'
import { getParagraphs, saveParagraphs } from './paragraphs'
import { chapterEffectiveWords, recordDailyDelta } from './stats'
import { MAX_DOC_CHARS, docEffectiveChars } from '../ipc/docLimit'
import { logger } from '../logger'

/**
 * 章节「搜索 / 替换」数据层：对 `paragraphs` 做**子串全表扫描**（不引 FTS）。
 *
 * 口径与设计（单书可达千万字）：
 * - **扫描在主进程**：一次 SQL 取目标范围（本章 / 全书）全部段落文本，逐段 `indexOf` 循环找**非重叠**
 *   命中，构建命中数组；better-sqlite3 同步执行，扫描结果**按查询缓存**（同 bookId/scope/章节/query 复用），
 *   数据变更（段落保存 / 章节结构写 / 替换）经 `invalidateChapterSearchCache()` 失效；
 * - **分页**：缓存整份命中（上限 `MAX_RESULTS`，超出置 `truncated`），IPC 按 `offset/limit` 切页返回；
 *   渲染层「可中断」以请求序号匹配实现（过期响应丢弃），扫描本身为单次同步遍历、不跨页重扫；
 * - **不重叠**：命中与替换均按 `query.length` 步进（如 "aa" 在 "aaa" 中只算 1 处），保证
 *   「搜索计数」与「替换全部计数」一致。
 *
 * 替换落库复用 `saveParagraphs`（整章事务重写），并按 chapters IPC 同口径记录
 * 「当日净增量」（`chapterEffectiveWords` → `saveParagraphs` → `recordDailyDelta`）。
 * 替换绕开 `chapters:saveParagraphs` 通道，故在落库前**自行**做单篇上限校验（W10 遗留补齐）。
 */

/** 章节搜索域日志 scope（与 `ipc/chapterSearch.ts` 一致）。 */
const log = logger.scope('chapterSearch')

/** 搜索范围：本章 / 全书。 */
export type ChapterSearchScope = 'chapter' | 'book'

/** 单条命中：`start` / `end` 为**段内绝对偏移**（UTF-16 code unit，左闭右开），`context` = 该段全文。 */
export interface ChapterSearchHit {
  chapterId: number
  chapterTitle: string
  paragraphIdx: number
  start: number
  end: number
  context: string
}

/** 搜索入参。 */
export interface ChapterSearchInput {
  query: string
  scope: ChapterSearchScope
  /** 本章范围时的当前章 id；全书范围忽略。 */
  currentChapterId: number | null
  offset?: number
  limit?: number
}

/** 搜索分页结果。 */
export interface ChapterSearchPage {
  items: ChapterSearchHit[]
  /** 真实命中总数（不截断）；`items` 明细仍受 `MAX_RESULTS` 限制，见 `truncated`。 */
  total: number
  offset: number
  limit: number
  hasMore: boolean
  /** 命中数达到上限（结果被截断，替换全部仍会处理整本书）。 */
  truncated: boolean
}

/** 单条替换入参：定位到具体段落与段内偏移。 */
export interface ChapterReplaceInput {
  query: string
  replacement: string
  chapterId: number
  paragraphIdx: number
  start: number
  end: number
}

/** 单条替换结果。 */
export interface ChapterReplaceResult {
  replaced: number
  chapterId: number | null
}

/** 替换全部入参。 */
export interface ChapterReplaceAllInput {
  query: string
  replacement: string
  scope: ChapterSearchScope
  currentChapterId: number | null
}

/** 替换全部结果。 */
export interface ChapterReplaceAllResult {
  replaced: number
  chapters: number
  chapterIds: number[]
}

/** 缓存命中上限：单次扫描最多保留的命中数，防止极端高频词撑爆内存。 */
const MAX_RESULTS = 2000
/** 分页默认 / 上限。 */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
/** 缓存条目上限（保留最近若干组 query/scope）。 */
const MAX_CACHE_ENTRIES = 8

interface ScanRow {
  chapterId: number
  chapterTitle: string
  paragraphIdx: number
  text: string
}

interface ScanResult {
  /** 命中明细（最多 `MAX_RESULTS` 条，受截断）。 */
  hits: ChapterSearchHit[]
  /** 真实命中总数（不做截断；仅用于计数展示，「替换全部」据此口径一致）。 */
  total: number
  truncated: boolean
}

interface CacheEntry {
  version: number
  result: ScanResult
}

/** 数据版本：任何相关写操作自增，使旧缓存失效。 */
let cacheVersion = 0
const scanCache = new Map<string, CacheEntry>()

/** 失效搜索缓存（段落保存 / 章节结构写 / 替换后调用）。 */
export function invalidateChapterSearchCache(): void {
  cacheVersion += 1
  scanCache.clear()
}

/** 归一化整数入参到 [min, max]，非法回退 fallback。 */
function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

function cacheKey(
  bookId: string,
  scope: ChapterSearchScope,
  currentChapterId: number | null,
  query: string
): string {
  return `${bookId}\u0000${scope}\u0000${currentChapterId ?? ''}\u0000${query}`
}

/**
 * 扫描目标范围：非重叠（`query.length` 步进）累计命中。
 * 超出 `MAX_RESULTS` 后**继续计数**（只累加 `total`、不再构建明细对象，控制内存），
 * 从而一次遍历即得真实总数——无需二次 SQL 扫描。`truncated` 表示明细被截断。
 */
function collectHits(rows: ScanRow[], query: string): ScanResult {
  const hits: ChapterSearchHit[] = []
  let total = 0
  let truncated = false
  for (const row of rows) {
    const text = row.text
    if (text === '') continue
    let from = 0
    while (true) {
      const at = text.indexOf(query, from)
      if (at === -1) break
      total += 1
      if (hits.length < MAX_RESULTS) {
        hits.push({
          chapterId: row.chapterId,
          chapterTitle: row.chapterTitle,
          paragraphIdx: row.paragraphIdx,
          start: at,
          end: at + query.length,
          context: text
        })
      } else {
        truncated = true
      }
      from = at + query.length
    }
  }
  return { hits, total, truncated }
}

/** 取（并缓存）一次扫描结果。 */
function getScan(
  bookId: string,
  scope: ChapterSearchScope,
  currentChapterId: number | null,
  query: string
): ScanResult {
  const key = cacheKey(bookId, scope, currentChapterId, query)
  const cached = scanCache.get(key)
  if (cached && cached.version === cacheVersion) return cached.result

  const db = getDb()
  let rows: ScanRow[]
  if (scope === 'chapter') {
    if (currentChapterId === null) {
      rows = []
    } else {
      const statement: Database.Statement<[number], ScanRow> = db.prepare(
        `SELECT c.id AS chapterId, c.title AS chapterTitle,
                p.idx AS paragraphIdx, p.text AS text
         FROM paragraphs p JOIN chapters c ON c.id = p.chapter_id
         WHERE c.id = ? AND c.deleted_at IS NULL
         ORDER BY p.idx ASC`
      )
      rows = statement.all(currentChapterId)
    }
  } else {
    const statement: Database.Statement<[string], ScanRow> = db.prepare(
      `SELECT c.id AS chapterId, c.title AS chapterTitle,
              p.idx AS paragraphIdx, p.text AS text
       FROM paragraphs p JOIN chapters c ON c.id = p.chapter_id
       WHERE c.book_id = ? AND c.deleted_at IS NULL
       ORDER BY c.sort_order, c.id, p.idx ASC`
    )
    rows = statement.all(bookId)
  }

  const result = collectHits(rows, query)
  // 简单 LRU：超上限时淘汰最早插入的一条。
  if (scanCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = scanCache.keys().next().value
    if (oldest !== undefined) scanCache.delete(oldest)
  }
  scanCache.set(key, { version: cacheVersion, result })
  return result
}

/** 搜索：返回一页命中；query 为空 / bookId 为空 / 本章范围无当前章 → 空页。 */
export function searchChapters(bookId: string, input: ChapterSearchInput): ChapterSearchPage {
  const offset = normalizeInt(input.offset, 0, 0, Number.MAX_SAFE_INTEGER)
  const limit = normalizeInt(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const empty: ChapterSearchPage = {
    items: [],
    total: 0,
    offset,
    limit,
    hasMore: false,
    truncated: false
  }
  if (bookId === '' || input.query === '') return empty
  if (input.scope === 'chapter' && !input.currentChapterId) return empty

  const result = getScan(bookId, input.scope, input.currentChapterId, input.query)
  const items = result.hits.slice(offset, offset + limit)
  return {
    items,
    // 真实命中总数（不截断）；列表分页仍只覆盖缓存内的 `hits`（≤ MAX_RESULTS）。
    total: result.total,
    offset,
    limit,
    hasMore: offset + items.length < result.hits.length,
    truncated: result.truncated
  }
}

/** 非重叠统计 query 在 text 中的出现次数。 */
function countOccurrences(text: string, query: string): number {
  let count = 0
  let from = 0
  while (true) {
    const at = text.indexOf(query, from)
    if (at === -1) break
    count += 1
    from = at + query.length
  }
  return count
}

/** 非重叠替换 query → replacement。 */
function replaceOccurrences(text: string, query: string, replacement: string): string {
  let result = ''
  let from = 0
  while (true) {
    const at = text.indexOf(query, from)
    if (at === -1) {
      result += text.slice(from)
      break
    }
    result += text.slice(from, at) + replacement
    from = at + query.length
  }
  return result
}

/** 由章 id 反查未删除章 id（回收站章返回 null）。 */
function findLiveChapterId(chapterId: number): number | null {
  const row = getDb()
    .prepare('SELECT id FROM chapters WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .get(chapterId) as { id: number } | undefined
  return row?.id ?? null
}

/**
 * 单条替换：重新读取该章段落，校验 `text.slice(start, end) === query`（过期命中则不改），
 * 改写该段后经 `saveParagraphs` 落库并记录当日增量。
 *
 * **单篇上限兜底（W10）**：替换直接改库、不过 `chapters:saveParagraphs`，故在落库前
 * 以 `docEffectiveChars` 校验替换后有效字数；超限拒绝本次替换（返回 `replaced: 0`）并记日志。
 */
export function replaceHit(bookId: string, input: ChapterReplaceInput): ChapterReplaceResult {
  const noChange: ChapterReplaceResult = { replaced: 0, chapterId: null }
  if (
    bookId === '' ||
    input.query === '' ||
    !Number.isInteger(input.chapterId) ||
    input.chapterId <= 0 ||
    !Number.isInteger(input.paragraphIdx) ||
    !Number.isInteger(input.start) ||
    !Number.isInteger(input.end) ||
    input.start < 0 ||
    input.end < input.start
  ) {
    return noChange
  }

  const chapterId = findLiveChapterId(input.chapterId)
  if (chapterId === null) return noChange

  const rows = getParagraphs(input.chapterId)
  const index = rows.findIndex((row) => row.idx === input.paragraphIdx)
  if (index === -1) return { replaced: 0, chapterId }

  const text = rows[index].text
  if (input.end > text.length || text.slice(input.start, input.end) !== input.query) {
    return { replaced: 0, chapterId }
  }

  // 替换保留每段既有 contentJson（替换只改文本，不碰块级结构；段 JSON 内的文本由
  // 渲染层读回重建后按新文本重新呈现）。
  const paragraphs = rows.map((row) => ({
    text: row.text,
    contentJson: row.contentJson
  }))
  paragraphs[index] = {
    text: text.slice(0, input.start) + input.replacement + text.slice(input.end),
    contentJson: rows[index].contentJson
  }

  const nextTexts = paragraphs.map((item) => item.text)
  // 单篇上限兜底：替换后超限则拒绝本次替换（返回既有「无变更」形态，不改库）。
  const effectiveChars = docEffectiveChars(nextTexts)
  if (effectiveChars > MAX_DOC_CHARS) {
    log.error('chapters:replace 替换后超出单篇上限，已拒绝替换', {
      bookId,
      chapterId: input.chapterId,
      effectiveChars,
      limit: MAX_DOC_CHARS
    })
    return { replaced: 0, chapterId }
  }

  const before = chapterEffectiveWords(input.chapterId)
  saveParagraphs(input.chapterId, paragraphs)
  recordDailyDelta(before, nextTexts)
  invalidateChapterSearchCache()
  return { replaced: 1, chapterId }
}

/** 取范围内待处理的章（章 id），按章节展示序。 */
function listScopeChapters(
  bookId: string,
  scope: ChapterSearchScope,
  currentChapterId: number | null
): Array<{ chapterId: number }> {
  const db = getDb()
  if (scope === 'chapter') {
    if (currentChapterId === null) return []
    return db
      .prepare('SELECT id AS chapterId FROM chapters WHERE id = ? AND deleted_at IS NULL')
      .all(currentChapterId) as Array<{ chapterId: number }>
  }
  return db
    .prepare(
      `SELECT id AS chapterId FROM chapters
       WHERE book_id = ? AND deleted_at IS NULL ORDER BY sort_order, id`
    )
    .all(bookId) as Array<{ chapterId: number }>
}

/**
 * 替换全部：范围内逐章读取段落、非重叠替换、仅对**有变化**的章落库（并记录当日增量），
 * 整批包在一个事务内保证原子性；返回受影响字数（= 替换的命中数）与受影响章。
 *
 * **单篇上限兜底（W10）**：逐章在落库前校验替换后的有效字数，超限则**跳过该章**并记日志，
 * 其余章继续；`replaced` 计数仅在**校验通过、真正落库后**累加（被跳过的章不计入命中数）。
 */
export function replaceAllChapters(
  bookId: string,
  input: ChapterReplaceAllInput
): ChapterReplaceAllResult {
  if (bookId === '' || input.query === '') return { replaced: 0, chapters: 0, chapterIds: [] }

  const scopeChapters = listScopeChapters(bookId, input.scope, input.currentChapterId)
  const db = getDb()
  const run = db.transaction((): { replaced: number; chapterIds: number[] } => {
    const chapterIds: number[] = []
    let replaced = 0
    for (const chapter of scopeChapters) {
      const rows = getParagraphs(chapter.chapterId)
      const paragraphs = rows.map((row) => ({ text: row.text, contentJson: row.contentJson }))
      const texts = paragraphs.map((item) => item.text)
      let changed = false
      let chapterReplaced = 0
      for (let i = 0; i < texts.length; i += 1) {
        const text = texts[i]
        if (!text.includes(input.query)) continue
        const next = replaceOccurrences(text, input.query, input.replacement)
        if (next === text) continue
        texts[i] = next
        paragraphs[i] = { ...paragraphs[i], text: next }
        chapterReplaced += countOccurrences(text, input.query)
        changed = true
      }
      if (!changed) continue
      // 单篇上限兜底：超限则跳过该章（不入命中数、不落库），其余章继续。
      const effectiveChars = docEffectiveChars(texts)
      if (effectiveChars > MAX_DOC_CHARS) {
        log.error('chapters:replaceAll 替换后超出单篇上限，已跳过该章', {
          bookId,
          chapterId: chapter.chapterId,
          effectiveChars,
          limit: MAX_DOC_CHARS
        })
        continue
      }
      const before = chapterEffectiveWords(chapter.chapterId)
      saveParagraphs(chapter.chapterId, paragraphs)
      recordDailyDelta(before, texts)
      replaced += chapterReplaced
      chapterIds.push(chapter.chapterId)
    }
    return { replaced, chapterIds }
  })

  const { replaced, chapterIds } = run()
  if (chapterIds.length > 0) invalidateChapterSearchCache()
  return { replaced, chapters: chapterIds.length, chapterIds }
}

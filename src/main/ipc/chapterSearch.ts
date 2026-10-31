import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  replaceAllChapters,
  replaceHit,
  searchChapters,
  type ChapterReplaceAllInput,
  type ChapterReplaceInput,
  type ChapterSearchInput,
  type ChapterSearchScope
} from '../database/chapterSearch'

/** 章节搜索域日志 scope。 */
const log = logger.scope('chapterSearch')

/** 校验搜索范围。 */
function isScope(value: unknown): value is ChapterSearchScope {
  return value === 'chapter' || value === 'book'
}

/** 校验可选整数（undefined / 整数）。 */
function isOptionalInt(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value))
}

/** 校验单条替换入参。 */
function isReplaceInput(value: unknown): value is ChapterReplaceInput {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  return (
    typeof input.query === 'string' &&
    typeof input.replacement === 'string' &&
    typeof input.chapterId === 'number' &&
    Number.isInteger(input.chapterId) &&
    typeof input.paragraphIdx === 'number' &&
    Number.isInteger(input.paragraphIdx) &&
    typeof input.start === 'number' &&
    Number.isInteger(input.start) &&
    typeof input.end === 'number' &&
    Number.isInteger(input.end)
  )
}

/**
 * 章节搜索 / 替换 IPC：通道前缀 `chapters:`。
 *
 * 通道 → 入参 / 出参（非法入参回退安全默认，不抛异常）：
 * - chapters:search     (bookId, { query, scope, currentChapterId, offset?, limit? })
 *       → ChapterSearchPage { items, total, offset, limit, hasMore, truncated }
 * - chapters:replace    (bookId, { query, replacement, chapterId, paragraphIdx, start, end })
 *       → { replaced: number, chapterId }（过期命中 / 段落不存在 / 替换后超限 → replaced 0）
 * - chapters:replaceAll (bookId, { query, replacement, scope, currentChapterId })
 *       → { replaced, chapters, chapterIds }（替换的命中总数 / 受影响章数 / 章 id）
 *
 * 搜索为同步全表扫描（缓存 + 分页见 `database/chapterSearch.ts`）；替换属**写操作**，经 `runWrite` 打点，
 * 成功后失效搜索缓存。
 */
export function registerChapterSearchIpc(): void {
  ipcMain.handle('chapters:search', (_event, bookId: unknown, input: unknown) => {
    const empty = {
      items: [],
      total: 0,
      offset: 0,
      limit: 50,
      hasMore: false,
      truncated: false
    }
    if (typeof bookId !== 'string' || bookId === '') return empty
    if (typeof input !== 'object' || input === null) return empty
    const raw = input as Record<string, unknown>
    if (typeof raw.query !== 'string' || !isScope(raw.scope)) return empty
    if (raw.currentChapterId !== null && !isOptionalInt(raw.currentChapterId)) return empty
    if (!isOptionalInt(raw.offset) || !isOptionalInt(raw.limit)) return empty
    const parsed: ChapterSearchInput = {
      query: raw.query,
      scope: raw.scope,
      currentChapterId: (raw.currentChapterId as number | null | undefined) ?? null,
      offset: raw.offset,
      limit: raw.limit
    }
    try {
      const page = searchChapters(bookId, parsed)
      log.debug('chapters:search 完成', {
        bookId,
        scope: parsed.scope,
        total: page.total,
        offset: page.offset
      })
      return page
    } catch (error) {
      log.error('chapters:search 失败', { bookId, error })
      return { ...empty, offset: parsed.offset ?? 0 }
    }
  })

  ipcMain.handle('chapters:replace', (_event, bookId: unknown, input: unknown) => {
    if (typeof bookId !== 'string' || bookId === '' || !isReplaceInput(input)) {
      return { replaced: 0, chapterId: null }
    }
    try {
      const result = replaceHit(bookId, input)
      log.debug('chapters:replace 完成', {
        bookId,
        chapterId: input.chapterId,
        paragraphIdx: input.paragraphIdx,
        replaced: result.replaced
      })
      return result
    } catch (error) {
      log.error('chapters:replace 失败', { bookId, chapterId: input.chapterId, error })
      return { replaced: 0, chapterId: null }
    }
  })

  ipcMain.handle('chapters:replaceAll', (_event, bookId: unknown, input: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') {
      return { replaced: 0, chapters: 0, chapterIds: [] }
    }
    if (typeof input !== 'object' || input === null) {
      return { replaced: 0, chapters: 0, chapterIds: [] }
    }
    const raw = input as Record<string, unknown>
    if (
      typeof raw.query !== 'string' ||
      typeof raw.replacement !== 'string' ||
      !isScope(raw.scope)
    ) {
      return { replaced: 0, chapters: 0, chapterIds: [] }
    }
    const parsed: ChapterReplaceAllInput = {
      query: raw.query,
      replacement: raw.replacement,
      scope: raw.scope,
      currentChapterId: (raw.currentChapterId as number | null | undefined) ?? null
    }
    try {
      const result = replaceAllChapters(bookId, parsed)
      log.debug('chapters:replaceAll 完成', {
        bookId,
        scope: parsed.scope,
        replaced: result.replaced,
        chapters: result.chapters
      })
      return result
    } catch (error) {
      log.error('chapters:replaceAll 失败', { bookId, error })
      return { replaced: 0, chapters: 0, chapterIds: [] }
    }
  })
}

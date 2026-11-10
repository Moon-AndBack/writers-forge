import { ipcMain } from 'electron'
import {
  CLEAN_WORD_CATEGORIES,
  CLEAN_WORD_SOURCES,
  countCleanWords,
  deleteCleanWord,
  importCleanWords,
  listActiveCleanWords,
  listCleanWords,
  setCategoryEnabled,
  setCleanWordEnabled
} from '../database/cleanWords'
import type {
  CleanWordCategory,
  CleanWordFilter,
  CleanWordImportInput,
  CleanWordImportResult,
  CleanWordSource
} from '../database/cleanWords'
import { logger } from '../logger'

/** 违禁词域日志 scope。 */
const log = logger.scope('cleanWords')

/** 单次导入的词条条数上限（够导入大词表，挡住恶意超大批量）。 */
const MAX_IMPORT_WORDS = 50_000

/** 单条词条 / 替代词的长度上限（字符数）。 */
const MAX_WORD_CHARS = 100
const MAX_REPLACEMENT_CHARS = 200

/**
 * 违禁词库 IPC：通道前缀 `cleanWords:`。
 *
 * 通道 → 入参 / 出参：
 * - cleanWords:list    ({ source?, category? })              → CleanWordRow[]（设置页词表浏览）
 * - cleanWords:count   ()                                    → CleanWordCount[]（各来源 / 类别计数）
 * - cleanWords:active  ()                                    → ActiveCleanWord[]（检测用：仅启用中的词）
 * - cleanWords:import  ({ words, source })                   → CleanWordImportResult | null
 * - cleanWords:toggle  ({ id, enabled })                     → boolean
 * - cleanWords:setCategoryEnabled ({ category, enabled })    → number（仅内置词，失败 → -1）
 * - cleanWords:delete  ({ id })                              → boolean（仅 source='user' 可删）
 *
 * 校验强度：入参一律 `unknown` + 本层显式收敛（对象形态 / 枚举白名单 / 长度上限 / 正整数），
 * 非法一律回退安全兜底值（读 → 空数组、写 → false / null），不把未校验数据下推到数据层。
 *
 * 🔴 `cleanWords:import` 的 `source` **强制为 `'user'`**（入参里的 `source` 一律忽略）：
 * 内置词库由主进程播种 / 版本更新流程独占管理，若允许渲染层写入 `builtin`，
 * 用户导入即可污染内置词源（也会让「内置词不可删除、只能禁用」的语义失效）。
 *
 * ⚠️ 日志**不记录词条内容**（违禁词本身即敏感数据）：只记数量与枚举字段，
 * 形如 `{ count, source }`；数据库异常只落 error 对象。
 */
export function registerCleanWordsIpc(): void {
  ipcMain.handle('cleanWords:list', (_event, input: unknown) => {
    const filter = readFilter(input)
    if (!filter) {
      log.warn('cleanWords:list 入参非法')
      return []
    }
    try {
      const rows = listCleanWords(filter)
      log.debug('cleanWords:list 完成', {
        count: rows.length,
        source: filter.source,
        category: filter.category
      })
      return rows
    } catch (error) {
      log.error('cleanWords:list 失败', error)
      return []
    }
  })

  ipcMain.handle('cleanWords:count', () => {
    try {
      const counts = countCleanWords()
      log.debug('cleanWords:count 完成', { groups: counts.length })
      return counts
    } catch (error) {
      log.error('cleanWords:count 失败', error)
      return []
    }
  })

  ipcMain.handle('cleanWords:active', () => {
    try {
      const words = listActiveCleanWords()
      log.debug('cleanWords:active 完成', { count: words.length })
      return words
    } catch (error) {
      log.error('cleanWords:active 失败', error)
      return []
    }
  })

  ipcMain.handle('cleanWords:import', (_event, input: unknown): CleanWordImportResult | null => {
    const words = readImportWords(input)
    if (!words) {
      log.warn('cleanWords:import 入参非法')
      return null
    }
    // 来源固定为 'user'：内置词库只由主进程播种，渲染层无权写入 builtin。
    const source: CleanWordSource = 'user'
    return runWrite(
      'cleanWords:import',
      { count: words.length, source },
      () => importCleanWords(words, source),
      null
    )
  })

  ipcMain.handle('cleanWords:toggle', (_event, input: unknown) => {
    if (!isRecord(input)) return false
    const { id, enabled } = input
    if (!isPositiveInt(id) || typeof enabled !== 'boolean') {
      log.warn('cleanWords:toggle 入参非法')
      return false
    }
    return runWrite(
      'cleanWords:toggle',
      { id, enabled },
      () => setCleanWordEnabled(id, enabled),
      false
    )
  })

  ipcMain.handle('cleanWords:setCategoryEnabled', (_event, input: unknown) => {
    if (!isRecord(input) || !isCategory(input.category) || typeof input.enabled !== 'boolean') {
      log.warn('cleanWords:setCategoryEnabled 入参非法')
      return -1
    }
    const { category, enabled } = input
    return runWrite(
      'cleanWords:setCategoryEnabled',
      { category, enabled },
      () => setCategoryEnabled(category, enabled),
      -1
    )
  })

  ipcMain.handle('cleanWords:delete', (_event, input: unknown) => {
    if (!isRecord(input) || !isPositiveInt(input.id)) {
      log.warn('cleanWords:delete 入参非法')
      return false
    }
    const { id } = input
    return runWrite('cleanWords:delete', { id }, () => deleteCleanWord(id), false)
  })
}

/** 通用判定：普通对象（排除数组与 null）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 字符串且长度不超过上限。 */
function isTextWithin(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.length <= maxChars
}

/** 正整数（词条 id）。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 类别白名单（与表级 CHECK 同源，杜绝脏枚举下推数据层）。 */
function isCategory(value: unknown): value is CleanWordCategory {
  return typeof value === 'string' && (CLEAN_WORD_CATEGORIES as readonly string[]).includes(value)
}

/** 来源白名单（仅用于 `list` 过滤条件）。 */
function isSource(value: unknown): value is CleanWordSource {
  return typeof value === 'string' && (CLEAN_WORD_SOURCES as readonly string[]).includes(value)
}

/**
 * 解析 `cleanWords:list` 的过滤条件。
 *
 * 缺省（`undefined` / `null`）= 无过滤；非对象或枚举非法 → `null`（整体拒绝，不做部分过滤）。
 */
function readFilter(input: unknown): CleanWordFilter | null {
  if (input === undefined || input === null) return {}
  if (!isRecord(input)) return null

  const filter: CleanWordFilter = {}
  if (input.source !== undefined) {
    if (!isSource(input.source)) return null
    filter.source = input.source
  }
  if (input.category !== undefined) {
    if (!isCategory(input.category)) return null
    filter.category = input.category
  }
  return filter
}

/**
 * 解析 `cleanWords:import` 的词条数组（逐条校验，任一条非法即整批拒绝）。
 *
 * 空 `words` 数组合法（返回全零计数）；`source` 字段不读取——调用方无权指定来源。
 */
function readImportWords(input: unknown): CleanWordImportInput[] | null {
  if (!isRecord(input)) return null
  const raw = input.words
  if (!Array.isArray(raw) || raw.length > MAX_IMPORT_WORDS) return null

  const words: CleanWordImportInput[] = []
  for (const item of raw) {
    if (!isRecord(item)) return null
    const { word, category, replacement } = item
    if (!isTextWithin(word, MAX_WORD_CHARS)) return null
    if (!isCategory(category)) return null
    if (replacement === undefined || replacement === null) {
      words.push({ word, category })
    } else {
      if (!isTextWithin(replacement, MAX_REPLACEMENT_CHARS)) return null
      words.push({ word, category, replacement })
    }
  }
  return words
}

/** 数据库写操作：成功 debug、失败 error 并返回兜底值（错误不外抛给渲染层）。 */
function runWrite<T>(channel: string, ctx: Record<string, unknown>, fn: () => T, fallback: T): T {
  try {
    const result = fn()
    log.debug(`${channel} 完成`, ctx)
    return result
  } catch (error) {
    log.error(`${channel} 失败`, { ...ctx, error })
    return fallback
  }
}

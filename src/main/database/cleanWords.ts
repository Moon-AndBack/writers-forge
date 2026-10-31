import { getDb } from './index'

/**
 * 违禁词库数据访问（`clean_word_list`）。
 *
 * 结构真源见 `schema/cleanWords.ts`。约定：
 * - 词表**全局共享**（无 `book_id`），`word` 唯一，一个词只归一个类别；
 * - 写入一律**同步**（better-sqlite3），词已去首尾空白；空词不入库；
 * - 写操作失败**直接抛错**（由 IPC 层兜底回传），读操作无命中返回**空数组**；
 * - 批量导入整体一个事务：任一行抛错即整体回滚，不会留下半批数据；
 * - `source = 'builtin'` 的行**不可删除、只能禁用**：内置词库随版本更新，
 *   若允许删除，下次更新会被重新导入（「删了又回来」），故统一用 `enabled = 0`
 *   表达「用户不想要它」，删除只对用户自建词开放。
 */

/** 违禁词类别（与表级 CHECK 逐字对应）。 */
export type CleanWordCategory = 'political' | 'sexual' | 'violence' | 'ads' | 'profanity' | 'other'

/** 词条来源（与表级 CHECK 逐字对应）。 */
export type CleanWordSource = 'builtin' | 'user'

/** 违禁词行（领域对象）。 */
export interface CleanWordRow {
  id: number
  word: string
  category: CleanWordCategory
  source: CleanWordSource
  replacement: string
  enabled: boolean
  sortOrder: number
  updatedAt: string
}

/** 检测扫描用的最小行（只含命中判定与提示所需字段）。 */
export interface ActiveCleanWord {
  word: string
  category: CleanWordCategory
  replacement: string
}

/** 列表过滤条件（均可省略）。 */
export interface CleanWordFilter {
  source?: CleanWordSource
  category?: CleanWordCategory
}

/** 批量导入入参。 */
export interface CleanWordImportInput {
  word: string
  category: CleanWordCategory
  replacement?: string
}

/** 批量导入结果计数。 */
export interface CleanWordImportResult {
  inserted: number
  updated: number
  skipped: number
}

/** 来源 / 类别聚合计数（设置页展示用）。 */
export interface CleanWordCount {
  source: CleanWordSource
  category: CleanWordCategory
  count: number
}

/** 合法类别清单（供上层做参数校验 / 下拉枚举）。 */
export const CLEAN_WORD_CATEGORIES: readonly CleanWordCategory[] = [
  'political',
  'sexual',
  'violence',
  'ads',
  'profanity',
  'other'
]

/** 合法来源清单。 */
export const CLEAN_WORD_SOURCES: readonly CleanWordSource[] = ['builtin', 'user']

const SELECT_COLUMNS = `id, word, category, source, replacement, enabled,
  sort_order AS sortOrder, updated_at AS updatedAt`

/** `PRAGMA table_info` 口径的原始行（枚举列按字符串读入，再做窄化）。 */
interface CleanWordDbRow {
  id: number
  word: string
  category: string
  source: string
  replacement: string
  enabled: number
  sortOrder: number
  updatedAt: string
}

/** 轻量行（检测扫描）。 */
interface CleanWordScanRow {
  word: string
  category: string
  replacement: string
}

/** 类别窄化：脏数据（绕过 CHECK 的老库 / 手工改库）回退 `other`。 */
function toCategory(value: string): CleanWordCategory {
  return (CLEAN_WORD_CATEGORIES as readonly string[]).includes(value)
    ? (value as CleanWordCategory)
    : 'other'
}

/** 来源窄化：未知来源按用户自建处理（可删除，不会被内置更新复活）。 */
function toSource(value: string): CleanWordSource {
  return (CLEAN_WORD_SOURCES as readonly string[]).includes(value)
    ? (value as CleanWordSource)
    : 'user'
}

/** 数据库行 → 领域行。 */
function toCleanWordRow(row: CleanWordDbRow): CleanWordRow {
  return {
    id: row.id,
    word: row.word,
    category: toCategory(row.category),
    source: toSource(row.source),
    replacement: row.replacement,
    enabled: row.enabled === 1,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt
  }
}

/** 列出全部词条（可按来源 / 类别过滤），按 `sort_order`、`id` 升序。 */
export function listCleanWords(filter: CleanWordFilter = {}): CleanWordRow[] {
  const conditions: string[] = []
  const params: string[] = []
  if (filter.source) {
    conditions.push('source = ?')
    params.push(filter.source)
  }
  if (filter.category) {
    conditions.push('category = ?')
    params.push(filter.category)
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM clean_word_list${where} ORDER BY sort_order, id`)
    .all(...params) as CleanWordDbRow[]
  return rows.map(toCleanWordRow)
}

/** 列出启用中的词条（供检测扫描），只取 `word` / `category` / `replacement`。 */
export function listActiveCleanWords(): ActiveCleanWord[] {
  const rows = getDb()
    .prepare(
      `SELECT word, category, replacement FROM clean_word_list
       WHERE enabled = 1 ORDER BY sort_order, id`
    )
    .all() as CleanWordScanRow[]
  return rows.map((row) => ({
    word: row.word,
    category: toCategory(row.category),
    replacement: row.replacement
  }))
}

/**
 * 新增单条（`word` 已存在则更新类别 / 替代词并置为启用，`source` 保持原值）。
 *
 * - `word` 去首尾空白，空串抛错（写入失败语义）；
 * - 新行追加到词表末尾（`sort_order = MAX + 1`）；
 * - 返回落库后的行（按 `word` 回读，含自增 id 与 `updated_at`）。
 */
export function upsertCleanWord(input: {
  word: string
  category: CleanWordCategory
  replacement?: string
  source?: CleanWordSource
}): CleanWordRow {
  const word = input.word.trim()
  if (word === '') throw new Error('违禁词不能为空')

  const db = getDb()
  db.prepare(
    `INSERT INTO clean_word_list (word, category, source, replacement, enabled, sort_order)
     VALUES (@word, @category, @source, @replacement, 1,
             (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM clean_word_list))
     ON CONFLICT(word) DO UPDATE SET
       category = excluded.category,
       replacement = excluded.replacement,
       enabled = 1,
       updated_at = datetime('now')`
  ).run({
    word,
    category: input.category,
    source: input.source ?? 'user',
    replacement: input.replacement ?? ''
  })

  const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM clean_word_list WHERE word = ?`).get(word)
  if (!row) throw new Error(`违禁词写入后回读失败：${word}`)
  return toCleanWordRow(row as CleanWordDbRow)
}

/**
 * 批量导入（**同一事务**）：返回 `{ inserted, updated, skipped }`。
 *
 * - `word` 去首尾空白，空串计入 `skipped`；
 * - 库中已有同词 → 只更新类别 / 替代词，**保留原有 `enabled`**（用户已禁用的词
 *   不会因词库更新被重新启用），计入 `updated`；批内重复词同理（首条 inserted，
 *   后续按 updated 计）；
 * - 新插入的词默认 `enabled = 1`，追加到词表末尾（`sort_order = MAX + 1`），
 *   `source` 取入参。
 */
export function importCleanWords(
  words: CleanWordImportInput[],
  source: CleanWordSource
): CleanWordImportResult {
  const db = getDb()
  const probe = db.prepare('SELECT id FROM clean_word_list WHERE word = ?')
  const insert = db.prepare(
    `INSERT INTO clean_word_list (word, category, source, replacement, enabled, sort_order)
     VALUES (?, ?, ?, ?, 1, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM clean_word_list))`
  )
  const update = db.prepare(
    `UPDATE clean_word_list
     SET category = ?, replacement = ?, updated_at = datetime('now')
     WHERE id = ?`
  )

  return db.transaction((): CleanWordImportResult => {
    const result: CleanWordImportResult = { inserted: 0, updated: 0, skipped: 0 }
    for (const entry of words) {
      const word = entry.word.trim()
      if (word === '') {
        result.skipped += 1
        continue
      }
      const replacement = entry.replacement ?? ''
      const existing = probe.get(word) as { id: number } | undefined
      if (existing) {
        update.run(entry.category, replacement, existing.id)
        result.updated += 1
      } else {
        insert.run(word, entry.category, source, replacement)
        result.inserted += 1
      }
    }
    return result
  })()
}

/** 切换单条启用状态，返回是否命中记录。 */
export function setCleanWordEnabled(id: number, enabled: boolean): boolean {
  const result = getDb()
    .prepare("UPDATE clean_word_list SET enabled = ?, updated_at = datetime('now') WHERE id = ?")
    .run(enabled ? 1 : 0, id)
  return Number(result.changes) > 0
}

/**
 * 删除单条（**仅 `source = 'user'`**；`builtin` 只能禁用不能删），返回是否真的删除。
 *
 * 理由：内置词库随版本更新导入，删除后的内置词会在下次更新被重新写回；
 * 统一走 `enabled = 0` 才能表达「用户明确不想要这个词」且可持久。
 */
export function deleteCleanWord(id: number): boolean {
  const result = getDb()
    .prepare("DELETE FROM clean_word_list WHERE id = ? AND source = 'user'")
    .run(id)
  return Number(result.changes) > 0
}

/** 清空指定来源的全部词条（内置词库更新前先清），返回删除行数。 */
export function clearCleanWordsBySource(source: CleanWordSource): number {
  const result = getDb().prepare('DELETE FROM clean_word_list WHERE source = ?').run(source)
  return Number(result.changes)
}

/** 统计各来源 / 类别的词条数（供设置页展示），按来源、类别升序。 */
export function countCleanWords(): CleanWordCount[] {
  const rows = getDb()
    .prepare(
      `SELECT source, category, COUNT(*) AS count FROM clean_word_list
       GROUP BY source, category ORDER BY source, category`
    )
    .all() as Array<{ source: string; category: string; count: number }>
  return rows.map((row) => ({
    source: toSource(row.source),
    category: toCategory(row.category),
    count: row.count
  }))
}

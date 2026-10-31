import { getDb } from './index'
import type { WorldAliasRow, WorldTagRow } from './worldEntityTypes'

/**
 * 统一设定库 · 通用附属数据（别名 / 长文本 / 标签）。
 *
 * 三类附属均为「按实体整体替换」语义：先清后插（标签为重建关联），并统一
 * `touch()` 刷新主行版本签名。写操作须由调用方放在事务内（本文件函数自身不开启事务，
 * 便于与主行字段更新合并为一次提交）；公开入口 `setWorldAliases` / `setWorldTags` /
 * `saveWorldText` 会自行包事务。
 */

/** 时间戳：毫秒精度，与主表口径一致。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** 去空串并去重（保持首次出现顺序）。 */
export function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed === '' || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

/** 刷新主行版本签名（`updated_at` + `revision+1`）；软删行不动。 */
export function touchWorldEntity(entityId: number): void {
  getDb()
    .prepare(
      `UPDATE world_entities SET updated_at = ${NOW}, revision = revision + 1
       WHERE id = ? AND deleted_at IS NULL`
    )
    .run(entityId)
}

/** 实体是否存在且未软删。 */
function isLiveEntity(entityId: number): boolean {
  return Boolean(
    getDb()
      .prepare('SELECT 1 FROM world_entities WHERE id = ? AND deleted_at IS NULL')
      .get(entityId)
  )
}

/** 读取实体标签名（按名称升序）。 */
export function listEntityTags(entityId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT t.name FROM world_entity_tags et JOIN world_tags t ON t.id = et.tag_id
       WHERE et.entity_id = ? ORDER BY t.name`
    )
    .all(entityId) as Array<{ name: string }>
  return rows.map((row) => row.name)
}

/** 实体正文内容（纯文本摘要 + 富文本 JSON；无行时均为空串）。 */
export interface WorldTextContent {
  body: string
  bodyJson: string
}

/** 读取实体正文；无行返回两个空串。 */
export function getWorldText(entityId: number): WorldTextContent {
  const row = getDb()
    .prepare('SELECT body, body_json AS bodyJson FROM world_texts WHERE entity_id = ?')
    .get(entityId) as { body: string; bodyJson: string } | undefined
  return { body: row?.body ?? '', bodyJson: row?.bodyJson ?? '' }
}

/**
 * 写入实体正文（upsert，供 create / update 在事务内调用；不做存在性校验）。
 *
 * 两列**整体替换**：`body` 为派生纯文本摘要，`bodyJson` 为整条富文本 JSON；
 * 未提供的列按空串落库（调用方应成对传入，避免摘要与 JSON 不同步）。
 */
export function writeWorldText(entityId: number, body: string, bodyJson = ''): void {
  getDb()
    .prepare(
      `INSERT INTO world_texts (entity_id, body, body_json) VALUES (?, ?, ?)
       ON CONFLICT(entity_id) DO UPDATE SET body = excluded.body, body_json = excluded.body_json`
    )
    .run(entityId, body, bodyJson)
}

/** 写入实体正文；实体不存在 / 已软删返回 false。 */
export function saveWorldText(entityId: number, body: string, bodyJson = ''): boolean {
  if (!isLiveEntity(entityId)) return false
  const db = getDb()
  db.transaction(() => {
    writeWorldText(entityId, body, bodyJson)
    touchWorldEntity(entityId)
  })()
  return true
}

/** 替换实体别名集合（先清后插；不做存在性校验，供事务内调用）。 */
export function replaceWorldAliases(entityId: number, aliases: readonly string[]): void {
  const db = getDb()
  db.prepare('DELETE FROM world_aliases WHERE entity_id = ?').run(entityId)
  const insert = db.prepare(
    'INSERT INTO world_aliases (entity_id, alias, sort_order) VALUES (?, ?, ?)'
  )
  dedupeStrings(aliases).forEach((alias, index) => insert.run(entityId, alias, index))
}

/** 读取实体别名列表（按 sort_order, id）。 */
export function listWorldAliases(entityId: number): WorldAliasRow[] {
  return getDb()
    .prepare(
      `SELECT id, entity_id AS entityId, alias, kind, sort_order AS sortOrder
       FROM world_aliases WHERE entity_id = ? ORDER BY sort_order, id`
    )
    .all(entityId) as WorldAliasRow[]
}

/** 整体替换实体别名；实体不存在 / 已软删返回 false。 */
export function setWorldAliases(entityId: number, aliases: readonly string[]): boolean {
  if (!isLiveEntity(entityId)) return false
  const db = getDb()
  db.transaction(() => {
    replaceWorldAliases(entityId, aliases)
    touchWorldEntity(entityId)
  })()
  return true
}

/** 替换实体标签集合：upsert 书内标签字典，再重建实体 ↔ 标签关联（供事务内调用）。 */
export function replaceWorldTags(entityId: number, names: readonly string[]): void {
  const db = getDb()
  const source = db
    .prepare('SELECT book_id AS bookId FROM world_entities WHERE id = ?')
    .get(entityId) as { bookId: string } | undefined
  if (!source) return
  db.prepare('DELETE FROM world_entity_tags WHERE entity_id = ?').run(entityId)
  const upsert = db.prepare(
    `INSERT INTO world_tags (book_id, name) VALUES (?, ?)
     ON CONFLICT(book_id, name) DO NOTHING`
  )
  const select = db.prepare('SELECT id FROM world_tags WHERE book_id = ? AND name = ?')
  const link = db.prepare(
    'INSERT OR IGNORE INTO world_entity_tags (entity_id, tag_id) VALUES (?, ?)'
  )
  for (const name of dedupeStrings(names)) {
    upsert.run(source.bookId, name)
    const tag = select.get(source.bookId, name) as { id: number }
    link.run(entityId, tag.id)
  }
}

/** 列出某书标签字典（含引用次数，按名称升序）。 */
export function listWorldTags(bookId: string): WorldTagRow[] {
  return getDb()
    .prepare(
      `SELECT t.id, t.book_id AS bookId, t.name, COUNT(et.entity_id) AS usageCount
       FROM world_tags t LEFT JOIN world_entity_tags et ON et.tag_id = t.id
       WHERE t.book_id = ? GROUP BY t.id ORDER BY t.name`
    )
    .all(bookId) as WorldTagRow[]
}

/** 整体替换实体标签；实体不存在 / 已软删返回 null，否则返回写入后的标签名。 */
export function setWorldTags(entityId: number, names: readonly string[]): string[] | null {
  if (!isLiveEntity(entityId)) return null
  const db = getDb()
  db.transaction(() => {
    replaceWorldTags(entityId, names)
    touchWorldEntity(entityId)
  })()
  return listEntityTags(entityId)
}

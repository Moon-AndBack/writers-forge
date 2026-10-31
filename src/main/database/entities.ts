import Database from 'better-sqlite3'
import { getDb } from './index'
import { WORLD_ENTITY_TYPES } from './worldEntityTypes'
import type { WorldEntityType } from './worldEntityTypes'

/** 旧实体表类型枚举，对应「人物 / 地名 / 武器 / 功法」（仅旧表 CRUD 使用）。 */
export type EntityType = 'character' | 'place' | 'weapon' | 'art'

/** 实体类型可选值，供 IPC 层入参校验。 */
export const ENTITY_TYPES: readonly EntityType[] = ['character', 'place', 'weapon', 'art']

/** 实体列表行：不含别名 / 关系。 */
export interface EntityRow {
  id: number
  bookId: string
  name: string
  type: EntityType
  description: string
  createdAt: string
  updatedAt: string
}

/** 关系行：附带目标实体名，便于详情展示。 */
export interface EntityRelationRow {
  id: number
  entityId: number
  targetId: number
  relation: string
  /** 目标实体名（由 entity_relations JOIN entities 得出）。 */
  targetName: string
  /** 目标实体类型。 */
  targetType: EntityType
}

/** 实体详情：基础行 + 别名 + 关系。 */
export interface EntityDetail extends EntityRow {
  aliases: string[]
  relations: EntityRelationRow[]
}

/** 关系写入入参：源实体由调用上下文决定。 */
export interface EntityRelationInput {
  targetId: number
  relation: string
}

/** 创建实体入参。 */
export interface CreateEntityInput {
  bookId: string
  name: string
  type: EntityType
  description?: string
  aliases?: string[]
  relations?: EntityRelationInput[]
}

/** 更新实体补丁：字段缺省则保持不变；提供 aliases / relations 则整体替换。 */
export interface UpdateEntityPatch {
  name?: string
  type?: EntityType
  description?: string
  aliases?: string[]
  relations?: EntityRelationInput[]
}

/**
 * 匹配入口：一个实体可贡献多条词（name + 别名），同词可被多个实体共用。
 * 数据源为统一设定库主表 `world_entities`，`type` 即 `entity_type` 四大类。
 */
export interface MatchEntry {
  entityId: number
  term: string
  type: WorldEntityType
  /**
   * 子类分类外键（`world_entities.subtype_id`）；`null` = 未分类。
   * 保留字段：下游仍携带，但不再参与配色——胶囊颜色由下方的 `presetKey` 决定。
   */
  subtypeId: number | null
  /**
   * 子类预设路由键（`world_subtypes.preset_key`）；空串 = 自定义分类或未分类。
   * 供胶囊按 23 个预设子类各取独立颜色（自定义分类回落模块色）。
   */
  presetKey: string
}

const SELECT_COLUMNS =
  'id, book_id AS bookId, name, type, description, created_at AS createdAt, updated_at AS updatedAt'

interface EntityDbRow {
  id: number
  bookId: string
  name: string
  type: string
  description: string
  createdAt: string
  updatedAt: string
}

/** 数据库行 → 领域对象（type 收敛为枚举，非法回退 character）。 */
function toEntity(row: EntityDbRow): EntityRow {
  return {
    id: row.id,
    bookId: row.bookId,
    name: row.name,
    type: ENTITY_TYPES.includes(row.type as EntityType) ? (row.type as EntityType) : 'character',
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/** 时间戳：毫秒精度，保证同秒连续编辑可区分，并对齐 books 表写法。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** 读取别名列表（按 id 升序，稳定输出）。 */
function listAliases(entityId: number): string[] {
  const rows = getDb()
    .prepare('SELECT alias FROM entity_aliases WHERE entity_id = ? ORDER BY id')
    .all(entityId) as Array<{ alias: string }>
  return rows.map((row) => row.alias)
}

/** 读取关系列表（附带目标实体名 / 类型）。 */
function listRelations(entityId: number): EntityRelationRow[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.entity_id AS entityId, r.target_id AS targetId, r.relation,
              e.name AS targetName, e.type AS targetType
       FROM entity_relations r JOIN entities e ON e.id = r.target_id
       WHERE r.entity_id = ? ORDER BY r.id`
    )
    .all(entityId) as Array<{
    id: number
    entityId: number
    targetId: number
    relation: string
    targetName: string
    targetType: string
  }>
  return rows.map((row) => ({
    id: row.id,
    entityId: row.entityId,
    targetId: row.targetId,
    relation: row.relation,
    targetName: row.targetName,
    targetType: ENTITY_TYPES.includes(row.targetType as EntityType)
      ? (row.targetType as EntityType)
      : 'character'
  }))
}

/** 列出某书全部实体（按 id 升序）。 */
export function listEntities(bookId: string): EntityRow[] {
  const statement: Database.Statement<[string], EntityDbRow> = getDb().prepare(
    `SELECT ${SELECT_COLUMNS} FROM entities WHERE book_id = ? ORDER BY id`
  )
  return statement.all(bookId).map(toEntity)
}

/** 读取实体详情（含别名与关系），不存在返回 null。 */
export function getEntity(id: number): EntityDetail | null {
  const row = getDb().prepare(`SELECT ${SELECT_COLUMNS} FROM entities WHERE id = ?`).get(id) as
    EntityDbRow | undefined
  if (!row) return null
  return { ...toEntity(row), aliases: listAliases(id), relations: listRelations(id) }
}

/** 替换实体的别名集合（先清后插）。 */
function replaceAliases(entityId: number, aliases: readonly string[]): void {
  const db = getDb()
  db.prepare('DELETE FROM entity_aliases WHERE entity_id = ?').run(entityId)
  const insert = db.prepare('INSERT INTO entity_aliases (entity_id, alias) VALUES (?, ?)')
  for (const alias of dedupeStrings(aliases)) insert.run(entityId, alias)
}

/** 替换实体的出边关系集合（先清后插）。 */
function replaceRelations(entityId: number, relations: readonly EntityRelationInput[]): void {
  const db = getDb()
  db.prepare('DELETE FROM entity_relations WHERE entity_id = ?').run(entityId)
  const insert = db.prepare(
    'INSERT INTO entity_relations (entity_id, target_id, relation) VALUES (?, ?, ?)'
  )
  const seen = new Set<string>()
  for (const relation of relations) {
    const key = `${relation.targetId}\u0000${relation.relation}`
    if (seen.has(key)) continue
    seen.add(key)
    insert.run(entityId, relation.targetId, relation.relation)
  }
}

/** 去空串并去重（保持首次出现顺序）。 */
function dedupeStrings(values: readonly string[]): string[] {
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

/** 创建实体（含别名 / 关系），返回详情。 */
export function createEntity(input: CreateEntityInput): EntityDetail {
  const db = getDb()
  const createdId = db.transaction((): number => {
    const result = db
      .prepare(
        `INSERT INTO entities (book_id, name, type, description) VALUES (@bookId, @name, @type, @description)`
      )
      .run({
        bookId: input.bookId,
        name: input.name,
        type: input.type,
        description: input.description ?? ''
      })
    const id = Number(result.lastInsertRowid)
    if (input.aliases) replaceAliases(id, input.aliases)
    if (input.relations) replaceRelations(id, input.relations)
    return id
  })()

  const created = getEntity(createdId)
  if (!created) throw new Error('Failed to read back created entity')
  return created
}

/** 更新实体：仅更新补丁中出现的字段，并刷新 updatedAt；不存在返回 null。 */
export function updateEntity(id: number, patch: UpdateEntityPatch): EntityDetail | null {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM entities WHERE id = ?').get(id)
  if (!existing) return null

  db.transaction(() => {
    const sets: string[] = []
    const params: Record<string, unknown> = { id }
    if (patch.name !== undefined) {
      sets.push('name = @name')
      params.name = patch.name
    }
    if (patch.type !== undefined) {
      sets.push('type = @type')
      params.type = patch.type
    }
    if (patch.description !== undefined) {
      sets.push('description = @description')
      params.description = patch.description
    }
    // 只要补丁非空就刷新 updated_at：即使仅改别名 / 关系（数量可能不变），
    // 也要改变实体版本签名，确保匹配器缓存能失效重建。
    sets.push(`updated_at = ${NOW}`)
    db.prepare(`UPDATE entities SET ${sets.join(', ')} WHERE id = @id`).run(params)

    if (patch.aliases !== undefined) replaceAliases(id, patch.aliases)
    if (patch.relations !== undefined) replaceRelations(id, patch.relations)
  })()

  return getEntity(id)
}

/** 删除实体，返回是否命中；别名 / 关系由外键级联删除。 */
export function deleteEntity(id: number): boolean {
  const result = getDb().prepare('DELETE FROM entities WHERE id = ?').run(id)
  return Number(result.changes) > 0
}

/**
 * 构建匹配词表：统一设定库主表中每个未软删实体贡献其 name 与全部别名各一条。
 *
 * 匹配链路的数据源为 `world_entities` + `world_aliases`（旧 `entities` /
 * `entity_aliases` 表仅保留给旧 CRUD，不再参与正文匹配）。
 */
export function listMatchEntries(bookId: string): MatchEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT e.id AS entityId, e.entity_type AS type, e.subtype_id AS subtypeId,
              COALESCE(st.preset_key, '') AS presetKey, e.name AS term
       FROM world_entities e
       LEFT JOIN world_subtypes st ON st.id = e.subtype_id
       WHERE e.book_id = ? AND e.deleted_at IS NULL
       UNION ALL
       SELECT e.id AS entityId, e.entity_type AS type, e.subtype_id AS subtypeId,
              COALESCE(st.preset_key, '') AS presetKey, a.alias AS term
       FROM world_aliases a JOIN world_entities e ON e.id = a.entity_id
       LEFT JOIN world_subtypes st ON st.id = e.subtype_id
       WHERE e.book_id = ? AND e.deleted_at IS NULL`
    )
    .all(bookId, bookId) as Array<{
    entityId: number
    type: string
    term: string
    subtypeId: number | null
    presetKey: string
  }>

  return rows
    .filter(
      (row) => row.term.trim() !== '' && WORLD_ENTITY_TYPES.includes(row.type as WorldEntityType)
    )
    .map((row) => ({
      entityId: row.entityId,
      term: row.term,
      type: row.type as WorldEntityType,
      // 分类外键原样透传（别名分支同样取 e.subtype_id，与实体名分支一致）；未分类为 null。
      subtypeId: row.subtypeId,
      // 预设路由键同样按实体所属子类透传；自定义分类 / 未分类为空串。
      presetKey: row.presetKey
    }))
}

/**
 * 书籍实体数据版本号：统一设定库的实体数 / 最大更新时间 / 别名数聚合签名。
 * 任一实体改名、别名替换、软删都会改变签名（写操作统一刷新 `updated_at`），
 * 供匹配器与渲染层段落匹配缓存失效判定。
 */
export function getEntityRevision(bookId: string): string {
  const row = getDb()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM world_entities
            WHERE book_id = @bookId AND deleted_at IS NULL) AS entityCount,
         (SELECT COALESCE(MAX(updated_at), '') FROM world_entities
            WHERE book_id = @bookId AND deleted_at IS NULL) AS maxUpdated,
         (SELECT COUNT(*) FROM world_aliases a JOIN world_entities e ON e.id = a.entity_id
            WHERE e.book_id = @bookId AND e.deleted_at IS NULL) AS aliasCount`
    )
    .get({ bookId }) as {
    entityCount: number
    maxUpdated: string
    aliasCount: number
  }
  return `${row.entityCount}:${row.maxUpdated}:${row.aliasCount}`
}

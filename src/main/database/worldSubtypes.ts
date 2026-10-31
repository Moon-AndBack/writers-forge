import { getDb } from './index'
import { WORLD_ENTITY_TYPES } from './worldEntityTypes'
import type { WorldEntitySubtypeRef, WorldEntityType } from './worldEntityTypes'

/**
 * 统一设定库 · 子类分类表数据访问（`world_subtypes`）。
 *
 * 结构真源见 `schema/worldSubtypes.ts`。约定：
 * - 读 / 写默认过滤 `deleted_at IS NULL`；删除为软删（仅置 `deleted_at`）；
 * - 第 4 批起本表是**子类唯一真源**：`world_entities.subtype_id` 外键指向本表，
 *   展示名（`name`）与预设路由键（`preset_key`）均经本表取得；主表已无文本子类列；
 * - 预设子类名称直接存中文原文（数据常量、不译，与 `dossierTree.ts` 的展示顺序常量一致）；
 * - `ensurePresetSubtypes` 为 `INSERT OR IGNORE` 语义，按 `(book_id, entity_type, name)`
 *   去重，重复调用不产生新行、也不复活已软删的预设行。
 */

/** 子类分类行（`deleted_at` 非 null 表示已软删，读接口不返回）。 */
export interface WorldSubtypeRow {
  id: number
  bookId: string
  entityType: WorldEntityType
  name: string
  /** 0 = 预设子类，1 = 用户自定义。 */
  isCustom: number
  /** 预设子类指向具体预设表的路由键；自定义为空串。 */
  presetKey: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * 解析实体子类引用（第 4 批唯一入口）：校验分类存在、未软删、且归属本书 / 本类型。
 *
 * - `subtypeId = null` → `null`（分类为必填，未分类不再视为合法写入状态）；
 * - 分类存在且归属一致 → 返回其 `preset_key`；
 * - 分类不存在 / 已软删 / `book_id` 或 `entity_type` 不匹配 → `null`（调用方按非法处理）。
 *
 * 读取历史 `subtype_id = NULL` 数据不经过本函数（主表读接口直接回显空子类名）。
 */
export function resolveEntitySubtype(
  bookId: string,
  entityType: WorldEntityType,
  subtypeId: number | null
): WorldEntitySubtypeRef | null {
  if (subtypeId === null) return null
  const row = getDb()
    .prepare(
      `SELECT preset_key AS presetKey FROM world_subtypes
       WHERE id = ? AND book_id = ? AND entity_type = ? AND deleted_at IS NULL`
    )
    .get(subtypeId, bookId, entityType) as { presetKey: string } | undefined
  if (!row) return null
  return { subtypeId, presetKey: row.presetKey }
}

/** 创建子类入参。 */
export interface CreateWorldSubtypeInput {
  bookId: string
  entityType: WorldEntityType
  name: string
  /** 0 = 预设，1 = 自定义（与库内列同口径）。 */
  isCustom: number
  presetKey?: string
  sortOrder?: number
}

/** 更新子类补丁：仅支持名称 / 排序 / 路由键。 */
export interface UpdateWorldSubtypePatch {
  name?: string
  sortOrder?: number
  presetKey?: string
}

/** 预设子类定义（名称 / 路由键 / 模块内排序）。 */
export interface PresetWorldSubtype {
  entityType: WorldEntityType
  name: string
  presetKey: string
  sortOrder: number
}

/**
 * 23 条预设子类（五类：世界观 6 / 物品 6 / 势力 6 / 角色 4 / 境界体系 1）。
 *
 * 名称为数据常量（不译），`sortOrder` 在各模块内独立从 0 递增。
 * 角色自本批起拆分为 主角 / 配角 / 龙套 / 反派 四类，`preset_key` 统一用
 * `character-` 前缀；原有单条「角色」（`preset_key = 'character'`）由一次性迁移
 * `worldSubtypeCharacterSplit.ts` 下线并重映射实体。
 */
export const PRESET_WORLD_SUBTYPES: readonly PresetWorldSubtype[] = [
  { entityType: 'worldview', name: '世界概况', presetKey: 'overview', sortOrder: 0 },
  { entityType: 'worldview', name: '地理环境', presetKey: 'geography', sortOrder: 1 },
  { entityType: 'worldview', name: '文化背景', presetKey: 'culture', sortOrder: 2 },
  { entityType: 'worldview', name: '种族生物', presetKey: 'race', sortOrder: 3 },
  { entityType: 'worldview', name: '经济体系', presetKey: 'economy', sortOrder: 4 },
  { entityType: 'worldview', name: '世界规则', presetKey: 'ruleset', sortOrder: 5 },
  { entityType: 'item', name: '武器', presetKey: 'weapon', sortOrder: 0 },
  { entityType: 'item', name: '功法', presetKey: 'skill', sortOrder: 1 },
  { entityType: 'item', name: '丹药', presetKey: 'pill', sortOrder: 2 },
  { entityType: 'item', name: '天赋', presetKey: 'talent', sortOrder: 3 },
  { entityType: 'item', name: '装备', presetKey: 'equipment', sortOrder: 4 },
  { entityType: 'item', name: '材料', presetKey: 'material', sortOrder: 5 },
  { entityType: 'faction', name: '宗门', presetKey: 'sect', sortOrder: 0 },
  { entityType: 'faction', name: '家族', presetKey: 'family', sortOrder: 1 },
  { entityType: 'faction', name: '王朝', presetKey: 'dynasty', sortOrder: 2 },
  { entityType: 'faction', name: '商会', presetKey: 'guild', sortOrder: 3 },
  { entityType: 'faction', name: '散修联盟', presetKey: 'alliance', sortOrder: 4 },
  { entityType: 'faction', name: '魔教', presetKey: 'demonic', sortOrder: 5 },
  { entityType: 'character', name: '主角', presetKey: 'character-lead', sortOrder: 0 },
  { entityType: 'character', name: '配角', presetKey: 'character-support', sortOrder: 1 },
  { entityType: 'character', name: '龙套', presetKey: 'character-extra', sortOrder: 2 },
  { entityType: 'character', name: '反派', presetKey: 'character-villain', sortOrder: 3 },
  { entityType: 'power_system', name: '境界体系', presetKey: 'power_system', sortOrder: 0 }
]

/** 不显示分类选择器的模块 → 默认预设分类路由键（写入缺失分类时自动补）。 */
const DEFAULT_SUBTYPE_PRESET_KEYS: Readonly<Partial<Record<WorldEntityType, string>>> = {
  power_system: 'power_system'
}

/**
 * 解析某书某实体类型的默认预设分类 id（仅境界体系；其他类型返回 null）。
 *
 * 不显示分类选择器的模块在创建 / 更新时必须以默认预设分类落库；预设缺失（老库 /
 * 预设被软删）先幂等补播一次，仍缺失返回 null（调用方按非法处理）。
 */
export function resolveDefaultSubtypeId(
  bookId: string,
  entityType: WorldEntityType
): number | null {
  const presetKey = DEFAULT_SUBTYPE_PRESET_KEYS[entityType]
  if (presetKey === undefined) return null
  const find = (): number | null => {
    const row = getDb()
      .prepare(
        `SELECT id FROM world_subtypes
         WHERE book_id = ? AND entity_type = ? AND preset_key = ? AND is_custom = 0
           AND deleted_at IS NULL
         ORDER BY id LIMIT 1`
      )
      .get(bookId, entityType, presetKey) as { id: number } | undefined
    return row?.id ?? null
  }
  const found = find()
  if (found !== null) return found
  ensurePresetSubtypes(bookId)
  return find()
}

const SELECT_COLUMNS = `id, book_id AS bookId, entity_type AS entityType, name,
  is_custom AS isCustom, preset_key AS presetKey, sort_order AS sortOrder,
  created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt`

/** 时间戳：毫秒精度，对齐统一设定库主表写法。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

interface WorldSubtypeDbRow {
  id: number
  bookId: string
  entityType: string
  name: string
  isCustom: number
  presetKey: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 数据库行 → 领域行（枚举非法值回退 worldview，避免脏数据击穿类型）。 */
function toSubtypeRow(row: WorldSubtypeDbRow): WorldSubtypeRow {
  return {
    id: row.id,
    bookId: row.bookId,
    entityType: WORLD_ENTITY_TYPES.includes(row.entityType as WorldEntityType)
      ? (row.entityType as WorldEntityType)
      : 'worldview',
    name: row.name,
    isCustom: row.isCustom,
    presetKey: row.presetKey,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt
  }
}

/** 列出某书未删除子类，可选按实体类型过滤；排序 `sort_order, id`。 */
export function listWorldSubtypes(
  bookId: string,
  entityType?: WorldEntityType
): WorldSubtypeRow[] {
  const where = ['book_id = @bookId', 'deleted_at IS NULL']
  const params: Record<string, unknown> = { bookId }
  if (entityType !== undefined) {
    where.push('entity_type = @entityType')
    params.entityType = entityType
  }
  const rows = getDb()
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM world_subtypes
       WHERE ${where.join(' AND ')} ORDER BY sort_order, id`
    )
    .all(params) as WorldSubtypeDbRow[]
  return rows.map(toSubtypeRow)
}

/** 读取单个子类；不存在或已软删返回 null。 */
export function getWorldSubtype(id: number): WorldSubtypeRow | null {
  const row = getDb()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM world_subtypes WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as WorldSubtypeDbRow | undefined
  return row ? toSubtypeRow(row) : null
}

/**
 * 创建子类并回读。
 *
 * - 同书同类型**存在未软删**同名分类 → 触发唯一约束异常，由 IPC 层收敛为 null；
 * - 同名分类**已软删**（唯一键不区分软删）→ 直接复活该行（保留其 `is_custom` /
 *   `preset_key`，只更新排序），避免「删掉自定义分类后再也建不回同名分类」的死角。
 */
export function createWorldSubtype(input: CreateWorldSubtypeInput): WorldSubtypeRow {
  const db = getDb()
  const revived = db
    .prepare(
      `SELECT id FROM world_subtypes
       WHERE book_id = ? AND entity_type = ? AND name = ? AND deleted_at IS NOT NULL
       ORDER BY id LIMIT 1`
    )
    .get(input.bookId, input.entityType, input.name) as { id: number } | undefined
  if (revived) {
    db.prepare(
      `UPDATE world_subtypes
       SET deleted_at = NULL, sort_order = @sortOrder, updated_at = ${NOW}
       WHERE id = @id`
    ).run({ id: revived.id, sortOrder: input.sortOrder ?? 0 })
    const restored = getWorldSubtype(revived.id)
    if (!restored) throw new Error('Failed to read back restored world subtype')
    return restored
  }

  const result = db
    .prepare(
      `INSERT INTO world_subtypes
         (book_id, entity_type, name, is_custom, preset_key, sort_order)
       VALUES (@bookId, @entityType, @name, @isCustom, @presetKey, @sortOrder)`
    )
    .run({
      bookId: input.bookId,
      entityType: input.entityType,
      name: input.name,
      isCustom: input.isCustom,
      presetKey: input.presetKey ?? '',
      sortOrder: input.sortOrder ?? 0
    })
  const created = getWorldSubtype(Number(result.lastInsertRowid))
  if (!created) throw new Error('Failed to read back created world subtype')
  return created
}

/**
 * 按名称取分类 id；不存在则新建一条**自定义**分类（种子 / 迁移专用，幂等）。
 *
 * 与 `createWorldSubtype` 的区别：重名时不抛唯一约束异常，而是复用既有行
 * （含已软删的同名行 —— 唯一键不区分软删，老库可能存在），保证播种 / 回填不中断。
 */
export function ensureCustomSubtypeByName(
  bookId: string,
  entityType: WorldEntityType,
  name: string
): number {
  const db = getDb()
  const findActive = db
    .prepare(
      `SELECT id FROM world_subtypes
       WHERE book_id = ? AND entity_type = ? AND name = ? AND deleted_at IS NULL
       ORDER BY id LIMIT 1`
    )
    .get(bookId, entityType, name) as { id: number } | undefined
  if (findActive) return findActive.id

  const nextSort = db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
       FROM world_subtypes WHERE book_id = ? AND entity_type = ?`
    )
    .get(bookId, entityType) as { next: number }
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO world_subtypes
         (book_id, entity_type, name, is_custom, preset_key, sort_order)
       VALUES (?, ?, ?, 1, '', ?)`
    )
    .run(bookId, entityType, name, nextSort.next)
  if (Number(result.changes) > 0) return Number(result.lastInsertRowid)

  // 唯一键冲突：同名行已存在（可能已软删），复用其 id。
  const existing = db
    .prepare(
      `SELECT id FROM world_subtypes
       WHERE book_id = ? AND entity_type = ? AND name = ?
       ORDER BY id LIMIT 1`
    )
    .get(bookId, entityType, name) as { id: number } | undefined
  if (!existing) throw new Error('Failed to resolve or create world subtype')
  return existing.id
}

/** 更新子类（名称 / 排序 / 路由键）；不存在 / 已软删 / 空补丁返回 null。 */
export function updateWorldSubtype(
  id: number,
  patch: UpdateWorldSubtypePatch
): WorldSubtypeRow | null {
  const sets: string[] = []
  const params: Record<string, unknown> = { id }
  if (patch.name !== undefined) {
    sets.push('name = @name')
    params.name = patch.name
  }
  if (patch.sortOrder !== undefined) {
    sets.push('sort_order = @sortOrder')
    params.sortOrder = patch.sortOrder
  }
  if (patch.presetKey !== undefined) {
    sets.push('preset_key = @presetKey')
    params.presetKey = patch.presetKey
  }
  if (sets.length === 0) return getWorldSubtype(id)
  sets.push(`updated_at = ${NOW}`)
  const result = getDb()
    .prepare(`UPDATE world_subtypes SET ${sets.join(', ')} WHERE id = @id AND deleted_at IS NULL`)
    .run(params)
  return Number(result.changes) > 0 ? getWorldSubtype(id) : null
}

/**
 * 软删除子类（置 `deleted_at`）并解除其下实体的子类归属；命中返回 true。
 *
 * 同一事务内把 `world_entities.subtype_id` 置空（归为「未分类」），避免实体继续指向
 * 已删分类：删除即终态，不做还原，故无需保留归属。属被动归属清理，不改动实体
 * `updated_at` / `revision`（非内容变更，且读路径重新 JOIN 取分类，无缓存失效需求）。
 */
export function deleteWorldSubtype(id: number): boolean {
  const db = getDb()
  const markDeleted = db.prepare(
    `UPDATE world_subtypes SET deleted_at = ${NOW}, updated_at = ${NOW}
     WHERE id = ? AND deleted_at IS NULL`
  )
  const detachEntities = db.prepare(
    'UPDATE world_entities SET subtype_id = NULL WHERE subtype_id = ?'
  )
  return db.transaction((): boolean => {
    const result = markDeleted.run(id)
    if (Number(result.changes) === 0) return false
    detachEntities.run(id)
    return true
  })()
}

/**
 * 幂等写入某书的 23 条预设子类（`INSERT OR IGNORE` 按书 + 类型 + 名称去重）。
 * 返回是否新建了至少一行；书不存在返回 false（不外键报错）。
 */
export function ensurePresetSubtypes(bookId: string): boolean {
  const db = getDb()
  const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId)
  if (!book) return false
  const insert = db.prepare(
    `INSERT OR IGNORE INTO world_subtypes
       (book_id, entity_type, name, is_custom, preset_key, sort_order)
     VALUES (@bookId, @entityType, @name, 0, @presetKey, @sortOrder)`
  )
  return db.transaction((): boolean => {
    let created = 0
    for (const preset of PRESET_WORLD_SUBTYPES) {
      const result = insert.run({
        bookId,
        entityType: preset.entityType,
        name: preset.name,
        presetKey: preset.presetKey,
        sortOrder: preset.sortOrder
      })
      created += Number(result.changes)
    }
    return created > 0
  })()
}

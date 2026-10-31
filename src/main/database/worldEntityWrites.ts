import { randomUUID } from 'node:crypto'
import { getDb } from './index'
import { resolveEntitySubtype } from './worldSubtypes'
import { replaceWorldAliases, replaceWorldTags, writeWorldText } from './worldEntityMeta'
import type {
  CreateWorldEntityInput,
  UpdateWorldEntityPatch,
  WorldCustomFieldInput,
  WorldEntityDetail,
  WorldEntitySubtypeRef,
  WorldEntityType
} from './worldEntityTypes'
import { WORLDVIEW_SUBTYPE_FIELDS } from './worldEntityTypes'
import { applySubtypeFields, ensureSubtypeRows, migrateSubtypeRows } from './worldEntitySubtypeFields'
import { writeGradeRank } from './worldItemGradeRank'
import { writePowerSystemKind } from './worldPowerWrites'
import { NO_SUBTYPE, NOW, WV_SUBTYPE_TABLE } from './worldEntityShared'
import { getWorldEntity } from './worldEntityQueries'
import { deleteWorldRefsForEntity } from './worldRefs'

/**
 * 统一设定库 · 主表写路径（增 / 改 / 软删 + 子表字段）。
 *
 * 由 `worldEntities.ts` 再导出；结构真源见 `schema/worldEntities.ts`。
 * 约定：子表行由**数据库触发器**在插入主行时补建，本层只更新既有子行；类型不匹配时
 * `UPDATE` 命中 0 行，天然忽略；写操作均包事务，任何字段变更（含仅改别名 / 标签 / 正文）
 * 都刷新 `updated_at` + `revision+1`，供后续匹配 / 列表缓存按版本失效。
 */

/** 确保世界观预设子类专属子表行存在（INSERT OR IGNORE）。 */
function ensureWorldviewSubtable(entityId: number, presetKey: string): void {
  const table = WV_SUBTYPE_TABLE[presetKey]
  if (!table) return
  getDb().prepare(`INSERT OR IGNORE INTO ${table} (entity_id) VALUES (?)`).run(entityId)
}

/** 删除世界观预设子类专属子表行（子类迁移 / 类型切离时）。 */
function deleteWorldviewSubtable(entityId: number, presetKey: string): void {
  const table = WV_SUBTYPE_TABLE[presetKey]
  if (!table) return
  getDb().prepare(`DELETE FROM ${table} WHERE entity_id = ?`).run(entityId)
}

/** 写入世界观子类专属字段（仅允许该子类字段集；自动确保行存在）。 */
function applyWorldviewFields(
  entityId: number,
  presetKey: string,
  fields: Record<string, string>
): void {
  const table = WV_SUBTYPE_TABLE[presetKey]
  if (!table) return
  const allowed = WORLDVIEW_SUBTYPE_FIELDS[presetKey]
  if (!allowed) return
  const entries = Object.entries(fields).filter(
    ([key, value]) => allowed.includes(key) && typeof value === 'string'
  )
  ensureWorldviewSubtable(entityId, presetKey)
  if (entries.length === 0) return
  const sets = entries.map(([key]) => `${key} = ?`).join(', ')
  const values = entries.map(([, value]) => value)
  getDb()
    .prepare(`UPDATE ${table} SET ${sets} WHERE entity_id = ?`)
    .run(...values, entityId)
}

/**
 * 写入 / 覆盖子表专属字段（类型不匹配时 UPDATE 命中 0 行，自动忽略）。
 *
 * 批 L1：`kind` 已废弃，本函数不再读写该列（子类真源为 `subtypeId`）。
 * 第 3 批：`world_item` 已下线，物品 `grade` / `rank` 改由 `worldItemGradeRank.ts` 按
 * `preset_key` 写入 5 张预设子分类表（材料 / 自定义子类 / 未分类无品阶，静默忽略）。
 * 物品功法 / 势力子分类字段与 `world_custom` 交由 `worldEntitySubtypeFields.ts` 处理。
 * 境界体系 `powerKind` 经 `worldPowerWrites.writePowerSystemKind` 写入体系子表。
 */
function applyChildFields(
  entityType: string,
  entityId: number,
  subtype: WorldEntitySubtypeRef,
  fields: {
    role?: string
    grade?: string
    rank?: number
    worldviewFields?: Record<string, string>
    itemFields?: Record<string, string>
    factionFields?: Record<string, string>
    customFields?: WorldCustomFieldInput[]
    /** 境界体系类型（`world_power_system.kind`）；非 power_system 静默忽略。 */
    powerKind?: string
  }
): void {
  const db = getDb()
  if (fields.role !== undefined) {
    db.prepare('UPDATE world_character SET role = ? WHERE entity_id = ?').run(fields.role, entityId)
  }
  if (fields.powerKind !== undefined && entityType === 'power_system') {
    writePowerSystemKind(entityId, fields.powerKind)
  }
  if (fields.grade !== undefined || fields.rank !== undefined) {
    writeGradeRank(entityType, entityId, subtype.presetKey, {
      grade: fields.grade,
      rank: fields.rank
    })
  }
  if (WV_SUBTYPE_TABLE[subtype.presetKey]) {
    ensureWorldviewSubtable(entityId, subtype.presetKey)
  }
  if (fields.worldviewFields !== undefined && WV_SUBTYPE_TABLE[subtype.presetKey]) {
    applyWorldviewFields(entityId, subtype.presetKey, fields.worldviewFields)
  }
  // 物品功法 / 势力：预设子类写专属子表，自定义子类写 world_custom（互斥，见子模块注释）。
  if (subtype.subtypeId !== null) {
    applySubtypeFields(entityType, entityId, subtype, {
      itemFields: fields.itemFields,
      factionFields: fields.factionFields,
      customFields: fields.customFields
    })
  }
}

/** 创建实体（主行 + 子表字段 + 别名 / 标签 / 正文，同一事务），返回详情。 */
export function createWorldEntity(input: CreateWorldEntityInput): WorldEntityDetail {
  const db = getDb()
  // IPC 层已校验分类归属；此处再解析一次取 `preset_key`（非法按未分类兜底，不中断写入）。
  const subtype =
    resolveEntitySubtype(input.bookId, input.entityType, input.subtypeId ?? null) ?? NO_SUBTYPE
  const createdId = db.transaction((): number => {
    const result = db
      .prepare(
        `INSERT INTO world_entities
           (uuid, book_id, entity_type, subtype_id, name)
         VALUES (@uuid, @bookId, @entityType, @subtypeId, @name)`
      )
      .run({
        uuid: randomUUID(),
        bookId: input.bookId,
        entityType: input.entityType,
        subtypeId: subtype.subtypeId,
        name: input.name
      })
    const id = Number(result.lastInsertRowid)
    if (input.entityType === 'worldview' && WV_SUBTYPE_TABLE[subtype.presetKey]) {
      ensureWorldviewSubtable(id, subtype.presetKey)
    }
    // `input.kind` 已废弃：不再向下传递，仅保留类型兼容（种子仍传）。
    applyChildFields(input.entityType, id, subtype, {
      role: input.role,
      grade: input.grade,
      rank: input.rank,
      worldviewFields: input.worldviewFields,
      itemFields: input.itemFields,
      factionFields: input.factionFields,
      customFields: input.customFields
    })
    if (input.aliases) replaceWorldAliases(id, input.aliases)
    if (input.tags) replaceWorldTags(id, input.tags)
    if (input.body !== undefined || input.bodyJson !== undefined) {
      writeWorldText(id, input.body ?? '', input.bodyJson ?? '')
    }
    return id
  })()

  const created = getWorldEntity(createdId)
  if (!created) throw new Error('Failed to read back created world entity')
  return created
}

/** 读取实体当前子类引用（不存在 / 已软删返回 null）。 */
function readSubtypeRef(
  id: number
): { bookId: string; entityType: string; subtype: WorldEntitySubtypeRef } | null {
  const row = getDb()
    .prepare(
      `SELECT e.book_id AS bookId, e.entity_type AS entityType,
              e.subtype_id AS subtypeId, COALESCE(st.preset_key, '') AS presetKey
       FROM world_entities e LEFT JOIN world_subtypes st ON st.id = e.subtype_id
       WHERE e.id = ? AND e.deleted_at IS NULL`
    )
    .get(id) as
    | { bookId: string; entityType: string; subtypeId: number | null; presetKey: string }
    | undefined
  if (!row) return null
  return {
    bookId: row.bookId,
    entityType: row.entityType,
    subtype: { subtypeId: row.subtypeId, presetKey: row.presetKey }
  }
}

/** 更新实体：仅更新补丁中出现的字段，并刷新版本；不存在 / 已软删返回 null。 */
export function updateWorldEntity(
  id: number,
  patch: UpdateWorldEntityPatch
): WorldEntityDetail | null {
  const db = getDb()
  const existing = readSubtypeRef(id)
  if (!existing) return null

  const newSubtype: WorldEntitySubtypeRef =
    patch.subtypeId !== undefined
      ? (resolveEntitySubtype(
          existing.bookId,
          existing.entityType as WorldEntityType,
          patch.subtypeId
        ) ?? NO_SUBTYPE)
      : existing.subtype

  db.transaction(() => {
    const sets: string[] = []
    const params: Record<string, unknown> = { id }
    if (patch.subtypeId !== undefined) {
      sets.push('subtype_id = @subtypeId')
      params.subtypeId = newSubtype.subtypeId
    }

    // 子类迁移：分类变更时删旧子类行、建新子类行（世界观 / 物品功法 / 势力 / 自定义）。
    if (patch.subtypeId !== undefined && newSubtype.subtypeId !== existing.subtype.subtypeId) {
      if (existing.entityType === 'worldview') {
        deleteWorldviewSubtable(id, existing.subtype.presetKey)
        ensureWorldviewSubtable(id, newSubtype.presetKey)
      } else {
        migrateSubtypeRows(existing.entityType, id, existing.subtype, newSubtype)
      }
    }
    // 修复 / 保证当前子类专属子表行存在（老数据补齐）。
    if (existing.entityType === 'worldview') {
      ensureWorldviewSubtable(id, newSubtype.presetKey)
    } else {
      ensureSubtypeRows(existing.entityType, id, newSubtype)
    }
    if (patch.name !== undefined) {
      sets.push('name = @name')
      params.name = patch.name
    }
    // 任何补丁（含仅改别名 / 标签 / 正文）都刷新版本签名，供上层缓存失效。
    sets.push(`updated_at = ${NOW}`, 'revision = revision + 1')
    db.prepare(`UPDATE world_entities SET ${sets.join(', ')} WHERE id = @id`).run(params)

    // `patch.kind` 已废弃：不再向下传递（IPC 亦不再解析）。
    applyChildFields(existing.entityType, id, newSubtype, {
      role: patch.role,
      grade: patch.grade,
      rank: patch.rank,
      worldviewFields: patch.worldviewFields,
      itemFields: patch.itemFields,
      factionFields: patch.factionFields,
      customFields: patch.customFields,
      powerKind: patch.powerKind
    })
    if (patch.aliases !== undefined) replaceWorldAliases(id, patch.aliases)
    if (patch.tags !== undefined) replaceWorldTags(id, patch.tags)
    if (patch.body !== undefined || patch.bodyJson !== undefined) {
      writeWorldText(id, patch.body ?? '', patch.bodyJson ?? '')
    }
  })()

  return getWorldEntity(id)
}

/**
 * 软删除实体（置 `deleted_at`）并在同一事务内清理其全部关系行。
 *
 * 删除即终态（产品口径：实体不做回收站 / 不提供还原），因此关系行一并物理删除，
 * 避免在对端实体的关系列表里留下指向已删实体的悬空条目。
 * 其余子行（别名 / 标签 / 正文 / 子表字段 / 场景关联）随主行保留，
 * 由其自身的软删过滤保证不可见。
 *
 * 命中返回 true；实体已删或不存在返回 false（此时不触碰关系行）。
 */
export function deleteWorldEntity(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const result = db
      .prepare(
        `UPDATE world_entities
         SET deleted_at = ${NOW}, updated_at = ${NOW}, revision = revision + 1
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(id)
    if (Number(result.changes) === 0) return false
    deleteWorldRefsForEntity(id)
    return true
  })()
}

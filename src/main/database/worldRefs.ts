import { getDb } from './index'
import type {
  UpdateWorldRefPatch,
  WorldEntityRelationSummary,
  WorldEntityType,
  WorldRefInput,
  WorldRefRow,
  WorldSemanticCodeRow
} from './worldEntityTypes'

/**
 * 统一设定库 · 通用引用（`world_refs`）+ 语义码字典（`world_semantic_codes`）。
 *
 * 语义：任意两端实体 + 语义码 + 可选角色（补充说明）/ 序 / 有效期，`CHECK(from_id <> to_id)`。
 * 第 7 批起：
 * - 关系类型**必须**取自语义码字典（`semanticCode` 必填，写入前校验存在）；
 *   `role` 降级为补充说明，不再承载关系名；
 * - 出边（`listWorldRefs`）与**入边**（`listWorldRefsTo`）双向查询，均支持可选语义码筛选；
 * - `updateWorldRef` 支持改语义码 / 补充说明 / 备注 / 序 / 有效期。
 *
 * 第 8 批起字典收敛为「上级 / 下级 / 平级」三级 + 「属于」（`belongs_to`，
 * `worldSemanticCodes.ts`），旧语义码与存量关系由 `worldRefsHierarchyMigration.ts`
 * 一次性清空；读取侧仍保留 `semantic_code IS NULL` 的空码兜底（仅防御绕过写入路径的
 * 残留，界面按「自定义关系」展示）。
 *
 * 第 9 批起卡片关系摘要补入边（`to_id` 方向），见 `loadRelationSummaryMap`。
 *
 * 世界观（`entity_type = 'worldview'`）与其它四域一样可参与关联关系：
 * 数据层不对端点类型做限制，仅校验两端同书、未软删、非自指。
 */

const SELECT_REF = `SELECT r.id, r.book_id AS bookId, r.from_id AS fromId, f.name AS fromName,
         r.to_id AS toId, t.name AS toName, r.semantic_code AS semanticCode,
         COALESCE(sc.note, '') AS semanticNote,
         r.role, r.sort_order AS sortOrder, r.valid_from AS validFrom,
         r.valid_to AS validTo, r.note
  FROM world_refs r
  JOIN world_entities f ON f.id = r.from_id AND f.deleted_at IS NULL
  JOIN world_entities t ON t.id = r.to_id AND t.deleted_at IS NULL
  LEFT JOIN world_semantic_codes sc ON sc.code = r.semantic_code`

/** 按方向 + 可选语义码取边（`column` 只接受内部固定的两列名）。 */
function selectRefs(
  column: 'from_id' | 'to_id',
  entityId: number,
  semanticCode?: string
): WorldRefRow[] {
  const conditions = [`r.${column} = ?`]
  const params: Array<string | number> = [entityId]
  if (semanticCode !== undefined) {
    conditions.push('r.semantic_code = ?')
    params.push(semanticCode)
  }
  return getDb()
    .prepare(`${SELECT_REF} WHERE ${conditions.join(' AND ')} ORDER BY r.sort_order, r.id`)
    .all(...params) as WorldRefRow[]
}

/** 列出实体**出边**引用（按 sort_order, id）；可选按语义码筛选。 */
export function listWorldRefs(entityId: number, semanticCode?: string): WorldRefRow[] {
  return selectRefs('from_id', entityId, semanticCode)
}

/** 列出实体**入边**引用（按 sort_order, id）；可选按语义码筛选。 */
export function listWorldRefsTo(entityId: number, semanticCode?: string): WorldRefRow[] {
  return selectRefs('to_id', entityId, semanticCode)
}

/**
 * 批量取关系摘要（实体 id → 摘要[]，**出边在前、入边在后**，各自按 `sort_order, id`）。
 *
 * 两条 IN 查询补齐全页（出边按 `from_id`、入边按 `to_id`），避免逐卡 N+1；只投影卡片
 * 摘要所需字段 + 方向（不取备注，避免传输膨胀），并 JOIN `world_subtypes` 带出对端模块
 * 类型与子类，供渲染层直接上色。与 `worldEntities.ts` 的 `loadAliasMap` 同思路。
 * 入边让角色卡能看到「物品属于角色」这类反向引用。
 */
export function loadRelationSummaryMap(
  ids: readonly number[]
): Map<number, WorldEntityRelationSummary[]> {
  const result = new Map<number, WorldEntityRelationSummary[]>()
  if (ids.length === 0) return result
  const placeholders = ids.map(() => '?').join(', ')
  const db = getDb()
  const outRows = db
    .prepare(
      `SELECT r.from_id AS entityId, COALESCE(r.semantic_code, '') AS semanticCode,
              r.to_id AS peerId, t.name AS targetName,
              t.entity_type AS peerEntityType, t.subtype_id AS peerSubtypeId,
              COALESCE(st.name, '') AS peerSubType, COALESCE(st.preset_key, '') AS peerPresetKey
       FROM world_refs r
       JOIN world_entities t ON t.id = r.to_id
       LEFT JOIN world_subtypes st ON st.id = t.subtype_id
       WHERE r.from_id IN (${placeholders}) AND t.deleted_at IS NULL
       ORDER BY r.sort_order, r.id`
    )
    .all(...ids) as RelationSummaryRow[]
  const inRows = db
    .prepare(
      `SELECT r.to_id AS entityId, COALESCE(r.semantic_code, '') AS semanticCode,
              r.from_id AS peerId, f.name AS targetName,
              f.entity_type AS peerEntityType, f.subtype_id AS peerSubtypeId,
              COALESCE(st.name, '') AS peerSubType, COALESCE(st.preset_key, '') AS peerPresetKey
       FROM world_refs r
       JOIN world_entities f ON f.id = r.from_id
       LEFT JOIN world_subtypes st ON st.id = f.subtype_id
       WHERE r.to_id IN (${placeholders}) AND f.deleted_at IS NULL
       ORDER BY r.sort_order, r.id`
    )
    .all(...ids) as RelationSummaryRow[]
  appendSummaries(result, outRows, 'out')
  appendSummaries(result, inRows, 'in')
  for (const id of ids) {
    if (!result.has(id)) result.set(id, [])
  }
  return result
}

/** 摘要查询行（方向由所在查询决定，故不在此字段中）。 */
interface RelationSummaryRow {
  entityId: number
  semanticCode: string
  /** 对端实体 id（出边查询取 `to_id`，入边查询取 `from_id`）。 */
  peerId: number
  targetName: string
  /** 对端实体模块类型（出边取 `t.entity_type`，入边取 `f.entity_type`）。 */
  peerEntityType: WorldEntityType
  /** 对端子类分类外键；`null` = 未分类。 */
  peerSubtypeId: number | null
  /** 对端子类展示名（未分类为空串）。 */
  peerSubType: string
  /** 对端子类预设路由键（自定义 / 未分类为空串）。 */
  peerPresetKey: string
}

/** 把一批同方向的摘要行追加到对应实体（保持查询顺序）。 */
function appendSummaries(
  target: Map<number, WorldEntityRelationSummary[]>,
  rows: readonly RelationSummaryRow[],
  direction: WorldEntityRelationSummary['direction']
): void {
  for (const row of rows) {
    const summary: WorldEntityRelationSummary = {
      direction,
      semanticCode: row.semanticCode,
      peerId: row.peerId,
      targetName: row.targetName,
      peerEntityType: row.peerEntityType,
      peerSubtypeId: row.peerSubtypeId,
      peerSubType: row.peerSubType,
      peerPresetKey: row.peerPresetKey
    }
    const list = target.get(row.entityId)
    if (list) list.push(summary)
    else target.set(row.entityId, [summary])
  }
}

/** 列出语义码字典（按码排序，供界面关系类型下拉）。 */
export function listSemanticCodes(): WorldSemanticCodeRow[] {
  return getDb()
    .prepare(
      `SELECT code, from_type AS fromType, to_type AS toType, COALESCE(note, '') AS note
       FROM world_semantic_codes ORDER BY code`
    )
    .all() as WorldSemanticCodeRow[]
}

/** 语义码是否存在于字典。 */
function semanticCodeExists(code: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM world_semantic_codes WHERE code = ?').get(code))
}

/** 读取单条引用；不存在返回 null。 */
function readRef(id: number): WorldRefRow | null {
  return (
    (getDb().prepare(`${SELECT_REF} WHERE r.id = ?`).get(id) as WorldRefRow | undefined) ?? null
  )
}

/**
 * 新增通用引用；两端须同书、未软删、非自指，语义码须存在，否则返回 null。
 */
export function addWorldRef(input: WorldRefInput): WorldRefRow | null {
  const db = getDb()
  if (input.fromId === input.toId) return null
  const code = input.semanticCode
  if (typeof code !== 'string' || code.trim() === '') return null
  if (!semanticCodeExists(code)) return null

  const endpoints = db
    .prepare(
      `SELECT id, book_id AS bookId, entity_type AS entityType FROM world_entities
       WHERE id IN (?, ?) AND deleted_at IS NULL`
    )
    .all(input.fromId, input.toId) as Array<{ id: number; bookId: string; entityType: string }>
  if (endpoints.length !== 2) return null
  if (endpoints.some((row) => row.bookId !== input.bookId)) return null

  const insert = db.prepare(
    `INSERT INTO world_refs
       (book_id, from_id, to_id, semantic_code, role, sort_order, valid_from, valid_to, note)
     VALUES (@bookId, @fromId, @toId, @semanticCode, @role, @sortOrder, @validFrom, @validTo, @note)`
  )
  const result = insert.run({
    bookId: input.bookId,
    fromId: input.fromId,
    toId: input.toId,
    semanticCode: code,
    role: input.role ?? '',
    sortOrder: input.sortOrder ?? 0,
    validFrom: input.validFrom ?? null,
    validTo: input.validTo ?? null,
    note: input.note ?? ''
  })
  const createdId = Number(result.lastInsertRowid)
  return createdId > 0 ? readRef(createdId) : null
}

/**
 * 更新通用引用（字段缺省保持不变）。
 * 语义码须存在，引用不存在时返回 null。
 *
 * 补丁不含 `fromId` / `toId`（端点不可改），端点类型不做限制。
 */
export function updateWorldRef(id: number, patch: UpdateWorldRefPatch): WorldRefRow | null {
  const db = getDb()
  const existing = readRef(id)
  if (!existing) return null

  if (patch.semanticCode !== undefined) {
    const code = patch.semanticCode
    if (typeof code !== 'string' || code.trim() === '' || !semanticCodeExists(code)) return null
  }

  const assignments: string[] = []
  const params: Record<string, unknown> = { id }
  const fieldMap: Array<[keyof UpdateWorldRefPatch, string]> = [
    ['semanticCode', 'semantic_code'],
    ['role', 'role'],
    ['sortOrder', 'sort_order'],
    ['validFrom', 'valid_from'],
    ['validTo', 'valid_to'],
    ['note', 'note']
  ]
  for (const [key, column] of fieldMap) {
    if (patch[key] === undefined) continue
    assignments.push(`${column} = @${key}`)
    params[key] = patch[key]
  }

  if (assignments.length > 0) {
    db.prepare(`UPDATE world_refs SET ${assignments.join(', ')} WHERE id = @id`).run(params)
  }
  return readRef(id)
}

/** 删除通用引用，返回是否命中。 */
export function removeWorldRef(id: number): boolean {
  const result = getDb().prepare('DELETE FROM world_refs WHERE id = ?').run(id)
  return Number(result.changes) > 0
}

/**
 * 删除某实体的全部关系行（出边 + 入边）。
 * 供实体软删时在同一事务内调用，避免留下指向已删实体的悬空关系。
 * 返回实际删除的行数。
 */
export function deleteWorldRefsForEntity(entityId: number): number {
  const result = getDb()
    .prepare('DELETE FROM world_refs WHERE from_id = ? OR to_id = ?')
    .run(entityId, entityId)
  return Number(result.changes)
}

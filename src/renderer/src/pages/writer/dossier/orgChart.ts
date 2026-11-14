import type { BookRefRow } from '../../../../../preload/types/worldEntity'

/**
 * 势力组织架构 · 渲染层纯函数（无 React、无副作用、不读库）。
 *
 * 从「势力 / 世界观」实体的上下级关系（`superior` / `subordinate`）推导树，`belongs_to`
 * 按两端实体类型认定成员，`peer` 单独成列不进树。已知脏数据在此统一收口：
 * - 同一逻辑边常双向各存一条（`A superior B` + `B subordinate A`）→ 归一后按方向去重；
 * - 同一对实体出现相反父子方向 → 保留 `sortOrder` 小的一条，另一方向记入 `conflicts`；
 * - 多父合法（DAG 不是树）→ 取主父（`sortOrder` 最小，其次 `id` 最小），其余进
 *   `extraParentIds` 并记入 `conflicts`；
 * - 环 → DFS 三色标记删回边并记入 `conflicts`；
 * - `belongs_to` 方向可能写反 → 按两端类型判定归属，反向存储标 `reversed`。
 *
 * 关系行来自 refs-only 通道（`worldEntity:listRefsByBook`），不携带正文；实体精简行
 * 与 `worldEntity:list` 的 `WorldEntityRow` 结构兼容，可直接传入。
 */

/** 组织架构需要的实体精简行（只取推导所需字段）。 */
export interface OrgEntityRow {
  id: number
  /** `world_entities.entity_type`；本模块只把 `faction` / `worldview` 当组织节点。 */
  entityType: string
  name: string
  /** 子类展示名（宗门 / 家族…），未分类为空串。 */
  subType: string
}

/** 组织节点下的直接成员（角色）。 */
export interface OrgChartMember {
  id: number
  name: string
  /** 关系方向是否与预期相反（数据问题标记；`belongs_to` 应为「角色 → 组织」）。 */
  reversed?: boolean
}

/** 组织架构节点（势力 / 世界观）。 */
export interface OrgChartNode {
  id: number
  entityType: 'faction' | 'worldview'
  name: string
  subType: string
  /** 暂留：refs-only 通道不含备注，后续接入关系备注后再填。 */
  leader?: string
  /** 直接成员（角色），按关系行 `sort_order, id` 排序。 */
  members: OrgChartMember[]
  /** 子节点（仅主父关系；按关系行 `sort_order, id` 排序）。 */
  children: OrgChartNode[]
  /** 多父时被舍弃的副父 id（主父在树的 parent 上体现），按关系行 `sort_order, id` 排序。 */
  extraParentIds: number[]
  /** 平级实体 id（`peer`，不进树），按关系行 `sort_order, id` 排序。 */
  peers: number[]
}

/** 冲突类型：方向冲突 / 环 / 多父。 */
export type OrgChartConflictKind = 'direction' | 'cycle' | 'multi-parent'

/** 推导过程中发现的数据问题。 */
export interface OrgChartConflict {
  kind: OrgChartConflictKind
  /**
   * 冲突涉及的实体 id（按 kind 解释）：
   * - `direction`：保留方向的 `[父, 子]`；
   * - `cycle`：环上的节点（按 DFS 路径，首尾不重复）；
   * - `multi-parent`：`[子节点, ...被舍弃的副父]`。
   */
  entityIds: number[]
  /**
   * 触发冲突的关系行 id：
   * - `direction`：被舍弃方向的行；
   * - `cycle`：被删除的回边；
   * - `multi-parent`：副父边。
   */
  refIds: number[]
}

/** 推导结果：根树 / 未进入任何根树的独立势力 / 数据问题。 */
export interface OrgChartResult {
  roots: OrgChartNode[]
  /**
   * 未进入任何根树的组织节点：无主父且无子节点（含完全无边、仅有平级关系、
   * 或只作为他人副父出现的势力），保证每个势力至少在一处可被渲染。
   */
  orphans: OrgChartNode[]
  conflicts: OrgChartConflict[]
}

/** 组织节点类型（其余实体类型只参与成员 / 端点过滤）。 */
const ORG_ENTITY_TYPES: ReadonlySet<string> = new Set(['faction', 'worldview'])

/** 参与父子推导的层级码（`peer` 与 `belongs_to` 另行处理）。 */
const HIERARCHY_CODES: ReadonlySet<string> = new Set(['superior', 'subordinate'])

/** 归一后的父边：`superior(A→B)` ⇒ parentId=A；`subordinate(A→B)` ⇒ parentId=B。 */
interface ParentEdge {
  refId: number
  parentId: number
  childId: number
  sortOrder: number
}

/** 是否组织节点（势力 / 世界观）。 */
function isOrgEntity(row: OrgEntityRow): boolean {
  return ORG_ENTITY_TYPES.has(row.entityType)
}

/** 关系行排序口径：`sort_order` 优先，其次行 id。 */
function compareEdges(left: ParentEdge, right: ParentEdge): number {
  return left.sortOrder - right.sortOrder || left.refId - right.refId
}

/** 取排序最小的一条；空数组返回 undefined。 */
function bestEdge(edges: readonly ParentEdge[]): ParentEdge | undefined {
  let best: ParentEdge | undefined
  for (const edge of edges) {
    if (!best || compareEdges(edge, best) < 0) best = edge
  }
  return best
}

/** 无向对键（用于「同一对实体」去重与方向冲突判定）。 */
function unorderedPairKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`
}

/** 归一父子边：只保留两端都是组织节点的层级行。 */
function normalizeHierarchyEdges(
  refs: readonly BookRefRow[],
  orgIds: ReadonlySet<number>
): ParentEdge[] {
  const edges: ParentEdge[] = []
  for (const ref of refs) {
    if (!HIERARCHY_CODES.has(ref.semanticCode)) continue
    if (!orgIds.has(ref.fromId) || !orgIds.has(ref.toId)) continue
    if (ref.fromId === ref.toId) continue
    const superior = ref.semanticCode === 'superior'
    edges.push({
      refId: ref.id,
      parentId: superior ? ref.fromId : ref.toId,
      childId: superior ? ref.toId : ref.fromId,
      sortOrder: ref.sortOrder
    })
  }
  return edges
}

/**
 * 去重 + 方向冲突：按无向对分组，同向只留 `sort_order, id` 最小的一条；
 * 两向并存时保留整体更小的一条，另一方向全部记入 `conflicts`。
 */
function resolveDirectionConflicts(edges: readonly ParentEdge[]): {
  edges: ParentEdge[]
  conflicts: OrgChartConflict[]
} {
  const byPair = new Map<string, ParentEdge[]>()
  for (const edge of edges) {
    const key = unorderedPairKey(edge.parentId, edge.childId)
    const list = byPair.get(key)
    if (list) list.push(edge)
    else byPair.set(key, [edge])
  }

  const kept: ParentEdge[] = []
  const conflicts: OrgChartConflict[] = []
  for (const list of byPair.values()) {
    const first = list[0]
    const forward: ParentEdge[] = []
    const backward: ParentEdge[] = []
    for (const edge of list) {
      if (edge.parentId === first.parentId) forward.push(edge)
      else backward.push(edge)
    }
    const forwardBest = bestEdge(forward)
    const backwardBest = bestEdge(backward)
    if (forwardBest && backwardBest) {
      const winner = compareEdges(forwardBest, backwardBest) <= 0 ? forwardBest : backwardBest
      const losers = winner === forwardBest ? backward : forward
      kept.push(winner)
      conflicts.push({
        kind: 'direction',
        entityIds: [winner.parentId, winner.childId],
        refIds: losers.map((edge) => edge.refId).sort((left, right) => left - right)
      })
    } else {
      const only = forwardBest ?? backwardBest
      if (only) kept.push(only)
    }
  }
  return { edges: kept, conflicts }
}

/**
 * 环检测与删边：父边方向 DFS 三色标记（白 / 灰 / 黑），指向灰色节点的边即回边。
 * 迭代实现，避免深树递归爆栈；节点按 id 升序起搜保证结果确定。
 */
function breakCycles(
  edges: readonly ParentEdge[],
  nodeIds: ReadonlySet<number>
): { edges: ParentEdge[]; conflicts: OrgChartConflict[] } {
  const WHITE = 0
  const GREY = 1
  const BLACK = 2

  const adjacency = new Map<number, ParentEdge[]>()
  for (const edge of edges) {
    const list = adjacency.get(edge.parentId)
    if (list) list.push(edge)
    else adjacency.set(edge.parentId, [edge])
  }
  for (const list of adjacency.values()) list.sort(compareEdges)

  const colors = new Map<number, number>()
  const removedRefIds = new Set<number>()
  const conflicts: OrgChartConflict[] = []
  const path: number[] = []

  for (const start of [...nodeIds].sort((left, right) => left - right)) {
    if ((colors.get(start) ?? WHITE) !== WHITE) continue
    const frames: Array<{ id: number; index: number }> = [{ id: start, index: 0 }]
    colors.set(start, GREY)
    path.push(start)

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]
      const children = adjacency.get(frame.id)
      if (!children || frame.index >= children.length) {
        colors.set(frame.id, BLACK)
        path.pop()
        frames.pop()
        continue
      }
      const edge = children[frame.index]
      frame.index += 1
      const state = colors.get(edge.childId) ?? WHITE
      if (state === GREY) {
        removedRefIds.add(edge.refId)
        const cycleStart = path.indexOf(edge.childId)
        conflicts.push({
          kind: 'cycle',
          entityIds: cycleStart === -1 ? [frame.id, edge.childId] : path.slice(cycleStart),
          refIds: [edge.refId]
        })
        continue
      }
      if (state === BLACK) continue
      colors.set(edge.childId, GREY)
      path.push(edge.childId)
      frames.push({ id: edge.childId, index: 0 })
    }
  }

  return { edges: edges.filter((edge) => !removedRefIds.has(edge.refId)), conflicts }
}

/** 多父：每个子节点取主父（`sort_order, id` 最小），其余进副父表并记冲突。 */
function assignPrimaryParents(edges: readonly ParentEdge[]): {
  primary: Map<number, ParentEdge>
  extra: Map<number, ParentEdge[]>
  conflicts: OrgChartConflict[]
} {
  const grouped = new Map<number, ParentEdge[]>()
  for (const edge of edges) {
    const list = grouped.get(edge.childId)
    if (list) list.push(edge)
    else grouped.set(edge.childId, [edge])
  }

  const primary = new Map<number, ParentEdge>()
  const extra = new Map<number, ParentEdge[]>()
  const conflicts: OrgChartConflict[] = []
  for (const [childId, list] of grouped) {
    list.sort(compareEdges)
    primary.set(childId, list[0])
    if (list.length === 1) continue
    const rest = list.slice(1)
    extra.set(childId, rest)
    conflicts.push({
      kind: 'multi-parent',
      entityIds: [childId, ...rest.map((edge) => edge.parentId)],
      refIds: rest.map((edge) => edge.refId).sort((left, right) => left - right)
    })
  }
  return { primary, extra, conflicts }
}

/** 成员候选：同一角色可能由多条 `belongs_to` 指向同一组织，需去重。 */
interface MemberCandidate {
  member: OrgChartMember
  sortOrder: number
  refId: number
}

/** 成员去重优先级：正向存储优先，其次 `sort_order, id` 最小。 */
function isBetterMember(next: MemberCandidate, current: MemberCandidate): boolean {
  const nextReversed = next.member.reversed === true ? 1 : 0
  const currentReversed = current.member.reversed === true ? 1 : 0
  if (nextReversed !== currentReversed) return nextReversed < currentReversed
  if (next.sortOrder !== current.sortOrder) return next.sortOrder < current.sortOrder
  return next.refId < current.refId
}

/**
 * `belongs_to` 成员：只看两端类型（一端组织、一端角色），不看存储方向；
 * 组织 → 角色视为反向存储，标 `reversed: true`。
 */
function collectMembers(
  refs: readonly BookRefRow[],
  entityById: ReadonlyMap<number, OrgEntityRow>
): Map<number, OrgChartMember[]> {
  const byOrg = new Map<number, Map<number, MemberCandidate>>()
  for (const ref of refs) {
    if (ref.semanticCode !== 'belongs_to') continue
    const from = entityById.get(ref.fromId)
    const to = entityById.get(ref.toId)
    if (!from || !to || from.id === to.id) continue

    let org: OrgEntityRow
    let character: OrgEntityRow
    let reversed: boolean
    if (isOrgEntity(from) && to.entityType === 'character') {
      org = from
      character = to
      reversed = true
    } else if (from.entityType === 'character' && isOrgEntity(to)) {
      org = to
      character = from
      reversed = false
    } else {
      continue
    }

    let bucket = byOrg.get(org.id)
    if (!bucket) {
      bucket = new Map()
      byOrg.set(org.id, bucket)
    }
    const candidate: MemberCandidate = {
      member: reversed
        ? { id: character.id, name: character.name, reversed: true }
        : { id: character.id, name: character.name },
      sortOrder: ref.sortOrder,
      refId: ref.id
    }
    const existing = bucket.get(character.id)
    if (!existing || isBetterMember(candidate, existing)) bucket.set(character.id, candidate)
  }

  const result = new Map<number, OrgChartMember[]>()
  for (const [orgId, bucket] of byOrg) {
    result.set(
      orgId,
      [...bucket.values()]
        .sort((left, right) => left.sortOrder - right.sortOrder || left.refId - right.refId)
        .map((entry) => entry.member)
    )
  }
  return result
}

/** 平级候选：同一条 `peer` 双向落到两端，按 `sort_order, id` 保留最优。 */
function addPeer(
  target: Map<number, Map<number, { sortOrder: number; refId: number }>>,
  entityId: number,
  peerId: number,
  ref: BookRefRow
): void {
  let bucket = target.get(entityId)
  if (!bucket) {
    bucket = new Map()
    target.set(entityId, bucket)
  }
  const existing = bucket.get(peerId)
  if (
    !existing ||
    ref.sortOrder < existing.sortOrder ||
    (ref.sortOrder === existing.sortOrder && ref.id < existing.refId)
  ) {
    bucket.set(peerId, { sortOrder: ref.sortOrder, refId: ref.id })
  }
}

/** `peer` 只做平级展示，不参与父子推导。 */
function collectPeers(
  refs: readonly BookRefRow[],
  orgIds: ReadonlySet<number>
): Map<number, number[]> {
  const candidates = new Map<number, Map<number, { sortOrder: number; refId: number }>>()
  for (const ref of refs) {
    if (ref.semanticCode !== 'peer') continue
    if (!orgIds.has(ref.fromId) || !orgIds.has(ref.toId) || ref.fromId === ref.toId) continue
    addPeer(candidates, ref.fromId, ref.toId, ref)
    addPeer(candidates, ref.toId, ref.fromId, ref)
  }

  const result = new Map<number, number[]>()
  for (const [entityId, bucket] of candidates) {
    result.set(
      entityId,
      [...bucket.entries()]
        .sort(
          (left, right) => left[1].sortOrder - right[1].sortOrder || left[1].refId - right[1].refId
        )
        .map(([peerId]) => peerId)
    )
  }
  return result
}

/** 冲突展示顺序：方向冲突 → 环 → 多父，同类按首个实体 id / 行 id 稳定排序。 */
const CONFLICT_ORDER: Record<OrgChartConflictKind, number> = {
  direction: 0,
  cycle: 1,
  'multi-parent': 2
}

/** 冲突排序（纯展示用，保证同输入下输出顺序稳定）。 */
function compareConflicts(left: OrgChartConflict, right: OrgChartConflict): number {
  const kind = CONFLICT_ORDER[left.kind] - CONFLICT_ORDER[right.kind]
  if (kind !== 0) return kind
  const entity = (left.entityIds[0] ?? 0) - (right.entityIds[0] ?? 0)
  if (entity !== 0) return entity
  return (left.refIds[0] ?? 0) - (right.refIds[0] ?? 0)
}

/** 推导组织架构（纯函数）。 */
export function buildOrgChart(
  entities: readonly OrgEntityRow[],
  refs: readonly BookRefRow[]
): OrgChartResult {
  const entityById = new Map<number, OrgEntityRow>()
  const orgIds = new Set<number>()
  for (const entity of entities) {
    entityById.set(entity.id, entity)
    if (isOrgEntity(entity)) orgIds.add(entity.id)
  }

  const direction = resolveDirectionConflicts(normalizeHierarchyEdges(refs, orgIds))
  const cycle = breakCycles(direction.edges, orgIds)
  const hierarchy = assignPrimaryParents(cycle.edges)

  const childEdges = new Map<number, ParentEdge[]>()
  for (const edge of hierarchy.primary.values()) {
    const list = childEdges.get(edge.parentId)
    if (list) list.push(edge)
    else childEdges.set(edge.parentId, [edge])
  }
  for (const list of childEdges.values()) list.sort(compareEdges)

  const members = collectMembers(refs, entityById)
  const peers = collectPeers(refs, orgIds)

  const node = (id: number): OrgChartNode => {
    const info = entityById.get(id)
    return {
      id,
      entityType: info?.entityType === 'worldview' ? 'worldview' : 'faction',
      name: info?.name ?? '',
      subType: info?.subType ?? '',
      members: members.get(id) ?? [],
      children: (childEdges.get(id) ?? []).map((edge) => node(edge.childId)),
      extraParentIds: (hierarchy.extra.get(id) ?? []).map((edge) => edge.parentId),
      peers: peers.get(id) ?? []
    }
  }

  const rootOrder = (id: number): number => {
    const children = childEdges.get(id)
    return children && children.length > 0 ? children[0].sortOrder : Number.POSITIVE_INFINITY
  }

  const roots: OrgChartNode[] = []
  const orphans: OrgChartNode[] = []
  for (const id of [...orgIds].sort((left, right) => left - right)) {
    if (hierarchy.primary.has(id)) continue
    if ((childEdges.get(id) ?? []).length > 0) roots.push(node(id))
    else orphans.push(node(id))
  }
  roots.sort((left, right) => rootOrder(left.id) - rootOrder(right.id) || left.id - right.id)

  const conflicts = [...direction.conflicts, ...cycle.conflicts, ...hierarchy.conflicts].sort(
    compareConflicts
  )

  return { roots, orphans, conflicts }
}

import { getEntityRevision, listMatchEntries } from '../database/entities'
import type { MatchEntry } from '../database/entities'
import type { WorldEntityType } from '../database/worldEntityTypes'
import { foldForMatch } from './textFold'

/** 实体类型：统一设定库五大类（worldview / character / item / faction / power_system）。 */
export type EntityType = WorldEntityType

/** 单条命中结果。`start` / `end` 为 JavaScript 字符串下标（UTF-16 code unit，左闭右开）。 */
export interface EntityMatch {
  entityId: number
  /** 命中的词（实体名或别名原文）。 */
  name: string
  type: EntityType
  /**
   * 子类分类外键（`world_entities.subtype_id`）；`null` = 未分类。
   * 保留字段：下游仍携带，但不再参与配色——胶囊颜色由下方的 `presetKey` 决定。
   */
  subtypeId: number | null
  /**
   * 子类预设路由键（`world_subtypes.preset_key`）；空串 = 自定义分类或未分类。
   * 供渲染层胶囊按 23 个预设子类取独立颜色。
   */
  presetKey: string
  start: number
  end: number
}

/**
 * 同长度命中的类型优先级：人物 > 势力 > 物品 > 世界观 > 境界体系（值越小越优先）。
 * 用于「同一区间被多个不同类型词共享」时的确定性消解：
 * 人物是最需要精确指向的叙事主体；势力次之（群体归属）；物品再次（可归属人 / 势力）；
 * 世界观（地点 / 概念）较泛；境界体系名多为体系名，与地点 / 概念重叠时让位给更具体类型。
 */
const TYPE_PRIORITY: Record<EntityType, number> = {
  character: 0,
  faction: 1,
  item: 2,
  worldview: 3,
  power_system: 4
}

/** 一个待匹配模式（= 一条实体名或别名）。 */
interface Pattern {
  entityId: number
  name: string
  type: EntityType
  /** 子类分类外键（同词表行）；`null` = 未分类。保留字段，配色改由 `presetKey` 决定。 */
  subtypeId: number | null
  /** 子类预设路由键（同词表行）；空串 = 自定义分类或未分类。用于命中结果取预设色。 */
  presetKey: string
  /** 词长，按 code point 计。 */
  length: number
}

/** AC 自动机节点：`children` 为 code point → 子节点下标，`outputs` 为模式下标列表。 */
interface Node {
  children: Map<string, number>
  fail: number
  outputs: number[]
}

/** 编译后的匹配器实例。 */
interface CompiledMatcher {
  nodes: Node[]
  patterns: Pattern[]
}

/** 缓存项：绑定构建时的数据版本号，版本变化即失效重建。 */
interface CacheEntry {
  revision: string
  matcher: CompiledMatcher
}

const cache = new Map<string, CacheEntry>()

/** 新建节点。 */
function createNode(): Node {
  return { children: new Map<string, number>(), fail: 0, outputs: [] }
}

/** 由词表构建 AC 自动机（纯 JS，无第三方依赖）。 */
function buildMatcher(entries: readonly MatchEntry[]): CompiledMatcher {
  const nodes: Node[] = [createNode()]
  const patterns: Pattern[] = []

  for (const entry of entries) {
    // 词条规范化：去首尾空白 + 与正文**同一规则**（NFKC 兼容规范化 + 大小写折叠）。
    // 词条独立，trim 不影响正文位置映射；`name` 保留 trim 后的原词供展示。
    const term = entry.term.trim()
    const chars = Array.from(foldForMatch(term).text)
    if (chars.length === 0) continue
    let current = 0
    for (const ch of chars) {
      let next = nodes[current].children.get(ch)
      if (next === undefined) {
        next = nodes.length
        nodes.push(createNode())
        nodes[current].children.set(ch, next)
      }
      current = next
    }
    const patternIndex = patterns.length
    patterns.push({
      entityId: entry.entityId,
      name: term,
      type: entry.type,
      // 分类外键随模式一并编译，命中时才能带出「模块 + 分类」双重取色依据。
      subtypeId: entry.subtypeId,
      // 预设路由键同样随模式编译，供渲染层按预设子类取独立颜色。
      presetKey: entry.presetKey,
      length: chars.length
    })
    nodes[current].outputs.push(patternIndex)
  }

  // BFS 构建失配指针，并把失配节点的 outputs 合并到当前节点（输出链扁平化）。
  const queue: number[] = []
  for (const child of nodes[0].children.values()) {
    nodes[child].fail = 0
    queue.push(child)
  }
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head]
    for (const [ch, child] of nodes[node].children) {
      let fail = nodes[node].fail
      while (fail !== 0 && !nodes[fail].children.has(ch)) fail = nodes[fail].fail
      const fallback = nodes[fail].children.get(ch)
      nodes[child].fail = fallback !== undefined && fallback !== child ? fallback : 0
      const inherited = nodes[nodes[child].fail].outputs
      if (inherited.length > 0) nodes[child].outputs = nodes[child].outputs.concat(inherited)
      queue.push(child)
    }
  }

  return { nodes, patterns }
}

/** 命中区间（code point 下标，左闭右开），用于消解前的中间结果。 */
interface RawMatch {
  patternIndex: number
  start: number
  end: number
}

/**
 * AC 扫描：按 code point 遍历文本，收集全部命中区间。
 * 返回 code point 下标区间，调用方再换算为 code unit 下标。
 */
function scan(matcher: CompiledMatcher, text: string): RawMatch[] {
  const raw: RawMatch[] = []
  const chars = Array.from(text)
  let current = 0
  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index]
    while (current !== 0 && !matcher.nodes[current].children.has(ch)) {
      current = matcher.nodes[current].fail
    }
    current = matcher.nodes[current].children.get(ch) ?? 0
    for (const patternIndex of matcher.nodes[current].outputs) {
      const length = matcher.patterns[patternIndex].length
      raw.push({ patternIndex, start: index - length + 1, end: index + 1 })
    }
  }
  return raw
}

/**
 * 重叠消解：先按「最早起点 → 最长 → 类型优先级 → 实体 id 小」排序，
 * 再贪心保留与已选区间不重叠者。同一实体不重叠的多次出现都会被保留。
 */
function resolveOverlaps(matcher: CompiledMatcher, raw: readonly RawMatch[]): EntityMatch[] {
  const sorted = [...raw].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    const lengthDiff = b.end - b.start - (a.end - a.start)
    if (lengthDiff !== 0) return lengthDiff
    const pa = matcher.patterns[a.patternIndex]
    const pb = matcher.patterns[b.patternIndex]
    const priority = TYPE_PRIORITY[pa.type] - TYPE_PRIORITY[pb.type]
    if (priority !== 0) return priority
    return pa.entityId - pb.entityId
  })

  const accepted: RawMatch[] = []
  let lastEnd = -1
  for (const match of sorted) {
    if (match.start < lastEnd) continue
    accepted.push(match)
    lastEnd = match.end
  }

  // 按出现顺序（start 升序）输出，便于渲染层顺序高亮。
  return accepted
    .sort((a, b) => a.start - b.start)
    .map((match) => {
      const pattern = matcher.patterns[match.patternIndex]
      return {
        entityId: pattern.entityId,
        name: pattern.name,
        type: pattern.type,
        subtypeId: pattern.subtypeId,
        presetKey: pattern.presetKey,
        start: match.start,
        end: match.end
      }
    })
}

/** 按书获取匹配器：revision 未变则复用缓存，否则重建。 */
function getMatcher(bookId: string): CompiledMatcher {
  const revision = getEntityRevision(bookId)
  const cached = cache.get(bookId)
  if (cached && cached.revision === revision) return cached.matcher

  const matcher = buildMatcher(listMatchEntries(bookId))
  cache.set(bookId, { revision, matcher })
  return matcher
}

/**
 * 匹配指定书籍文本中的实体。
 *
 * 返回的 `start` / `end` 为**原文** UTF-16 code unit 下标（左闭右开），可直接用于
 * `text.slice(start, end)`。流程：正文先经 `foldForMatch` 规范化（与词表同一规则），
 * 在折叠空间按 code point 扫描（避免切裂代理对），命中区间再经边界映射表换算回原文下标。
 */
export function matchEntities(bookId: string, text: string): EntityMatch[] {
  if (text.length === 0) return []
  const matcher = getMatcher(bookId)
  if (matcher.patterns.length === 0) return []

  const folded = foldForMatch(text)
  const raw = scan(matcher, folded.text)
  if (raw.length === 0) return []
  const resolved = resolveOverlaps(matcher, raw)
  if (resolved.length === 0) return []

  const result: EntityMatch[] = []
  for (const match of resolved) {
    // 命中边界必须落在「合法切点」（簇边界）才能映射回原文：NFKC 展开字符（如 ﬁ→fi）
    // 的内部边界无对应原文位置，落在其上的命中丢弃，避免错标区间。
    if (!folded.valid[match.start] || !folded.valid[match.end]) continue
    result.push({
      entityId: match.entityId,
      name: match.name,
      type: match.type,
      // 分类外键继续向 IPC 结果透传（保留字段，配色改由 `presetKey` 决定；未分类为 null）。
      subtypeId: match.subtypeId,
      // 预设路由键一并透传（渲染层按 23 个预设子类取独立颜色）。
      presetKey: match.presetKey,
      start: folded.offsets[match.start],
      end: folded.offsets[match.end]
    })
  }
  return result
}

/** 手动清除匹配器缓存（传 bookId 清单本，省略清全部）。 */
export function invalidateEntityMatcher(bookId?: string): void {
  if (bookId === undefined) cache.clear()
  else cache.delete(bookId)
}

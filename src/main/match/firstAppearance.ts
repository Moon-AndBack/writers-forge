/**
 * 实体首次登场索引（主进程，按书内存缓存）。
 *
 * ## 口径
 * - **只扫章节正文**：`paragraphs.text`（不含章名 / 大纲 / 剧情）；段落按 `idx` 升序，
 *   取该实体在全书中**阅读序最靠前**的章节及其段内首次命中；
 * - **阅读序** = 卷展示序（自定义卷置顶、未分卷置底）→ 卷内 `PIN_RANK`
 *   （top 特殊章 → 普通章 → 无 pin 特殊章 → bottom）→ `sort_order, id`，与章节页展示序一致；
 * - **词表复用** `entityMatcher`（实体名 + 别名、`foldForMatch` 规范化、重叠消解），
 *   软删实体不参与；返回 `Record<entityId, FirstAppearancePlace | null>`，未登场为 `null`。
 *
 * ## 性能与缓存
 * - 首次构建逐章匹配（100 万字约 455ms 量级），每 {@link YIELD_CHAPTERS} 章让出事件循环，
 *   避免阻塞主进程 IPC；构建后正文结果常驻内存，不再重复扫描；
 * - 每章只保留「该章每个实体的首次命中」，全书首次由阅读序一遍推导；
 * - 实体词表变化（`getEntityRevision`）或章节结构签名（增删 / 移动 / 重排 / 置顶 / 改名）
 *   变化 → 整书重建；仅正文变化（`chapterContentVersion`）→ 只重扫变化章并重算首次；
 * - 构建 / 重扫期间可能发生写入：完成后重新校验词表、结构、各章内容版本，不一致则重试
 *   （最多 {@link MAX_ATTEMPTS} 轮），避免把混合结果写入缓存。
 *
 * ## 已知局限（沿用既有匹配器语义，本批不特殊处理）
 * - **单字实体名**：只要词表里有单字名（如「城」「剑」），正文中任意同字都会命中，
 *   首次登场可能远早于真实叙事出场；是否屏蔽单字名由后续产品批次决定；
 * - **同名实体 / 别名**：多个实体共用同一词条时，重叠消解按「最早起点 → 最长 → 类型优先级 →
 *   实体 id 小」只保留一个命中，故这些实体可能共享同一位置；
 * - **短名被长名吞并**：同一区间被更长词覆盖时短名不单独计为首次登场。
 */
import { getDb } from '../database/index'
import { CHAPTER_VISIBLE_VOLUME_KINDS } from '../database/chapterTypes'
import type { ChapterKind, VolumeKind } from '../database/chapterTypes'
import { coerceChapterKind, coerceVolumeKind } from '../database/chapterMappers'
import { getChapterContentVersion } from '../database/chapterContentVersion'
import { getEntityRevision, listMatchEntries } from '../database/entities'
import { VOLUME_DISPLAY_ORDER_SQL } from '../database/chapterOrdering'
import { matchEntitiesMany } from './entityMatcher'

/** 每处理这么多章让出一次事件循环（单章约 1ms，8 章约 8ms 的连续占用）。 */
const YIELD_CHAPTERS = 8

/** 构建 / 重扫后的一致性校验最多重试轮数（持续写入时兜底返回最新构建结果）。 */
const MAX_ATTEMPTS = 3

/** 章节页可见卷 kind 的 SQL 字面量（与 `listVolumes` 同口径：排除仅大纲页可见的分组容器）。 */
const VISIBLE_VOLUME_KINDS_SQL = CHAPTER_VISIBLE_VOLUME_KINDS.map((kind) => `'${kind}'`).join(', ')

/** 首次登场位置：本批只提供「可显示位置串所需的字段」，不做跳转。 */
export interface FirstAppearancePlace {
  chapterId: number
  chapterTitle: string
  chapterKind: ChapterKind
  /** 卷内动态编号（普通章 1..n；特殊章 0）。 */
  chapterNumberIndex: number
  /** 特殊章前段（如「序章」）；普通章为 null。 */
  specialPrefix: string | null
  volumeId: number
  volumeTitle: string
  volumeKind: VolumeKind
  /** 卷动态编号（正文卷 1..n；自定义卷 / 未分卷 0）。 */
  volumeNumberIndex: number
  /** 命中所在段落 `paragraphs.idx`。 */
  paragraphIdx: number
  /** 段内 UTF-16 下标（左闭右开），可直接用于 `text.slice`。 */
  charStart: number
  charEnd: number
}

/** 实体 id → 首次登场位置；未在正文登场为 `null`。JSON 序列化后键为字符串。 */
export type FirstAppearanceMap = Record<number, FirstAppearancePlace | null>

/** 卷骨架（阅读序 + 动态卷号）。 */
interface VolumeSkeleton {
  id: number
  kind: VolumeKind
  title: string
  isUnfiled: boolean
  sortOrder: number
  numberIndex: number
}

/** 章骨架（阅读序 + 卷内动态章号）。 */
interface ChapterSkeleton {
  id: number
  volumeId: number
  kind: ChapterKind
  title: string
  specialPrefix: string | null
  sortOrder: number
  pin: string | null
  numberIndex: number
}

/** 一次结构快照：词表版本 + 阅读序骨架 + 结构签名（签名用于防漏挂的整书失效兜底）。 */
interface ReadingSnapshot {
  revision: string
  signature: string
  volumes: VolumeSkeleton[]
  chapters: ChapterSkeleton[]
}

/** 单章内某实体的首次命中。 */
interface MatchSpot {
  paragraphIdx: number
  charStart: number
  charEnd: number
}

/** 全书首次：章节骨架 + 段内位置。 */
interface FirstSpot {
  chapter: ChapterSkeleton
  spot: MatchSpot
}

/** 按书内存索引。 */
interface BookIndex {
  revision: string
  signature: string
  volumes: VolumeSkeleton[]
  volumeById: Map<number, VolumeSkeleton>
  /** 阅读序章列表。 */
  chapters: ChapterSkeleton[]
  /** 词表涉及的实体 id（软删实体已排除；未登场返回 null）。 */
  entityIds: number[]
  /** chapterId → (entityId → 该章首次命中)。 */
  chapterMatches: Map<number, Map<number, MatchSpot>>
  /** chapterId → 扫描时的正文内容版本（用于增量重扫）。 */
  contentVersions: Map<number, number>
  /** entityId → 全书首次。 */
  firsts: Map<number, FirstSpot>
}

interface VolumeDbRow {
  id: number
  kind: string
  title: string
  isUnfiled: number
  sortOrder: number
}

interface ChapterDbRow {
  id: number
  volumeId: number
  kind: string
  title: string
  specialPrefix: string | null
  sortOrder: number
  pin: string | null
}

/** 按书缓存；键为 bookId。 */
const indexes = new Map<string, BookIndex>()

/** 查询队列：串行化构建 / 重扫，避免同书并发构建与写交错。 */
let queue: Promise<unknown> = Promise.resolve()

/** 让出事件循环（`setImmediate` 在当前 I/O 回调之后执行，不阻塞 IPC）。 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** 读取阅读序骨架与词表版本；架查询只取必要列，成本远低于正文扫描。 */
function readSnapshot(bookId: string): ReadingSnapshot {
  const db = getDb()
  const revision = getEntityRevision(bookId)

  // 卷：与 `listVolumes` 同口径（排除分组容器；自定义卷置顶、未分卷置底）。
  const volumeRows = db
    .prepare(
      `SELECT id, kind, title, is_unfiled AS isUnfiled, sort_order AS sortOrder
       FROM volumes
       WHERE book_id = ? AND deleted_at IS NULL AND kind IN (${VISIBLE_VOLUME_KINDS_SQL})
       ORDER BY ${VOLUME_DISPLAY_ORDER_SQL}`
    )
    .all(bookId) as VolumeDbRow[]

  let volumeNumber = 0
  const volumes: VolumeSkeleton[] = volumeRows.map((row) => {
    const kind = coerceVolumeKind(row.kind)
    if (kind === 'normal') volumeNumber += 1
    return {
      id: row.id,
      kind,
      title: row.title,
      isUnfiled: row.isUnfiled === 1,
      sortOrder: row.sortOrder,
      numberIndex: kind === 'normal' ? volumeNumber : 0
    }
  })

  // 章：一条 JOIN 按阅读序取全量（卷展示序 → PIN_RANK → sort_order, id）。
  // JOIN 后 `kind` / `sort_order` 等列名重复，故 PIN_RANK / 卷序表达式必须带 `c.` / `v.` 前缀，
  // 不能直接复用无前缀的 `PIN_RANK_SQL` / `VOLUME_DISPLAY_ORDER_SQL` 字面量。
  const chapterRows = db
    .prepare(
      `SELECT c.id AS id, c.volume_id AS volumeId, c.kind AS kind, c.title AS title,
              c.special_prefix AS specialPrefix, c.sort_order AS sortOrder, c.pin AS pin
       FROM chapters c
       JOIN volumes v ON v.id = c.volume_id
       WHERE c.book_id = ? AND c.deleted_at IS NULL AND v.deleted_at IS NULL
         AND v.kind IN (${VISIBLE_VOLUME_KINDS_SQL})
       ORDER BY CASE WHEN v.is_unfiled = 1 THEN 2 WHEN v.kind = 'custom' THEN 0 ELSE 1 END,
                v.sort_order, v.id,
                CASE WHEN c.pin = 'top' THEN 0 WHEN c.kind = 'normal' THEN 1
                     WHEN c.pin IS NULL THEN 2 ELSE 3 END,
                c.sort_order, c.id`
    )
    .all(bookId) as ChapterDbRow[]

  const chapterCounters = new Map<number, number>()
  const chapters: ChapterSkeleton[] = chapterRows.map((row) => {
    const kind = coerceChapterKind(row.kind)
    if (kind === 'special') {
      return {
        id: row.id,
        volumeId: row.volumeId,
        kind,
        title: row.title,
        specialPrefix: row.specialPrefix,
        sortOrder: row.sortOrder,
        pin: row.pin,
        numberIndex: 0
      }
    }
    const next = (chapterCounters.get(row.volumeId) ?? 0) + 1
    chapterCounters.set(row.volumeId, next)
    return {
      id: row.id,
      volumeId: row.volumeId,
      kind,
      title: row.title,
      specialPrefix: row.specialPrefix,
      sortOrder: row.sortOrder,
      pin: row.pin,
      numberIndex: next
    }
  })

  return {
    revision,
    // 结构签名：标题 / 归属 / 排序 / pin 任一变化都会改变签名（正文写入不在此列）。
    signature: JSON.stringify({ volumes, chapters }),
    volumes,
    chapters
  }
}

/**
 * 扫描单章正文，返回「该章每个实体的首次命中」与扫描时的内容版本。
 *
 * 段落查询与版本读取之间**没有 await**（同一同步块），故写入无法插入：
 * 记录的内容版本与本次扫描到的正文严格对应。
 */
function scanChapter(
  bookId: string,
  chapterId: number
): { spots: Map<number, MatchSpot>; version: number } {
  const rows = getDb()
    .prepare('SELECT idx, text FROM paragraphs WHERE chapter_id = ? ORDER BY idx')
    .all(chapterId) as Array<{ idx: number; text: string }>
  const matches = matchEntitiesMany(
    bookId,
    rows.map((row) => row.text)
  )

  const spots = new Map<number, MatchSpot>()
  for (let index = 0; index < rows.length; index += 1) {
    for (const match of matches[index]) {
      // 段落已按 idx 升序、匹配结果已按 start 升序：首次遇到即该章最早位置。
      if (spots.has(match.entityId)) continue
      spots.set(match.entityId, {
        paragraphIdx: rows[index].idx,
        charStart: match.start,
        charEnd: match.end
      })
    }
  }

  return { spots, version: getChapterContentVersion(chapterId) }
}

/** 按阅读序推导全书首次（先遇到的章即首次）。 */
function computeFirsts(index: BookIndex): Map<number, FirstSpot> {
  const firsts = new Map<number, FirstSpot>()
  for (const chapter of index.chapters) {
    const matches = index.chapterMatches.get(chapter.id)
    if (!matches) continue
    for (const [entityId, spot] of matches) {
      if (!firsts.has(entityId)) firsts.set(entityId, { chapter, spot })
    }
  }
  return firsts
}

/** 整书构建（逐章扫描；每 N 章让出事件循环）。 */
async function buildIndex(bookId: string, snapshot: ReadingSnapshot): Promise<BookIndex> {
  // 词表涉及的实体 id：与匹配器同源（实体名 + 别名，软删已过滤）；别名重复仅计一次。
  const entityIds = [...new Set(listMatchEntries(bookId).map((entry) => entry.entityId))]
  const chapterMatches = new Map<number, Map<number, MatchSpot>>()
  const contentVersions = new Map<number, number>()

  let sinceYield = 0
  for (const chapter of snapshot.chapters) {
    const scanned = scanChapter(bookId, chapter.id)
    chapterMatches.set(chapter.id, scanned.spots)
    contentVersions.set(chapter.id, scanned.version)
    sinceYield += 1
    if (sinceYield >= YIELD_CHAPTERS) {
      sinceYield = 0
      await yieldToEventLoop()
    }
  }

  const index: BookIndex = {
    revision: snapshot.revision,
    signature: snapshot.signature,
    volumes: snapshot.volumes,
    volumeById: new Map(snapshot.volumes.map((volume) => [volume.id, volume])),
    chapters: snapshot.chapters,
    entityIds,
    chapterMatches,
    contentVersions,
    firsts: new Map()
  }
  index.firsts = computeFirsts(index)
  return index
}

/** 对比缓存中的内容版本与当前信号，返回需要重扫的章 id（保持阅读序）。 */
function diffChapters(index: BookIndex): number[] {
  const dirty: number[] = []
  for (const chapter of index.chapters) {
    if (index.contentVersions.get(chapter.id) !== getChapterContentVersion(chapter.id)) {
      dirty.push(chapter.id)
    }
  }
  return dirty
}

/** 增量重扫指定章并重算首次（仍按阅读序，每 N 章让出）。 */
async function rescanChapters(
  bookId: string,
  index: BookIndex,
  dirty: readonly number[]
): Promise<void> {
  const dirtySet = new Set(dirty)
  let sinceYield = 0
  for (const chapter of index.chapters) {
    if (!dirtySet.has(chapter.id)) continue
    const scanned = scanChapter(bookId, chapter.id)
    index.chapterMatches.set(chapter.id, scanned.spots)
    index.contentVersions.set(chapter.id, scanned.version)
    sinceYield += 1
    if (sinceYield >= YIELD_CHAPTERS) {
      sinceYield = 0
      await yieldToEventLoop()
    }
  }
  index.firsts = computeFirsts(index)
}

/** 索引 → IPC 返回（含全部词表实体，未登场为 null）。 */
function toFirstAppearanceMap(index: BookIndex): FirstAppearanceMap {
  const result: FirstAppearanceMap = {}
  for (const entityId of index.entityIds) {
    const first = index.firsts.get(entityId)
    if (!first) {
      result[entityId] = null
      continue
    }
    const volume = index.volumeById.get(first.chapter.volumeId)
    result[entityId] = {
      chapterId: first.chapter.id,
      chapterTitle: first.chapter.title,
      chapterKind: first.chapter.kind,
      chapterNumberIndex: first.chapter.numberIndex,
      specialPrefix: first.chapter.specialPrefix,
      volumeId: first.chapter.volumeId,
      volumeTitle: volume?.title ?? '',
      volumeKind: volume?.kind ?? 'custom',
      volumeNumberIndex: volume?.numberIndex ?? 0,
      paragraphIdx: first.spot.paragraphIdx,
      charStart: first.spot.charStart,
      charEnd: first.spot.charEnd
    }
  }
  return result
}

/**
 * 刷新某书索引（必要时构建 / 增量重扫），返回可缓存的最新索引。
 *
 * 校验点：构建或重扫结束后重新读词表版本 + 结构签名 + 各章内容版本；任何一项变化都说明
 * 期间发生过写入，本轮结果可能混合，丢弃并重试。多轮仍不稳定时兜底再建一次且**不写缓存**
 * （每章「正文 + 版本」仍成对记录，下次查询会继续校正）。
 */
async function refresh(bookId: string): Promise<BookIndex> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const snapshot = readSnapshot(bookId)
    const cached = indexes.get(bookId)
    const reusable =
      cached !== undefined &&
      cached.revision === snapshot.revision &&
      cached.signature === snapshot.signature

    if (reusable) {
      const dirty = diffChapters(cached)
      if (dirty.length === 0) return cached
      await rescanChapters(bookId, cached, dirty)
      const after = readSnapshot(bookId)
      if (
        after.revision === snapshot.revision &&
        after.signature === snapshot.signature &&
        diffChapters(cached).length === 0
      ) {
        indexes.set(bookId, cached)
        return cached
      }
      continue
    }

    const index = await buildIndex(bookId, snapshot)
    const after = readSnapshot(bookId)
    if (after.revision !== snapshot.revision || after.signature !== snapshot.signature) continue

    const dirty = diffChapters(index)
    if (dirty.length > 0) {
      await rescanChapters(bookId, index, dirty)
      const final = readSnapshot(bookId)
      if (
        final.revision !== snapshot.revision ||
        final.signature !== snapshot.signature ||
        diffChapters(index).length > 0
      ) {
        continue
      }
    }

    indexes.set(bookId, index)
    return index
  }

  // 持续写入 / 高频结构变更：以最新快照再建一次并直接返回（不写缓存，下次查询重新校验）。
  return buildIndex(bookId, readSnapshot(bookId))
}

/**
 * 取某书全部实体的首次登场位置（首次构建约数百 ms，之后走内存索引）。
 * 查询经模块级队列串行执行，避免同书并发构建。
 */
export function getFirstAppearances(bookId: string): Promise<FirstAppearanceMap> {
  const task = queue.then(async () => {
    const index = await refresh(bookId)
    return toFirstAppearanceMap(index)
  })
  // 队列吞掉失败，避免一次异常阻断后续查询；调用方仍收到原始 rejection。
  queue = task.catch(() => undefined)
  return task
}

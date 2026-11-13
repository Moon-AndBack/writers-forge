/**
 * 独立时间线场景卡「实体胶囊」批量匹配 hook（列表层一次算完，卡片只做纯渲染）。
 *
 * 口径：
 * - **来源**：每个场景取 `description`（富文本派生纯文本摘要，即胶囊匹配正文真源）；
 *   空正文场景不进入请求、也不产出条目；
 * - **批量**：走 `entities:matchMany`（主进程一次取匹配器 / 只算一次词表版本），
 *   避免每张时间线卡各发一次 `entities:match`；一次加载仅 1 次 `entities:revision`
 *   + 1 次批量匹配；
 * - **缓存**：复用 `ParagraphMatchCache`（键 = 书籍 + 词表版本 + 文本），未变更段直接
 *   命中，只有新文本进入批量请求；词表版本变化即整书失效；
 * - **可见性门控**：`enabled` 为 false（时间线视图 `display: none`、容器宽 0）时不发请求；
 *   已算出的结果保留，切回可见时直接复用（缓存命中时只发一次 revision）；
 * - **去重**：同一 `entityId` 只保留**首次出现**（段内按 `start` 升序，即原文出现顺序）；
 *   `name` 保留命中词原文（可能是别名，与剧情胶囊同口径）；
 * - **竞态**：带 `seq` 守卫，乱序 / 过期响应一律丢弃；IPC 失败静默为空 Map。
 */
import { useEffect, useRef, useState } from 'react'
import { ParagraphMatchCache } from '../entities/paragraphMatchCache'
import type { PlotBodyEntity } from './usePlotBodyEntities'
import type { PlotSceneRow } from './plotTree'

/** 跨挂载共享的段落匹配缓存（键含书籍 + 词表版本 + 文本；词表变更自动失效）。 */
const matchCache = new ParagraphMatchCache<PlotBodyEntity[]>()

/** 无结果时的恒等空 Map（引用稳定，避免下游按引用重复渲染）。 */
const EMPTY: Map<number, PlotBodyEntity[]> = new Map()

/** 按 `entityId` 去重（保留首次出现，顺序即入参顺序 = 原文出现顺序）。 */
function dedupeByEntityId(matches: readonly PlotBodyEntity[]): PlotBodyEntity[] {
  const seen = new Set<number>()
  const chips: PlotBodyEntity[] = []
  for (const match of matches) {
    if (seen.has(match.entityId)) continue
    seen.add(match.entityId)
    chips.push({
      entityId: match.entityId,
      name: match.name,
      type: match.type,
      subtypeId: match.subtypeId,
      presetKey: match.presetKey
    })
  }
  return chips
}

/**
 * 批量计算整条时间线每个场景的实体胶囊：`Map<sceneId, PlotBodyEntity[]>`。
 *
 * `bookId` 为空、场景列表为空或 `enabled` 为 false 时不发请求；返回值按书隔离，
 * 换书后上一本书的结果不会短暂套用到新列表上。
 */
export function useSceneEntityMatches(
  bookId: string,
  scenes: readonly PlotSceneRow[],
  enabled: boolean
): Map<number, PlotBodyEntity[]> {
  const [state, setState] = useState<{ bookId: string; map: Map<number, PlotBodyEntity[]> }>({
    bookId: '',
    map: EMPTY
  })
  // 请求序号：仅最新一轮结果可写回（丢弃乱序 / 过期响应）。
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    if (!enabled || bookId === '' || scenes.length === 0) return

    // 收集「场景 → 正文」并去重出本次需要的文本清单（多场景共用同一段文本时只匹配一次）。
    const textsByScene = new Map<number, string>()
    const uniqueTexts: string[] = []
    const seenTexts = new Set<string>()
    for (const scene of scenes) {
      const text = scene.description
      if (text.trim() === '') continue
      textsByScene.set(scene.id, text)
      if (seenTexts.has(text)) continue
      seenTexts.add(text)
      uniqueTexts.push(text)
    }
    // 全部场景都没有正文：异步清空旧结果（避免在 effect 内同步 setState），
    // 防止同一批场景 ID 继续套用上一轮已失效的胶囊。
    if (textsByScene.size === 0) {
      void Promise.resolve().then(() => {
        if (seq === seqRef.current) setState({ bookId, map: EMPTY })
      })
      return
    }

    /** 用「文本 → 匹配结果」组装每个场景的胶囊并写回（调用前已确认 seq 仍为最新）。 */
    const commit = (results: ReadonlyMap<string, PlotBodyEntity[]>): void => {
      if (seq !== seqRef.current) return
      const next = new Map<number, PlotBodyEntity[]>()
      for (const [sceneId, text] of textsByScene) {
        const matches = results.get(text)
        if (matches === undefined) continue
        const chips = dedupeByEntityId(matches)
        // 该场景正文没有命中实体：不写入 Map，卡片侧按「无胶囊」处理。
        if (chips.length > 0) next.set(sceneId, chips)
      }
      setState({ bookId, map: next })
    }

    /** 先查缓存，只把未命中的文本交给批量通道。 */
    const runWithRevision = (revision: string): void => {
      if (seq !== seqRef.current) return
      const results = new Map<string, PlotBodyEntity[]>()
      const missing: string[] = []
      for (const text of uniqueTexts) {
        const cached = matchCache.get(bookId, revision, text)
        if (cached !== undefined) results.set(text, cached)
        else missing.push(text)
      }
      if (missing.length === 0) {
        commit(results)
        return
      }
      void window.api.entities
        .matchMany(bookId, missing)
        .then((batches) => {
          if (seq !== seqRef.current) return
          batches.forEach((matches, index) => {
            const text = missing[index]
            if (text === undefined) return
            matchCache.set(bookId, revision, text, matches)
            results.set(text, matches)
          })
          commit(results)
        })
        .catch(() => {
          if (seq === seqRef.current) setState({ bookId, map: EMPTY })
        })
    }

    void window.api.entities
      .revision(bookId)
      .then(runWithRevision)
      .catch(() => {
        if (seq === seqRef.current) setState({ bookId, map: EMPTY })
      })
  }, [bookId, scenes, enabled])

  // 卸载清理：递增序号使在途响应作废（避免卸载后写回）。
  useEffect(() => {
    return () => {
      seqRef.current += 1
    }
  }, [])

  // 换书时返回恒等空 Map，不把上一本书的结果套到新列表上。
  return bookId === '' ? EMPTY : state.bookId === bookId ? state.map : EMPTY
}

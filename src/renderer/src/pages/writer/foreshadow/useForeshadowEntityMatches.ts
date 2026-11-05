/**
 * 伏笔卡「相关实体」批量匹配 hook（列表层一次算完，卡片只做纯渲染）。
 *
 * 口径：
 * - **来源**：每行取 `description`（富文本派生纯文本）+ `bodyQuote` + `outlineQuote` +
 *   `recoverQuote` 四段原文；四段全空的行走不到匹配（不进入请求、也不产出条目）；
 * - **批量**：走 `entities:matchMany`（主进程一次取匹配器 / 只算一次词表版本），避免每张卡
 *   每段各发一次 `entities:match`；某次加载只需 1 次 `entities:revision` + 1 次批量匹配；
 * - **缓存**：复用 `ParagraphMatchCache`（键 = 书籍 + 词表版本 + 文本），未变更段直接命中，
 *   只有新文本进入批量请求；词表版本变化即整书失效；
 * - **去重**：同一 `entityId` 只保留**首次出现**（描述 → 正文摘抄 → 大纲摘抄 → 回收摘抄，
 *   段内按 `start` 升序，即原文出现顺序）；`name` 保留命中词原文（可能是别名，与剧情胶囊同口径）；
 * - **竞态**：列表只在增删改后 `reload()`，不做防抖；但每轮请求带 `seq` 守卫，乱序 / 过期
 *   响应一律丢弃；IPC 失败静默为空 Map（下次 reload 会重试）。
 */
import { useEffect, useRef, useState } from 'react'
import type { EntityMatch } from '../../../../../preload/types/entities'
import type { WorldEntityType } from '../../../../../preload/types/worldEntity'
import { ParagraphMatchCache } from '../entities/paragraphMatchCache'
import type { ForeshadowRow } from './foreshadowTree'

/** 单张卡「相关实体」条目（胶囊渲染所需最小字段）。 */
export interface ForeshadowEntityChip {
  entityId: number
  /** 命中词原文（实体名或别名，与剧情胶囊同口径）。 */
  name: string
  type: WorldEntityType
  /** 预设子类路由键（空串 = 自定义分类 / 未分类，回落模块基色）。 */
  presetKey: string
}

/** 跨挂载共享的段落匹配缓存（键含书籍 + 词表版本 + 文本；词表变更自动失效）。 */
const matchCache = new ParagraphMatchCache<EntityMatch[]>()

/** 无结果时的恒等空 Map（引用稳定，避免下游按引用重复渲染）。 */
const EMPTY: ReadonlyMap<number, ForeshadowEntityChip[]> = new Map()

/** 行的四段匹配来源（空串 / 纯空白段跳过）。 */
function rowTexts(row: ForeshadowRow): string[] {
  return [row.description, row.bodyQuote, row.outlineQuote, row.recoverQuote].filter(
    (text) => text.trim() !== ''
  )
}

/** 按 `entityId` 去重（保留首次出现，顺序即入参顺序 = 原文出现顺序）。 */
function dedupeByEntityId(matches: readonly EntityMatch[]): ForeshadowEntityChip[] {
  const seen = new Set<number>()
  const chips: ForeshadowEntityChip[] = []
  for (const match of matches) {
    if (seen.has(match.entityId)) continue
    seen.add(match.entityId)
    chips.push({
      entityId: match.entityId,
      name: match.name,
      type: match.type,
      presetKey: match.presetKey
    })
  }
  return chips
}

/**
 * 批量计算伏笔列表每行的相关实体：`Map<rowId, ForeshadowEntityChip[]>`。
 *
 * `bookId` 为空或行列表为空时不发请求，返回恒等空 Map。返回值按书隔离：换书后
 * 上一本书的结果不会短暂套用到新列表上。
 */
export function useForeshadowEntityMatches(
  bookId: string,
  rows: readonly ForeshadowRow[]
): ReadonlyMap<number, ForeshadowEntityChip[]> {
  const [state, setState] = useState<{
    bookId: string
    map: ReadonlyMap<number, ForeshadowEntityChip[]>
  }>({ bookId: '', map: EMPTY })
  // 请求序号：仅最新一轮结果可写回（丢弃乱序 / 过期响应）。
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    if (bookId === '' || rows.length === 0) return

    // 收集「行 → 四段文本」并去重出本次需要的文本清单（多行共用同一句子时只匹配一次）。
    const textsByRow = new Map<number, string[]>()
    const uniqueTexts: string[] = []
    const seenTexts = new Set<string>()
    for (const row of rows) {
      const texts = rowTexts(row)
      if (texts.length === 0) continue
      textsByRow.set(row.id, texts)
      for (const text of texts) {
        if (seenTexts.has(text)) continue
        seenTexts.add(text)
        uniqueTexts.push(text)
      }
    }
    if (textsByRow.size === 0) return

    /** 用「文本 → 匹配结果」组装每行胶囊并写回（调用前已确认 seq 仍为最新）。 */
    const commit = (results: ReadonlyMap<string, EntityMatch[]>): void => {
      if (seq !== seqRef.current) return
      const next = new Map<number, ForeshadowEntityChip[]>()
      for (const [rowId, texts] of textsByRow) {
        const merged: EntityMatch[] = []
        for (const text of texts) {
          const matches = results.get(text)
          if (matches !== undefined) merged.push(...matches)
        }
        const chips = dedupeByEntityId(merged)
        // 该行四段都没有命中实体：不写入 Map，卡片侧按「无实体不渲染」处理。
        if (chips.length > 0) next.set(rowId, chips)
      }
      setState({ bookId, map: next })
    }

    /** 先查缓存，只把未命中的文本交给批量通道。 */
    const runWithRevision = (revision: string): void => {
      if (seq !== seqRef.current) return
      const results = new Map<string, EntityMatch[]>()
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
  }, [bookId, rows])

  // 卸载清理：递增序号使在途响应作废（避免卸载后写回）。
  useEffect(() => {
    return () => {
      seqRef.current += 1
    }
  }, [])

  // 换书 / 清空时返回恒等空 Map，不把上一本书的结果套到新列表上。
  return bookId === '' ? EMPTY : state.bookId === bookId ? state.map : EMPTY
}

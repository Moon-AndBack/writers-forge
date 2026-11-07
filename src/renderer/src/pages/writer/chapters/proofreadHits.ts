import { useSyncExternalStore } from 'react'
import type { CleanWordCategory } from '../../../../../preload/types/cleanWords'

/**
 * 违禁词命中的**模块级可订阅 store**（状态栏计数 / 后续「本章命中清单」共用）。
 *
 * 从 `proofreadMark.ts` 拆出：该文件已逼近 500 行硬上限，且「发布」与「消费」职责不同——
 * 扫描链路只发布一轮结果，状态栏与清单只读快照。
 *
 * 口径：
 * - **单 owner**（最后一次扫描为准）：多编辑器共存时后扫者接管，销毁时仅拥有者可清零；
 * - 快照 = `{ total, groups }`：`total` 为**命中处数**（状态栏胶囊文案沿用），
 *   `groups` 按 `word + category` 聚合出**词级**命中次数（供本章命中清单）；
 * - `groups` 保持**首次出现顺序**（不排序）：清单顺序随正文稳定，不因计数变化跳动；
 * - `getSnapshot` 必须返回**稳定引用**（`useSyncExternalStore` 硬要求，否则无限重渲染），
 *   故以内容签名比对：签名不变 → 引用不变、不通知订阅者。
 */

/** 词级命中分组（同一词在本章内命中的处数）。 */
export interface ProofreadHitGroup {
  /** 命中的违禁词原文（大小写敏感，按词表原样）。 */
  word: string
  /** 词条类别（同一词理论只有一种类别，聚合仍用组合键防御）。 */
  category: CleanWordCategory
  /** 该词在本章的命中处数（≥1）。 */
  count: number
}

/** 命中快照（`getSnapshot` 返回值：内容不变时保持同一引用）。 */
export interface ProofreadHitsSnapshot {
  /** 命中**处数**总和（= 一轮扫描得到的 hits 长度）。 */
  total: number
  /** 词级分组，首次出现顺序。 */
  groups: ProofreadHitGroup[]
}

/** 发布所需的最小命中信息（`ProofreadHit` 结构兼容，避免与 `proofreadMark` 循环依赖）。 */
export interface ProofreadHitSample {
  word: string
  category: CleanWordCategory
}

/** 空快照常量：初始态与 release 后复用同一引用，避免无谓的引用变更。 */
const EMPTY_SNAPSHOT: ProofreadHitsSnapshot = { total: 0, groups: [] }

/** 订阅者集合。 */
const listeners = new Set<() => void>()

/** 当前「计数拥有者」：null = 无主（未扫描 / 已释放）。 */
let owner: object | null = null

/** 当前快照（初始为空）。 */
let snapshot: ProofreadHitsSnapshot = EMPTY_SNAPSHOT

/**
 * 快照签名：`total|word:category:count,...`。
 *
 * 只用于**变更检测**，不参与展示。签名相同即视为内容未变；含 `total` 是为冗余兜底
 * （处数变化必然改变某个 `count`，多一层更抗未来改动）。
 */
function signatureOf(total: number, groups: readonly ProofreadHitGroup[]): string {
  return `${total}|${groups
    .map((group) => `${group.word}:${group.category}:${group.count}`)
    .join(',')}`
}

/** 当前快照签名（模块加载时与空快照对齐）。 */
let signature = signatureOf(0, EMPTY_SNAPSHOT.groups)

/** 按 `word + category` 聚合命中；保持首次出现顺序（Map 迭代序即插入序）。 */
function groupHits(hits: readonly ProofreadHitSample[]): ProofreadHitGroup[] {
  const index = new Map<string, ProofreadHitGroup>()
  for (const hit of hits) {
    // 组合键：同一词理论只有一种类别，防御性区分（避免跨类别错误合并）。
    const key = `${hit.word}\u0000${hit.category}`
    const group = index.get(key)
    if (group === undefined) {
      index.set(key, { word: hit.word, category: hit.category, count: 1 })
    } else {
      group.count += 1
    }
  }
  return [...index.values()]
}

/** 提交新快照：签名相同则原地返回（不换引用、不通知）。 */
function commit(total: number, groups: ProofreadHitGroup[]): void {
  const next = signatureOf(total, groups)
  if (next === signature) return
  signature = next
  snapshot = { total, groups }
  for (const listener of listeners) listener()
}

/**
 * 发布一轮扫描结果（扫描链路唯一入口）。
 *
 * `ownerRef` 为发起扫描的控制器：后扫者自动接管，保证「多编辑器时以最后一次扫描为准」。
 */
export function publishProofreadHits(ownerRef: object, hits: readonly ProofreadHitSample[]): void {
  owner = ownerRef
  commit(hits.length, groupHits(hits))
}

/** 释放计数（编辑器销毁时）：仅**当前拥有者**可清零，非拥有者调用无副作用。 */
export function releaseProofreadHits(ownerRef: object): void {
  if (owner !== ownerRef) return
  owner = null
  commit(0, [])
}

/** 订阅快照变化（`useSyncExternalStore` 用）。 */
export function subscribeProofreadHits(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 读取当前快照（稳定引用：内容不变即同一对象）。 */
export function getProofreadHits(): ProofreadHitsSnapshot {
  return snapshot
}

/** 读取当前命中处数（派生于快照，供状态栏胶囊沿用）。 */
export function getProofreadHitCount(): number {
  return snapshot.total
}

/** 读取当前词级分组（引用随快照更换）。 */
export function getProofreadHitGroups(): ProofreadHitGroup[] {
  return snapshot.groups
}

/** 命中处数 hook（状态栏用；0 表示无命中 / 无编辑器）。 */
export function useProofreadHitCount(): number {
  return useSyncExternalStore(subscribeProofreadHits, getProofreadHitCount, getProofreadHitCount)
}

/** 词级分组 hook（本章命中清单用；内容不变时返回同一引用）。 */
export function useProofreadHitGroups(): ProofreadHitGroup[] {
  return useSyncExternalStore(subscribeProofreadHits, getProofreadHitGroups, getProofreadHitGroups)
}

/** 完整快照 hook（需同时读 `total` 与 `groups` 时用，只订阅一次）。 */
export function useProofreadHits(): ProofreadHitsSnapshot {
  return useSyncExternalStore(subscribeProofreadHits, getProofreadHits, getProofreadHits)
}

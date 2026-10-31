/**
 * 实体详情内存缓存（悬停卡专用）：**容量淘汰 + 显式失效**两条出口；无 TTL。
 *
 * - 容量淘汰：LRU（命中即移至最新端），超出 `LRU_CAPACITY` 时淘汰最久未用项；
 * - 显式失效：实体被编辑 / 删除后由调用方调 `invalidateEntityDetail` 删单条，
 *   需要整体重取时调 `clearEntityDetailCache`；
 * - 不设 TTL：详情只存内存、进程退出即失效，按时间过期只会带来无谓的重复 IPC。
 * 禁 localStorage：详情含正文全文，不落盘。
 */
import type { WorldEntityDetail, WorldEntityType } from '../../../../../preload/types/worldEntity'

/** 实体类型（统一设定库五类，直接复用 preload 真源，避免本地字面量漂移）。 */
export type EntityType = WorldEntityType

/** 悬停卡展示所需字段：取自 `worldEntity.get` 的统一详情（仅保留展示子集，正文展示全文）。 */
export interface EntityDetail {
  id: number
  bookId: string
  name: string
  entityType: EntityType
  /** 子分类展示名（`worldEntity:get` 的 `subType`，来自 `world_subtypes.name`）；未分类为空串。当前未使用，保留备用。 */
  subType: string
  /** 子分类预设路由键（`worldEntity:get` 的 `presetKey`）：自定义分类 / 未分类为空串。当前未使用，保留备用。 */
  presetKey: string
  body: string
  /** 富文本正文 JSON（Tiptap doc）：用于逐段渲染，空串表示未富文本化。 */
  bodyJson: string
  aliases: string[]
  tags: string[]
  /** 关系摘要（主进程 `worldEntity:get` 已填充）：出边 + 入边，出边在前。 */
  relations: WorldEntityDetail['relations']
}

const LRU_CAPACITY = 200

const detailCache = new Map<number, EntityDetail | null>()

/** LRU 读取：命中即移至最新端；返回 null 表示「已缓存：无此实体」，undefined 表示未命中。 */
export function cacheGet(id: number): EntityDetail | null | undefined {
  if (!detailCache.has(id)) return undefined
  const value = detailCache.get(id) ?? null
  detailCache.delete(id)
  detailCache.set(id, value)
  return value
}

/** 写入并淘汰最久未用项（`null` 同样占位，用于缓存「无此实体」）。 */
export function cacheSet(id: number, detail: EntityDetail | null): void {
  if (detailCache.has(id)) detailCache.delete(id)
  detailCache.set(id, detail)
  while (detailCache.size > LRU_CAPACITY) {
    const oldest = detailCache.keys().next().value
    if (oldest === undefined) break
    detailCache.delete(oldest)
  }
}

/** 失效单条（实体被编辑 / 删除后调用）：下次悬停重新走 `worldEntity:get`。 */
export function invalidateEntityDetail(id: number): void {
  detailCache.delete(id)
}

/** 全清缓存（如切换书籍 / 批量写入后调用）。 */
export function clearEntityDetailCache(): void {
  detailCache.clear()
}

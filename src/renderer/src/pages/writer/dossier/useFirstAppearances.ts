/**
 * 实体首次登场（渲染层缓存 + 失效广播）。
 *
 * 数据真源在主进程 `match/firstAppearance.ts`：每次查询都会按词表版本、章节结构签名与
 * 各章内容版本校验，必要时整书构建或增量重扫，故渲染层只负责**按书缓存一次 IPC**，
 * 不再维护匹配逻辑。
 *
 * - 缓存：模块级 `Map<bookId, Entry>`，同书所有卡片（设定档案卡 / 悬停卡）共享；
 *   并发请求按 `inflight` 去重，避免每张卡各发一次。
 * - 失效：章节正文保存成功后由 `useChapterDoc` 派发 {@link FIRST_APPEARANCES_INVALIDATE_EVENT}；
 *   订阅方保留旧值并在后台重取（不闪空）。章节结构变化（改名 / 增删）不在广播范围内，
 *   重新进入设定库或重新触发查询后由主进程按结构签名自愈。
 * - 状态：`map === null` 表示尚无可用结果（加载中或失败，由 `loading` / `error` 区分）；
 *   调用方在此之前不应渲染「尚未登场」，避免把加载失败说成没登场。
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { FirstAppearanceMap } from '../../../../../preload/types/worldEntity'

export interface FirstAppearancesState {
  /** 全书映射；`null` = 尚无结果（加载中或失败）。键为实体 id。 */
  map: FirstAppearanceMap | null
  /** 是否正在请求（首次加载或后台刷新均置位；后台刷新时 `map` 保留旧值）。 */
  loading: boolean
  /** 最近一次请求是否失败（失败时保留旧 `map`，从未成功则 `map` 为 `null`）。 */
  error: boolean
}

/** 章节正文保存成功后派发：各书缓存保留旧值并后台重取。 */
export const FIRST_APPEARANCES_INVALIDATE_EVENT = 'wf:first-appearances-invalidate'

/** 初始状态：请求尚未发起，按「加载中」处理（调用方不渲染首登行）。 */
const INITIAL_STATE: FirstAppearancesState = { map: null, loading: true, error: false }

interface Entry {
  state: FirstAppearancesState
  listeners: Set<() => void>
  inflight: Promise<void> | null
  /** 请求期间又收到失效：结束后补一次，避免漏掉最新正文。 */
  stale: boolean
}

const entries = new Map<string, Entry>()

function entryOf(bookId: string): Entry {
  let entry = entries.get(bookId)
  if (entry === undefined) {
    entry = { state: INITIAL_STATE, listeners: new Set(), inflight: null, stale: false }
    entries.set(bookId, entry)
  }
  return entry
}

function emit(entry: Entry, state: FirstAppearancesState): void {
  entry.state = state
  for (const listener of entry.listeners) listener()
}

/**
 * 取一次全书映射（同书并发去重）。
 *
 * `force = true` 时即使已有缓存也重取；重取期间保留旧 `map`（后台刷新，不闪空）。
 * 失败时同样保留旧 `map`，仅置 `error`。
 */
function request(bookId: string, force: boolean): void {
  const entry = entryOf(bookId)
  if (entry.inflight !== null) {
    if (force) entry.stale = true
    return
  }
  if (!force && entry.state.map !== null) return

  const previous = entry.state
  // 首次加载才置 loading；已有旧值时后台刷新，不闪加载态。
  if (previous.map === null && !previous.loading) {
    emit(entry, { map: null, loading: true, error: false })
  }

  entry.inflight = window.api.worldEntity
    .firstAppearances(bookId)
    .then((map) => {
      emit(entry, { map, loading: false, error: false })
    })
    .catch(() => {
      emit(entry, { map: previous.map, loading: false, error: true })
    })
    .finally(() => {
      entry.inflight = null
      if (entry.stale) {
        entry.stale = false
        request(bookId, true)
      }
    })
}

/** 全套书缓存失效（章节正文保存成功后由写作页调用）：保留旧值并后台重取。 */
export function invalidateFirstAppearances(): void {
  for (const bookId of entries.keys()) request(bookId, true)
}

/**
 * 订阅某书的首次登场映射。
 *
 * `bookId` 为空时不发请求，返回初始加载态（调用方据此隐藏首登行）。
 * 同书多张卡共享同一份缓存与请求。
 */
export function useFirstAppearances(bookId: string | undefined): FirstAppearancesState {
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      if (!bookId) return () => undefined
      const entry = entryOf(bookId)
      entry.listeners.add(onChange)
      return () => {
        entry.listeners.delete(onChange)
      }
    },
    [bookId]
  )

  const getSnapshot = useCallback((): FirstAppearancesState => {
    if (!bookId) return INITIAL_STATE
    return entries.get(bookId)?.state ?? INITIAL_STATE
  }, [bookId])

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (!bookId) return undefined
    request(bookId, false)
    const onInvalidate = (): void => request(bookId, true)
    window.addEventListener(FIRST_APPEARANCES_INVALIDATE_EVENT, onInvalidate)
    return () => {
      window.removeEventListener(FIRST_APPEARANCES_INVALIDATE_EVENT, onInvalidate)
    }
  }, [bookId])

  return state
}

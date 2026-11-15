/**
 * 伏笔筛选条件（标题栏筛选行 ↔ 中栏卡片网格共享）。
 *
 * 与灵感 / 设定档案同范式：入口在标题栏筛选行（`ForeshadowFilterRow`，由
 * `ForeshadowActivityActions` 注册），消费方在中栏（`pages/writer/foreshadow/ForeshadowView`）
 * 与装配 hook。本模块沿用模块级外部 store 而非 React Context：读取 / 写入统一经
 * `useForeshadowFilters`，调用方不感知实现，也无需为单一域在 App 层新增 Provider。
 *
 * 口径：
 * - **分类 = 派生展示状态**（`deriveForeshadowStatus`）：`status` 为精确匹配状态，
 *   `null` 表示全部；四态互斥（回收优先），见 `src/shared/foreshadowStatus.ts`；
 * - `query` 为关键词，匹配名称 / 描述 / 回收备注 / 三处原文摘抄
 *   （见 `foreshadowFilterMatch.ts`）；
 * - 条件按书打标：换书后旧条件自然失效（store 只保留最近一次写入的书）；
 * - 条件在模块切换后仍保留，网格继续按既有条件过滤。
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { ForeshadowDisplayStatus } from '../../../../../shared/foreshadowStatus'

/** 伏笔筛选条件。 */
export interface ForeshadowFilterEntry {
  /** 派生状态筛选值（`null` = 全部）。 */
  status: ForeshadowDisplayStatus | null
  /** 关键词（匹配名称 + 描述 + 回收备注 + 三处摘抄）。 */
  query: string
}

/** 空条件（只读共享：任何写入都经 `setFilter` / `clearAll` 生成新对象，不原地修改）。 */
export const EMPTY_FORESHADOW_FILTER: ForeshadowFilterEntry = { status: null, query: '' }

/** 可筛选的派生状态清单（顺序即浮层 chip 顺序）。 */
export const FORESHADOW_FILTER_STATUSES: readonly ForeshadowDisplayStatus[] = [
  'drafting',
  'planted',
  'recovered',
  'abandoned'
]

/** 内部状态：条件连同所属书一起打标，换书后旧数据自然失效。 */
interface FilterStoreState {
  bookId: string
  filters: ForeshadowFilterEntry
}

let state: FilterStoreState = { bookId: '', filters: EMPTY_FORESHADOW_FILTER }
const listeners = new Set<() => void>()

function emit(next: FilterStoreState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 读取快照（`useSyncExternalStore` 要求引用稳定：仅写入时换对象）。 */
function getSnapshot(): FilterStoreState {
  return state
}

export interface ForeshadowFilterValue {
  /** 当前路由书 id（空串 = 非写作页 / 未解析到）。 */
  bookId: string
  /** 当前书的筛选条件（引用稳定：仅写入时换成新对象）。 */
  filters: ForeshadowFilterEntry
  /** 合并式更新条件（未提供的字段保持不变）。 */
  setFilter: (patch: Partial<ForeshadowFilterEntry>) => void
  /** 清空全部条件（状态回到「全部」、关键词清空）。 */
  clearAll: () => void
}

/**
 * 读取 / 写入指定书的伏笔筛选条件。
 *
 * 无 Provider 时也始终可用（外部 store），保证活动栏与中栏订阅同一份条件；
 * 传入的 `bookId` 与 store 标记不一致时读取结果回退为空条件（换书不串数据）。
 */
export function useForeshadowFilters(bookId: string): ForeshadowFilterValue {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const filters = snapshot.bookId === bookId ? snapshot.filters : EMPTY_FORESHADOW_FILTER

  const setFilter = useCallback(
    (patch: Partial<ForeshadowFilterEntry>): void => {
      const sameBook = state.bookId === bookId
      emit({
        bookId,
        filters: { ...(sameBook ? state.filters : EMPTY_FORESHADOW_FILTER), ...patch }
      })
    },
    [bookId]
  )

  const clearAll = useCallback((): void => {
    const sameBook = state.bookId === bookId
    if (sameBook && state.filters.status === null && state.filters.query === '') return
    emit({ bookId, filters: EMPTY_FORESHADOW_FILTER })
  }, [bookId])

  return { bookId, filters, setFilter, clearAll }
}

/**
 * 设定档案筛选条件的 Provider（挂在外壳层，`App.tsx` 中 `ActivityBarProvider` 之内）。
 *
 * `bookId` 真源：从 `useLocation().pathname` 解析 `/write/:bookId`。活动栏是 `Routes`
 * 的兄弟节点，`useParams()` 在此为空，故不能走路由参数钩子；解析口径与 `useParams`
 * 对 `/write/:bookId` 的取值一致（bookId 为 uuid，无需要解码的字符）。
 */
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { DossierModule } from '../../../shell/activityBarModules'
import {
  DEFAULT_FILTERS,
  DossierFilterContext,
  EMPTY_SUMMARIES,
  type DossierFilterContextValue,
  type DossierFilterEntry,
  type DossierFilters,
  type DossierFilterSummaries,
  type DossierFilterSummary
} from './dossierFilterContext'

/** 写作页路由判据：`/write/:bookId`（不吞后续路径段）。 */
const WRITE_PATH_PATTERN = /^\/write\/([^/?#]+)/

/** 从 pathname 解析当前书 id（非写作页返回空串）。 */
function parseBookIdFromPath(pathname: string): string {
  return WRITE_PATH_PATTERN.exec(pathname)?.[1] ?? ''
}

/** 条件存储：连同所属书一起打标，换书后旧条件自然失效（无需在 effect 里重置）。 */
interface FilterStore {
  bookId: string
  filters: DossierFilters
  /** 匹配汇总与 filters 同样按书打标：换书后旧计数不再展示。 */
  summary: DossierFilterSummaries
}

export function DossierFilterProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const bookId = parseBookIdFromPath(pathname)
  const [store, setStore] = useState<FilterStore>({
    bookId: '',
    filters: DEFAULT_FILTERS,
    summary: EMPTY_SUMMARIES
  })

  // 换书 / 进入书架后旧条件不再命中（口径同 `useDossierSubtypes` 的按书打标）。
  const sameBook = store.bookId === bookId
  const filters = sameBook ? store.filters : DEFAULT_FILTERS
  const summary = sameBook ? store.summary : EMPTY_SUMMARIES

  // 合并式更新：只替换目标模块的条目对象，其余模块保持原引用（下游 useMemo 不失效）。
  const setFilter = useCallback(
    (module: DossierModule, patch: Partial<DossierFilterEntry>): void => {
      setStore((prev) => {
        const same = prev.bookId === bookId
        const base = same ? prev.filters : DEFAULT_FILTERS
        return {
          bookId,
          filters: { ...base, [module]: { ...base[module], ...patch } },
          // 换书后旧汇总不再有效：与 filters 一起重置。
          summary: same ? prev.summary : EMPTY_SUMMARIES
        }
      })
    },
    [bookId]
  )

  // 匹配汇总上报：值未变化时直接返回旧 state，避免 `DossierView` 的 effect →
  // Context → 重渲染循环；换书时同样与 filters 一起重置。
  const setSummary = useCallback(
    (module: DossierModule, next: DossierFilterSummary): void => {
      setStore((prev) => {
        const same = prev.bookId === bookId
        const existing = same ? prev.summary[module] : undefined
        if (existing?.total === next.total && existing?.matched === next.matched) return prev
        return {
          bookId,
          filters: same ? prev.filters : DEFAULT_FILTERS,
          summary: { ...(same ? prev.summary : EMPTY_SUMMARIES), [module]: next }
        }
      })
    },
    [bookId]
  )

  const value = useMemo<DossierFilterContextValue>(
    () => ({ bookId, filters, setFilter, summary, setSummary }),
    [bookId, filters, setFilter, summary, setSummary]
  )

  return <DossierFilterContext.Provider value={value}>{children}</DossierFilterContext.Provider>
}

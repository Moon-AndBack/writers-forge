/**
 * 章节模块右栏「伏笔」页签的数据 hook：拉**全书**伏笔并按派生状态分组（纯只读）。
 *
 * 口径：
 * - **数据源**：`foreshadow.list(bookId)`（后端顺序 `updated_at DESC, id DESC`），
 *   只在 `active` 为真时发起请求（惰性加载）；`active` 变假时只失效在途请求，
 *   **不清空**已加载行——再次切回页签可直接显示上次结果，随后静默刷新；
 * - **分组**：`deriveForeshadowStatus(row)` 派生状态分四组，顺序固定为
 *   埋设中（planted）→ 已回收（recovered）→ 建设中（drafting）→ 已废弃（abandoned）：
 *   先把「正在兑现、需要跟」的放前面，再放「已闭环」，然后是「尚未埋设」，最后是
 *   「已搁置」；空分组由调用方跳过（本 hook 直接过滤掉）；
 * - **组内排序**：`updatedAt` 倒序、同刻按 `id` 倒序（与中栏列表同口径，最近改动的在前）；
 * - **刷新**：监听 `FORESHADOW_MARKS_REFRESH_EVENT`（创建 / 回收 / 删除 / 改名 / 废弃后
 *   由 `notifyForeshadowMarksRefresh` 广播），激活期间重新拉取；
 * - **竞态**：每轮请求带自增 `seq`，乱序 / 过期响应一律丢弃；卸载或切走页签时递增
 *   序号使在途响应作废；
 * - **换书**：返回值按 `bookId` 隔离，换书瞬间不把上一本书的分组短暂套到新书上；
 * - **失败**：保留上一轮成功数据（首次加载失败则落空态），下次刷新事件 / 重进页签重试。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ForeshadowDisplayStatus } from '../../../../../shared/foreshadowStatus'
import { deriveForeshadowStatus } from '../../../../../shared/foreshadowStatus'
import { FORESHADOW_MARKS_REFRESH_EVENT } from '../../../components/editor/useForeshadowMarks'
import type { ForeshadowRow } from '../foreshadow/foreshadowTree'

/** 分组展示顺序（见文件头：埋设中 → 已回收 → 建设中 → 已废弃）。 */
export const FORESHADOW_OVERVIEW_GROUP_ORDER = [
  'planted',
  'recovered',
  'drafting',
  'abandoned'
] as const satisfies readonly ForeshadowDisplayStatus[]

/** 单个状态分组（`rows` 已按组内规则排序，且一定非空）。 */
export interface ForeshadowOverviewGroup {
  status: ForeshadowDisplayStatus
  rows: ForeshadowRow[]
}

/** 组内排序：`updatedAt` 倒序，同一时刻按 `id` 倒序。 */
function compareRows(a: ForeshadowRow, b: ForeshadowRow): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1
  return b.id - a.id
}

/** 按派生状态分组并过滤空组（纯函数，供 hook 与单测式复用）。 */
export function groupBookForeshadows(rows: readonly ForeshadowRow[]): ForeshadowOverviewGroup[] {
  const buckets = new Map<ForeshadowDisplayStatus, ForeshadowRow[]>()
  for (const status of FORESHADOW_OVERVIEW_GROUP_ORDER) buckets.set(status, [])
  for (const row of rows) buckets.get(deriveForeshadowStatus(row))?.push(row)
  return FORESHADOW_OVERVIEW_GROUP_ORDER.map((status) => ({
    status,
    rows: (buckets.get(status) ?? []).sort(compareRows)
  })).filter((group) => group.rows.length > 0)
}

export interface BookForeshadowGroups {
  /** 非空分组（已按固定顺序排列）。 */
  groups: ForeshadowOverviewGroup[]
  /** 全书伏笔条数（空态判定）。 */
  total: number
  /** 是否有在途请求（列表非空时不闪加载态）。 */
  loading: boolean
}

/** 无数据时的恒等空数组（换书瞬间复用，引用稳定）。 */
const EMPTY_ROWS: ForeshadowRow[] = []

/**
 * 拉全书伏笔并按派生状态分组。`bookId` 为空或页签未激活时不发请求。
 */
export function useBookForeshadowGroups(bookId: string, active: boolean): BookForeshadowGroups {
  const [state, setState] = useState<{ bookId: string; rows: ForeshadowRow[] }>({
    bookId: '',
    rows: []
  })
  const [loading, setLoading] = useState(false)
  // 请求序号：仅最新一轮结果可写回（丢弃乱序 / 过期响应）。
  const seqRef = useRef(0)

  useEffect(() => {
    if (!active || bookId === '') return

    const load = (): void => {
      const seq = ++seqRef.current
      setLoading(true)
      void window.api.foreshadow
        .list(bookId)
        .then((next) => {
          if (seq !== seqRef.current) return
          setState({ bookId, rows: next })
          setLoading(false)
        })
        .catch(() => {
          if (seq !== seqRef.current) return
          // 保留上一轮成功数据；首次失败自然落空态（下次事件 / 重进页签重试）。
          setLoading(false)
        })
    }

    load()
    window.addEventListener(FORESHADOW_MARKS_REFRESH_EVENT, load)
    return () => {
      // 失效在途请求；rows 保留（见文件头：切走页签不清空）。
      seqRef.current += 1
      window.removeEventListener(FORESHADOW_MARKS_REFRESH_EVENT, load)
    }
  }, [bookId, active])

  // 换书瞬间按空列表分组，避免上一本书的分组短暂套到新书上。
  const groups = useMemo(
    () => groupBookForeshadows(state.bookId === bookId ? state.rows : EMPTY_ROWS),
    [state, bookId]
  )
  const total = state.bookId === bookId ? state.rows.length : 0
  return { groups, total, loading }
}

export default useBookForeshadowGroups

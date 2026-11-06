/**
 * 伏笔筛选的纯派生：派生状态 + 关键词 → 可见行。
 *
 * 与 UI 解耦（无 hook / 无状态），供 `useForeshadowBundle` 以 `useMemo` 调用；
 * 调用方必须保持全量 `allRows`（选中项回退依赖全量），只把返回值喂给中栏网格。
 *
 * 口径：
 * - 状态：`deriveForeshadowStatus(row)` 精确匹配（四态互斥，回收优先）；
 * - 关键词：名称 + 描述 + 回收备注 + 正文埋点 / 大纲埋点 / 回收点三处摘抄，
 *   统一 `toLowerCase()` 后做 `includes`，`query` 先 `trim()`；空关键词不参与过滤；
 * - 无任何条件时原样返回 `rows`（保持引用）。
 */
import { deriveForeshadowStatus } from '../../../../../shared/foreshadowStatus'
import type { ForeshadowDisplayStatus } from '../../../../../shared/foreshadowStatus'
import type { ForeshadowRow } from './foreshadowTree'

export function filterForeshadowRows(
  rows: ForeshadowRow[],
  status: ForeshadowDisplayStatus | null,
  query: string
): ForeshadowRow[] {
  const keyword = query.trim().toLowerCase()
  if (status === null && keyword === '') return rows
  return rows.filter((row) => {
    if (status !== null && deriveForeshadowStatus(row) !== status) return false
    if (keyword === '') return true
    return (
      row.title.toLowerCase().includes(keyword) ||
      row.description.toLowerCase().includes(keyword) ||
      row.recoveryNote.toLowerCase().includes(keyword) ||
      row.bodyQuote.toLowerCase().includes(keyword) ||
      row.outlineQuote.toLowerCase().includes(keyword) ||
      row.recoverQuote.toLowerCase().includes(keyword)
    )
  })
}

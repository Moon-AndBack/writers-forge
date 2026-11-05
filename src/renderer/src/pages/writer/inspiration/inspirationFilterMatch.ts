/**
 * 灵感筛选的纯派生：标签 + 关键词 → 可见行。
 *
 * 与 UI 解耦（无 hook / 无状态），供 `useInspirationBundle` 以 `useMemo` 调用；
 * 调用方必须保持全量 `allRows`（选中项回退依赖全量），只把返回值喂给中栏网格。
 *
 * 口径：
 * - 标签：精确匹配 `row.tags.includes(tag)`；
 * - 关键词：`title` + `content` + `tags.join(' ')` 统一 `toLowerCase()` 后做 `includes`，
 *   `query` 先 `trim()`；空关键词不参与过滤；
 * - 无任何条件时原样返回 `rows`（保持引用）。
 */
import type { InspirationRow } from './inspirationTree'

export function filterInspirationRows(
  rows: InspirationRow[],
  tag: string | null,
  query: string
): InspirationRow[] {
  const keyword = query.trim().toLowerCase()
  if (tag === null && keyword === '') return rows
  return rows.filter((row) => {
    if (tag !== null && !row.tags.includes(tag)) return false
    if (keyword === '') return true
    return (
      row.title.toLowerCase().includes(keyword) ||
      row.content.toLowerCase().includes(keyword) ||
      row.tags.join(' ').toLowerCase().includes(keyword)
    )
  })
}

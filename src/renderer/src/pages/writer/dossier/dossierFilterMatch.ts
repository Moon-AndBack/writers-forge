/**
 * 设定档案筛选的纯派生：子类 + 关键词 → 可见行。
 *
 * 与 UI 解耦（无 hook / 无状态），供 `DossierView` 以 `useMemo` 调用；调用方必须保持
 * `rows` 全量（选中回退与弹窗计数都依赖全量），只把返回值喂给网格渲染。
 *
 * 关键词口径（本次变更）：只匹配**名称 + 别名**，不扫正文——筛选入口在活动栏，
 * 命中正文会让「为什么这张卡出现」难以解释；正文检索由正文内的浏览器查找承担。
 */
import type { DossierRow } from './dossierTree'
import { FILTER_ALL } from './dossierFilterContext'

/** 按子类筛选值 + 关键词派生可见行；无任何条件时原样返回 `rows`（保持引用）。 */
export function filterDossierRows(
  rows: DossierRow[],
  subtype: string,
  query: string
): DossierRow[] {
  const keyword = query.trim().toLowerCase()
  if (subtype === FILTER_ALL && keyword === '') return rows
  return rows.filter((row) => {
    if (subtype !== FILTER_ALL && String(row.subtypeId) !== subtype) {
      return false
    }
    if (keyword === '') return true
    return (
      row.name.toLowerCase().includes(keyword) ||
      row.aliases.some((alias) => alias.toLowerCase().includes(keyword))
    )
  })
}

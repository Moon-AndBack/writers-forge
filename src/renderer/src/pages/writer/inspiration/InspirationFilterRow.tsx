/**
 * 灵感模块标题栏筛选行：标签下拉 + 搜索框。
 *
 * 位置由 `InspirationActivityActions` 注册进标题栏动作组（加号 ｜ 筛选行）。
 * 条件真源在 App 级 `InspirationFilterProvider`（与设定档案同范式）。选项 =
 * 内置预置 ∪ 全书已用标签（`mergeInspirationTags`，去重保序），首项「全部」；
 * 当前标签若已不在集合（标签被改 / 删），临时并入末尾而不是回落「全部」——
 * 避免条件被静默改写。
 *
 * 下拉用空串作「全部」哨兵：标签恒非空（主进程 `normalizeInspirationTags` 丢弃空串），
 * 不会与真实标签冲突。搜索匹配标题 / 内容 / 标签；草稿 / 防抖 / IME 由通用行
 * `components/TitleBarFilterRow` 承接。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import TitleBarFilterRow from '../../../components/TitleBarFilterRow'
import type { TitleBarFilterSelect } from '../../../components/TitleBarFilterRow'
import { useInspirationFilters } from './inspirationFilterContext'
import { mergeInspirationTags } from './inspirationPresets'

/** 下拉「全部」哨兵值：标签恒非空，空串不会与真实标签冲突。 */
const FILTER_ALL = ''

export default function InspirationFilterRow() {
  const { t } = useTranslation('inspiration')
  const { filters, setFilter, tags } = useInspirationFilters()

  const options = useMemo(() => {
    const merged = mergeInspirationTags(tags)
    // 当前标签已不在集合：临时并入，不回落「全部」。
    if (filters.tag !== null && !merged.includes(filters.tag)) merged.push(filters.tag)
    return [
      { value: FILTER_ALL, label: t('filter.all') },
      ...merged.map((tag) => ({ value: tag, label: tag }))
    ]
  }, [filters.tag, t, tags])

  const select: TitleBarFilterSelect = {
    value: filters.tag ?? FILTER_ALL,
    options,
    ariaLabel: t('filter.tagAria'),
    onChange: (next) => setFilter({ tag: next === FILTER_ALL ? null : next })
  }

  return (
    <TitleBarFilterRow
      select={select}
      query={filters.query}
      onQueryCommit={(next) => setFilter({ query: next })}
      search={{ placeholder: t('filter.searchPlaceholder'), ariaLabel: t('filter.searchAria') }}
    />
  )
}

/**
 * 伏笔模块标题栏筛选行：状态下拉 + 搜索框。
 *
 * 位置由 `ForeshadowActivityActions` 注册进标题栏动作组（加号 ｜ 筛选行）。
 * 状态真源在模块级外部 store（`foreshadowFilterContext`）：选项为派生展示状态四档
 * （顺序 `FORESHADOW_FILTER_STATUSES`），首项「全部」；store 的 `status: null`
 * 映射为下拉哨兵值 `FILTER_ALL`，回写时再还原。
 *
 * 搜索匹配名称 / 描述 / 回收备注 / 三处原文摘抄（口径见 `foreshadowFilterMatch`）；
 * 草稿 / 防抖 / IME 由通用行 `components/TitleBarFilterRow` 承接。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import TitleBarFilterRow from '../../../components/TitleBarFilterRow'
import type { TitleBarFilterSelect } from '../../../components/TitleBarFilterRow'
import type { ForeshadowDisplayStatus } from '../../../../../shared/foreshadowStatus'
import { FORESHADOW_FILTER_STATUSES, useForeshadowFilters } from './foreshadowFilterContext'
import { FORESHADOW_STATUS_LABEL_KEYS } from './foreshadowTree'

/** 下拉「全部」哨兵值（派生状态枚举不含此值，`null` 与它互转）。 */
const FILTER_ALL = 'all'

export interface ForeshadowFilterRowProps {
  /** 当前路由书 id（筛选条件按书打标）。 */
  bookId: string
}

export default function ForeshadowFilterRow({ bookId }: ForeshadowFilterRowProps) {
  const { t } = useTranslation('foreshadow')
  const { filters, setFilter } = useForeshadowFilters(bookId)

  const options = useMemo(
    () => [
      { value: FILTER_ALL, label: t('filter.all') },
      ...FORESHADOW_FILTER_STATUSES.map((status) => ({
        value: status,
        label: t(FORESHADOW_STATUS_LABEL_KEYS[status])
      }))
    ],
    [t]
  )

  const select: TitleBarFilterSelect = {
    value: filters.status ?? FILTER_ALL,
    options,
    ariaLabel: t('filter.statusAria'),
    onChange: (next) =>
      setFilter({ status: next === FILTER_ALL ? null : (next as ForeshadowDisplayStatus) })
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

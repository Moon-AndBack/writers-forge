import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Dropdown, SearchInput, Segmented, useTooltip } from '../../components/ui'
import type { DropdownItem } from '../../components/ui'
import { SHELF_FILTERS, SHELF_SORTS, type ShelfFilter, type ShelfSort } from './data'

export interface BookshelfToolbarProps {
  /** 当前筛选 */
  filter: ShelfFilter
  /** 筛选变更 */
  onFilterChange: (filter: ShelfFilter) => void
  /** 搜索关键词 */
  query: string
  /** 关键词变更 */
  onQueryChange: (query: string) => void
  /** 当前排序 */
  sort: ShelfSort
  /** 排序变更 */
  onSortChange: (sort: ShelfSort) => void
}

function SortIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/**
 * 书架工具条：状态标签页 + 搜索框 + 排序下拉。
 * 视觉对齐原型 `.shelf-toolbar`，控件复用组件库（Segmented / SearchInput / Dropdown）。
 */
export function BookshelfToolbar({
  filter,
  onFilterChange,
  query,
  onQueryChange,
  sort,
  onSortChange
}: BookshelfToolbarProps) {
  const { t } = useTranslation('bookshelf')
  const sortLabel = t(
    SHELF_SORTS.find((option) => option.value === sort)?.labelKey ?? 'sort.fallback'
  )
  const sortItems: DropdownItem[] = SHELF_SORTS.map((option) => ({
    key: option.value,
    label: t(option.labelKey),
    checked: option.value === sort,
    onSelect: () => onSortChange(option.value)
  }))

  const {
    anchorRef: sortAnchorRef,
    anchorProps: sortAnchorProps,
    tooltip: sortTooltip
  } = useTooltip<HTMLSpanElement>({ content: t('sort.tooltip'), placement: 'bottom' })

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onQueryChange(event.target.value)
  }

  return (
    <div className="shelf-toolbar">
      <Segmented
        aria-label={t('filter.aria')}
        options={SHELF_FILTERS.map((option) => ({
          value: option.value,
          label: t(option.labelKey)
        }))}
        value={filter}
        onChange={onFilterChange}
      />

      <span className="shelf-toolbar__spacer" />

      <div className="shelf-search">
        <SearchInput
          aria-label={t('search.aria')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={handleQueryChange}
          onClear={() => onQueryChange('')}
        />
      </div>

      <Dropdown
        align="end"
        items={sortItems}
        trigger={
          <span
            ref={sortAnchorRef}
            className="shelf-sort__trigger"
            aria-describedby={sortAnchorProps['aria-describedby']}
            onMouseEnter={sortAnchorProps.onMouseEnter}
            onMouseLeave={sortAnchorProps.onMouseLeave}
            onFocus={sortAnchorProps.onFocus}
            onBlur={sortAnchorProps.onBlur}
          >
            <SortIcon />
            <span className="shelf-sort__label">{sortLabel}</span>
            <ChevronIcon />
          </span>
        }
      />
      {sortTooltip}
    </div>
  )
}

export default BookshelfToolbar

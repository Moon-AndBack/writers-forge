import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Segmented, Select, Switch, Tag } from '../ui'
import type { SegmentedOption, SelectOption } from '../ui'
import type { CleanWordRow } from '../../../../preload/types/cleanWords'
import { CATEGORY_LABEL_KEYS } from './cleanWordsMeta'
import type { CategoryFilter, SourceFilter } from './cleanWordsMeta'
import { styles } from './cleanWordsStyles'

export interface CleanWordsTableProps {
  sourceFilter: SourceFilter
  categoryFilter: CategoryFilter
  query: string
  sourceOptions: ReadonlyArray<SegmentedOption<SourceFilter>>
  categoryOptions: SelectOption[]
  /** 当前已挂载的行（分批渲染后）。 */
  visibleRows: CleanWordRow[]
  /** 筛选后的总行数（用于「已显示 N / 共 M」与「显示更多」的剩余量）。 */
  total: number
  loaded: boolean
  failed: boolean
  onSourceChange: (value: SourceFilter) => void
  onCategoryChange: (value: string) => void
  onQueryChange: (value: string) => void
  onRowToggle: (row: CleanWordRow) => (event: ChangeEvent<HTMLInputElement>) => void
  onDelete: (row: CleanWordRow) => Promise<void>
  onShowMore: () => void
}

/**
 * 违禁词表：三重筛选（来源 / 类别 / 关键词）+ 分批渲染 + 空态（加载中 / 失败 / 无结果）。
 * 内置词（`source = 'builtin'`）只能启用 / 禁用，仅用户自建词可删除（与主进程
 * `deleteCleanWord` 口径一致：内置词删除后会被下次词库更新写回）。
 */
export function CleanWordsTable({
  sourceFilter,
  categoryFilter,
  query,
  sourceOptions,
  categoryOptions,
  visibleRows,
  total,
  loaded,
  failed,
  onSourceChange,
  onCategoryChange,
  onQueryChange,
  onRowToggle,
  onDelete,
  onShowMore
}: CleanWordsTableProps) {
  const { t } = useTranslation('chapters')

  return (
    <>
      <div style={styles.filtersRow}>
        <Segmented
          size="sm"
          value={sourceFilter}
          options={sourceOptions}
          aria-label={t('cleanWords.sourceAria')}
          onChange={onSourceChange}
        />
        <div style={{ width: 132 }}>
          <Select
            size="sm"
            value={categoryFilter}
            options={categoryOptions}
            ariaLabel={t('cleanWords.categoryAria')}
            onChange={onCategoryChange}
          />
        </div>
        <Input
          size="sm"
          style={styles.search}
          value={query}
          aria-label={t('cleanWords.searchAria')}
          placeholder={t('cleanWords.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <p style={styles.muted}>{t('cleanWords.shownCount', { shown: visibleRows.length, total })}</p>
      <div style={styles.list} role="list">
        {visibleRows.length === 0 ? (
          <p style={failed ? styles.error : styles.tip}>
            {!loaded
              ? t('cleanWords.loading')
              : failed
                ? t('cleanWords.loadFailed')
                : t('cleanWords.empty')}
          </p>
        ) : null}
        {visibleRows.map((row) => (
          <div key={row.id} style={styles.row} role="listitem">
            <span
              style={{
                ...styles.word,
                color: row.enabled ? 'var(--text)' : 'var(--text-mute)'
              }}
            >
              {row.word}
            </span>
            <Tag>{t(CATEGORY_LABEL_KEYS[row.category])}</Tag>
            <Switch
              size="sm"
              checked={row.enabled}
              aria-label={t('cleanWords.toggleAria', { word: row.word })}
              onChange={onRowToggle(row)}
            />
            {row.source === 'user' ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('cleanWords.deleteAria', { word: row.word })}
                onClick={() => void onDelete(row)}
              >
                {t('cleanWords.delete')}
              </Button>
            ) : null}
          </div>
        ))}
        {visibleRows.length < total ? (
          <div style={styles.more}>
            <Button size="sm" variant="ghost" onClick={onShowMore}>
              {t('cleanWords.showMore', { rest: total - visibleRows.length })}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}

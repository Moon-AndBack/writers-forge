import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/cn'
import { Button, IconButton, Input, Segmented, Select, Switch, Tag } from '../ui'
import type { SegmentedOption, SelectOption } from '../ui'
import { SearchIcon, TrashIcon } from '../icons'
import { EmptyState } from '../EmptyState'
import { LoadErrorState } from '../LoadErrorState'
import { useConfirm } from '../../pages/writer/chapters/useConfirm'
import type { CleanWordRow } from '../../../../preload/types/cleanWords'
import { CATEGORY_LABEL_KEYS } from './cleanWordsMeta'
import type { CategoryFilter, SourceFilter } from './cleanWordsMeta'

export interface CleanWordsTableProps {
  sourceFilter: SourceFilter
  categoryFilter: CategoryFilter
  query: string
  /** 是否有任一筛选生效（决定空态文案：真的没词条 / 筛选无结果）。 */
  hasActiveFilter: boolean
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
  /** 失败态「重试」：重新发起词表读取。 */
  onRetry: () => void
}

/**
 * 违禁词表：三重筛选（来源 / 类别 / 关键词）+ 分批渲染 + 空态（加载中 / 失败 / 无结果）。
 * 内置词（`source = 'builtin'`）只能启用 / 禁用，仅用户自建词可删除（与主进程
 * `deleteCleanWord` 口径一致：内置词删除后会被下次词库更新写回）。
 *
 * 样式类名 `cw-*` 见 styles/components/clean-words.css（由 `CleanWordsDialog` 引入）。
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
  hasActiveFilter,
  onSourceChange,
  onCategoryChange,
  onQueryChange,
  onRowToggle,
  onDelete,
  onShowMore,
  onRetry
}: CleanWordsTableProps) {
  const { t } = useTranslation('chapters')
  const confirm = useConfirm()

  /** 删除前二次确认；确认后才交给数据层（`onDelete` 内含 IPC 与 toast）。 */
  const handleDelete = (row: CleanWordRow): void => {
    confirm.request(
      {
        title: t('cleanWords.deleteConfirmTitle'),
        message: t('cleanWords.deleteConfirmMessage', { word: row.word }),
        confirmText: t('cleanWords.delete'),
        tone: 'danger'
      },
      () => onDelete(row)
    )
  }

  return (
    <>
      <div className="cw-filters">
        <Segmented
          size="sm"
          value={sourceFilter}
          options={sourceOptions}
          aria-label={t('cleanWords.sourceAria')}
          onChange={onSourceChange}
        />
        <div className="cw-filters__category">
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
          className="cw-filters__search"
          value={query}
          aria-label={t('cleanWords.searchAria')}
          placeholder={t('cleanWords.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <p className="cw-count" aria-live="polite" aria-atomic="true">
        {t('cleanWords.shownCount', { shown: visibleRows.length, total })}
      </p>
      {visibleRows.length === 0 ? (
        /* 三态互斥且均无行：加载（role=status）/ 失败（LoadErrorState 自带
           role=alert + 重试）/ 空（区分「真的没词条」与「筛选无结果」）。
           空态不进 role=list 容器，避免读屏遇到空列表。 */
        !loaded ? (
          <p className="cw-loading" role="status">
            {t('cleanWords.loading')}
          </p>
        ) : failed ? (
          <LoadErrorState compact className="cw-empty" onRetry={onRetry} />
        ) : hasActiveFilter ? (
          <EmptyState
            compact
            className="cw-empty"
            icon={<SearchIcon />}
            title={t('cleanWords.empty')}
            description={t('cleanWords.emptyFilterDesc')}
          />
        ) : (
          <EmptyState
            compact
            className="cw-empty"
            title={t('cleanWords.emptyNoWords')}
            description={t('cleanWords.emptyNoWordsDesc')}
          />
        )
      ) : (
        <div className="cw-list" role="list">
          {visibleRows.map((row) => (
            <div key={row.id} className="cw-row" role="listitem">
              <span className={cn('cw-row__word', !row.enabled && 'is-off')}>{row.word}</span>
              <Tag>{t(CATEGORY_LABEL_KEYS[row.category])}</Tag>
              <Switch
                size="sm"
                checked={row.enabled}
                aria-label={t('cleanWords.toggleAria', { word: row.word })}
                onChange={onRowToggle(row)}
              />
              {row.source === 'user' ? (
                <IconButton
                  size="sm"
                  tone="danger"
                  label={t('cleanWords.deleteAria', { word: row.word })}
                  tooltipPlacement="top"
                  onClick={() => handleDelete(row)}
                >
                  <TrashIcon />
                </IconButton>
              ) : null}
            </div>
          ))}
          {visibleRows.length < total ? (
            <div className="cw-more">
              <Button size="sm" variant="ghost" onClick={onShowMore}>
                {t('cleanWords.showMore', { rest: total - visibleRows.length })}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {confirm.node}
    </>
  )
}

import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/cn'
import { Button, IconButton, Switch, Tag } from '../ui'
import { SearchIcon, TrashIcon } from '../icons'
import { EmptyState } from '../EmptyState'
import { LoadErrorState } from '../LoadErrorState'
import { useConfirm } from '../../pages/writer/chapters/useConfirm'
import type { CleanWordRow } from '../../../../preload/types/cleanWords'
import { CATEGORY_LABEL_KEYS } from './cleanWordsMeta'

export interface CleanWordsTableProps {
  /** 是否有任一筛选生效（决定空态文案：真的没词条 / 筛选无结果）。 */
  hasActiveFilter: boolean
  /** 当前已挂载的行（分批渲染后）。 */
  visibleRows: CleanWordRow[]
  /** 筛选后的总行数（用于「显示更多」的剩余量）。 */
  total: number
  loaded: boolean
  failed: boolean
  onRowToggle: (row: CleanWordRow) => (event: ChangeEvent<HTMLInputElement>) => void
  onDelete: (row: CleanWordRow) => Promise<void>
  onShowMore: () => void
  /** 失败态「重试」：重新发起词表读取。 */
  onRetry: () => void
}

/**
 * 违禁词表结果区（弹窗第 2 行）：分批渲染 + 空态（加载中 / 失败 / 无结果）。
 * 筛选与计数已上移到 `CleanWordsDialog`（三行布局：筛选 / 结果 / 添加）。
 * 内置词（`source = 'builtin'`）只能启用 / 禁用，仅用户自建词可删除（与主进程
 * `deleteCleanWord` 口径一致：内置词删除后会被下次词库更新写回）。
 *
 * 样式类名 `cw-*` 见 styles/components/clean-words.css（由 `CleanWordsDialog` 引入）。
 */
export function CleanWordsTable({
  visibleRows,
  total,
  loaded,
  failed,
  hasActiveFilter,
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

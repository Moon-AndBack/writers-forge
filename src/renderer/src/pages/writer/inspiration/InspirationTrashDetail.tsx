/**
 * 灵感回收站详情（只读）。
 *
 * 数据来自 `inspiration:listDeleted` 返回的完整 `InspirationRow`：标签已反序列化、
 * `content` 为纯文本真源，选中即渲染，无需额外 IPC。
 *
 * 正文按 `white-space: pre-wrap` 渲染（复用右栏灵感只读详情的
 * `.inspiration-readonly__content`），保留换行与首尾空白；不显示字数。
 */
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag } from '../../../components/ui'
import { resolveLocale } from '../../../i18n/config'
import { formatDateTime } from '../../../lib/relativeTime'
import type { InspirationRow } from './inspirationTree'

export interface InspirationTrashDetailProps {
  /** 当前选中的回收站灵感行。 */
  row: InspirationRow
}

/** 灵感回收站详情：标题 / 标签 / 完整正文 / 时间戳。 */
export function InspirationTrashDetail({ row }: InspirationTrashDetailProps): ReactElement {
  const { t, i18n } = useTranslation('inspiration')
  const { t: tChapters } = useTranslation('chapters')
  const locale = resolveLocale(i18n.language)

  const title = row.title.trim() === '' ? t('field.untitled') : row.title
  const content = row.content
  const deletedAt = formatDateTime(row.deletedAt, locale) || (row.deletedAt ?? '')
  const createdAt = formatDateTime(row.createdAt, locale) || row.createdAt
  const updatedAt = formatDateTime(row.updatedAt, locale) || row.updatedAt

  return (
    <div className="trash-detail__pane">
      <header className="trash-detail__head">
        <div className="trash-detail__title">{title}</div>
        <div className="trash-detail__meta">
          <span>{tChapters('trash.detail.deletedAt', { time: deletedAt })}</span>
          <span>{t('trash.detail.createdAt', { time: createdAt })}</span>
          <span>{t('trash.detail.updatedAt', { time: updatedAt })}</span>
        </div>
      </header>

      {row.tags.length === 0 ? null : (
        <div className="inspiration-readonly__section">
          <div className="inspiration-readonly__label">{t('field.tags')}</div>
          <div
            className="inspiration-readonly__tags wf-readonly-block"
            role="group"
            aria-label={t('field.tags')}
          >
            {row.tags.map((tag, index) => (
              <Tag key={`${tag}-${index}`} tone="neutral" className="inspiration-card__tag">
                {tag}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <div className="inspiration-readonly__section">
        <div className="inspiration-readonly__label">{t('field.content')}</div>
        <div className="inspiration-readonly__content wf-readonly-block">
          {content.trim() === '' ? (
            <span className="inspiration-readonly__empty">{t('field.contentEmpty')}</span>
          ) : (
            content
          )}
        </div>
      </div>
    </div>
  )
}

export default InspirationTrashDetail

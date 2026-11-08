/**
 * 伏笔回收站详情（只读）。
 *
 * 数据来自 `foreshadow:listDeleted` 返回的完整 `ForeshadowRow`：描述富文本、三套锚点
 * 快照、回收备注与时间戳均已随行返回，选中即渲染，无需额外 IPC。
 *
 * 锚点目标（章 / 大纲条目）可能仍在回收站，而 `ForeshadowRow` 只保存目标 id + 原文快照，
 * 不含目标名称；这里**不做「失效」断言**，只中性展示锚点类型与原文摘录，避免把
 * 「目标也在回收站」误判为锚点失效。
 *
 * 描述走 `ReadonlyRichText`，刻意不使用 `EntityReadonlyRichText`：回收站预览不需要
 * 为整篇描述建立实体词表匹配；老数据（`description_json` 为空 / 坏 JSON）经
 * `resolveForeshadowDescriptionJson` 回退到纯文本 `description`。
 */
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { deriveForeshadowStatus } from '../../../../../shared/foreshadowStatus'
import { sliceSelectedText } from '../../../../../shared/foreshadowAnchorText'
import { ReadonlyRichText } from '../../../components/editor/ReadonlyRichText'
import { Tag } from '../../../components/ui'
import { resolveLocale } from '../../../i18n/config'
import { formatDateTime } from '../../../lib/relativeTime'
import {
  FORESHADOW_STATUS_LABEL_KEYS,
  FORESHADOW_STATUS_TONES,
  resolveForeshadowDescriptionJson,
  type ForeshadowRow
} from './foreshadowTree'

export interface ForeshadowTrashDetailProps {
  /** 当前选中的回收站伏笔行（含描述富文本与三套锚点快照）。 */
  row: ForeshadowRow
}

/**
 * 锚点只读块：类型标签 + 原文摘录；无摘录时回退「未锚定 / 未回收 / 无摘录」占位。
 *
 * 不复用 `ForeshadowAnchorBlock`：后者需要 `ForeshadowAnchorResolution`（含目标行），
 * 而回收站行只有目标 id，无法安全解析目标名称；直接用同一套展示类名保持视觉一致。
 */
function AnchorExcerpt({
  label,
  quote,
  emptyText
}: {
  label: string
  quote: string
  emptyText: string
}): ReactElement {
  return (
    <div className="trash-detail__body">
      <div className="foreshadow-anchor-card">
        <div className="foreshadow-anchor-card__head">
          <div className="foreshadow-anchor-card__label">{label}</div>
        </div>
        {quote.trim() === '' ? (
          <div className="foreshadow-anchor-card__row">
            <span className="foreshadow-anchor-card__target is-empty">{emptyText}</span>
          </div>
        ) : (
          <blockquote className="foreshadow-anchor-card__quote">{quote}</blockquote>
        )}
      </div>
    </div>
  )
}

/** 伏笔回收站详情：标题 / 派生状态 / 描述 / 三套锚点摘录 / 回收备注 / 时间戳。 */
export function ForeshadowTrashDetail({ row }: ForeshadowTrashDetailProps): ReactElement {
  const { t, i18n } = useTranslation('foreshadow')
  const { t: tChapters } = useTranslation('chapters')
  const locale = resolveLocale(i18n.language)

  const displayStatus = deriveForeshadowStatus(row)
  const descriptionJson = resolveForeshadowDescriptionJson(row)
  const title = row.title.trim() === '' ? t('field.untitled') : row.title

  // 三个锚点都按「快照 + 字符区间」切出选中文字；偏移缺失 / 越界时由共享函数回退整段。
  const bodyQuote = sliceSelectedText(row.bodyQuote, row.bodyCharStart, row.bodyCharEnd)
  const outlineQuote = sliceSelectedText(row.outlineQuote, row.outlineCharStart, row.outlineCharEnd)
  const recoverQuote = sliceSelectedText(row.recoverQuote, row.recoverCharStart, row.recoverCharEnd)

  const formatTime = (value: string | null): string =>
    formatDateTime(value, locale) || (value ?? '')
  const deletedAt = formatTime(row.deletedAt)
  const createdAt = formatTime(row.createdAt)
  const updatedAt = formatTime(row.updatedAt)

  return (
    <div className="trash-detail__pane">
      <header className="trash-detail__head">
        <div className="foreshadow-detail__head">
          <div className="trash-detail__title foreshadow-detail__title">{title}</div>
          <Tag tone={FORESHADOW_STATUS_TONES[displayStatus]} className="foreshadow-detail__status">
            {t(FORESHADOW_STATUS_LABEL_KEYS[displayStatus])}
          </Tag>
        </div>
        <div className="trash-detail__meta">
          {deletedAt === '' ? null : (
            <span>{tChapters('trash.detail.deletedAt', { time: deletedAt })}</span>
          )}
          <span>{t('trash.detail.createdAt', { time: createdAt })}</span>
          <span>{t('trash.detail.updatedAt', { time: updatedAt })}</span>
        </div>
      </header>

      <div className="trash-detail__body">
        <div className="foreshadow-detail__section">
          <div className="foreshadow-detail__label">{t('field.description')}</div>
          <ReadonlyRichText
            json={descriptionJson}
            emptyText={t('detail.descriptionEmpty')}
            className="trash-detail__rich"
          />
        </div>
      </div>

      <AnchorExcerpt
        label={t('detail.plant')}
        quote={bodyQuote}
        emptyText={row.bodyKind === 'none' ? t('detail.plantEmpty') : t('trash.detail.noExcerpt')}
      />

      {row.outlineKind === 'none' ? null : (
        <AnchorExcerpt
          label={t('detail.plant2')}
          quote={outlineQuote}
          emptyText={t('trash.detail.noExcerpt')}
        />
      )}

      <AnchorExcerpt
        label={t('detail.recover')}
        quote={recoverQuote}
        emptyText={
          row.recoverAnchorKind === 'none' ? t('detail.recoverEmpty') : t('trash.detail.noExcerpt')
        }
      />

      {row.recoveryNote.trim() === '' ? null : (
        <div className="trash-detail__body">
          <div className="foreshadow-detail__section">
            <div className="foreshadow-detail__label">{t('detail.recoverNote')}</div>
            <p className="foreshadow-anchor-card__note-text">{row.recoveryNote}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ForeshadowTrashDetail

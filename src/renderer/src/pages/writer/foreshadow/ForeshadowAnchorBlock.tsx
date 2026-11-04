/**
 * 伏笔右栏「只读锚点块」（埋点 / 回收两处复用，AGENTS §9）：
 * 块标题 + 位置串（已锚定：完整「卷 · 章」/ 条目名，不再挂「已锚定」胶囊）+ 原文摘抄
 * （+ 可选附加段落，如回收备注）；未锚定 / 失效才渲染胶囊或占位文案。
 *
 * 底色 / 边框由 `.foreshadow-anchor-card` 提供（与可编辑块 `.foreshadow-fields`
 * 共享同一条底色卡规则），本组件不重复定义外观。
 */
import { useTranslation } from 'react-i18next'
import { Tag } from '../../../components/ui'
import { useChapterLabels } from '../chapters/useChapterLabels'
import {
  foreshadowPlaceLabel,
  FORESHADOW_ANCHOR_LABEL_KEYS,
  FORESHADOW_ANCHOR_TONES,
  type ForeshadowAnchorResolution
} from './foreshadowTree'

export interface ForeshadowAnchorBlockProps {
  /** 块标题（如「埋点位置」/「回收位置」）。 */
  label: string
  /** 锚点解析结果（由调用方按埋点 / 回收口径分别解析）。 */
  resolution: ForeshadowAnchorResolution
  /** 原文摘抄（空串 = 不渲染摘抄段）。 */
  quote: string
  /** 未锚定时的占位文案（埋点「未锚定」/ 回收「未回收」）。 */
  emptyText: string
  /** 可选附加只读段落（回收备注）：正文为空则不渲染。 */
  note?: { label: string; value: string }
}

export function ForeshadowAnchorBlock({
  label,
  resolution,
  quote,
  emptyText,
  note
}: ForeshadowAnchorBlockProps) {
  const { t } = useTranslation('foreshadow')
  const labels = useChapterLabels()

  // 位置串取完整锚点位置：章节 =「卷X 卷名 · 第X章 章名」（卷缺失 / 卷无编号退化为「第X章 章名」），
  // 大纲 = 条目名本身（块标题已说明位置类型，不再重复「大纲 ·」前缀）。
  const targetLabel = foreshadowPlaceLabel(resolution, labels, t('anchor.unnamedTarget'))

  const hint =
    resolution.state !== 'invalid'
      ? null
      : resolution.missing !== null
        ? t('anchor.missing')
        : t('anchor.invalid')

  return (
    <div className="foreshadow-anchor-card">
      <div className="foreshadow-anchor-card__label">{label}</div>
      <div className="foreshadow-anchor-card__row">
        {resolution.state === 'unanchored' ? (
          <span className="foreshadow-anchor-card__target is-empty">{emptyText}</span>
        ) : resolution.state === 'invalid' ? (
          // 失效仍用危险色胶囊提示（位置已不可展示）。
          <Tag tone={FORESHADOW_ANCHOR_TONES.invalid}>
            {t(FORESHADOW_ANCHOR_LABEL_KEYS.invalid)}
          </Tag>
        ) : targetLabel === null ? null : (
          // 已锚定不再显示状态胶囊，直接给完整位置。
          <span className="foreshadow-anchor-card__target">{targetLabel}</span>
        )}
      </div>
      {quote.trim() === '' ? null : (
        <blockquote className="foreshadow-anchor-card__quote">{quote}</blockquote>
      )}
      {hint === null ? null : <p className="foreshadow-anchor-card__hint">{hint}</p>}
      {note !== undefined && note.value.trim() !== '' ? (
        <div className="foreshadow-anchor-card__note">
          <div className="foreshadow-anchor-card__label">{note.label}</div>
          <p className="foreshadow-anchor-card__note-text">{note.value}</p>
        </div>
      ) : null}
    </div>
  )
}

export default ForeshadowAnchorBlock

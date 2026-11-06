/**
 * 章节模块右栏「灵感」页签的**只读详情**（列表 → 详情两级视图的第二级）。
 *
 * 灵感正文是**纯文本**（`inspirations.content` 即真源，见 `schema/inspirations.ts`），
 * 故不使用 `ReadonlyRichText`：直接按 `white-space: pre-wrap` 渲染，保留换行与空白。
 *
 * 结构对齐伏笔只读详情：`.inspiration-readonly` > `__scroll` > `__fields` 软底块 +
 * 底部独立底色返回栏；各值块复用共享 `.wf-readonly-block`（`components/surface.css`）。
 * 本组件不渲染 Input / 保存条 / 删除 / 确认框——详情是纯展示，唯一操作是「返回」。
 */
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Tag } from '../../../components/ui'
import type { InspirationRow } from '../inspiration/inspirationTree'

export interface InspirationReadonlyDetailProps {
  /** 当前选中的灵感行（列表命中项；行被删 / 刷新后由外层回落列表）。 */
  row: InspirationRow
  /** 返回列表。 */
  onBack: () => void
}

/** 只读详情：标题 + 标签 + 纯文本正文 + 底部返回栏。 */
export function InspirationReadonlyDetail({
  row,
  onBack
}: InspirationReadonlyDetailProps): ReactElement {
  const { t } = useTranslation('inspiration')
  const title = row.title.trim()
  const content = row.content

  return (
    <div className="inspiration-readonly">
      <div className="inspiration-readonly__scroll">
        <div className="inspiration-readonly__fields">
          <div className="inspiration-readonly__head wf-readonly-block">
            <span className="inspiration-readonly__title">
              {title === '' ? t('field.untitled') : title}
            </span>
          </div>

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

          <div className="inspiration-readonly__section inspiration-readonly__section--content">
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
      </div>

      <div className="inspiration-readonly__bar">
        <Button variant="secondary" className="wf-btn--on-soft" onClick={onBack}>
          {t('detail.back')}
        </Button>
      </div>
    </div>
  )
}

export default InspirationReadonlyDetail

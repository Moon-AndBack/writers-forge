/**
 * 章节模块右栏「灵感」页签的**只读详情**（列表 → 详情两级视图的第二级）。
 *
 * 灵感正文是**块级富文本**（`inspirations.content_json` 即真源；`content` 为其派生纯文本
 * 摘要），故与伏笔详情同款走 `ReadonlyRichText` 渲染：标题 / 列表 / 加粗 / 表格等格式
 * 原样呈现。容器挂 `.doc-body` 复用全局长文排版（字号 / 行高 / 首行缩进），域内覆写见
 * `styles/writer-inspiration.css`。
 *
 * 壳复用共享 `ReadonlyDetailShell`（滚动字段区 + 底部独立底色返回栏，与实体详情同款；
 * 壳规则见 `styles/writer-right-panels.css`）；各值块复用共享 `.wf-readonly-block`
 * （`components/surface.css`）。本组件不渲染 Input / 保存条 / 删除 / 确认框——详情是纯展示，
 * 唯一操作是「返回」。
 */
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ReadonlyRichText } from '../../../components/editor/ReadonlyRichText'
import { Tag } from '../../../components/ui'
import { resolveInspirationContentJson, type InspirationRow } from '../inspiration/inspirationTree'
import { ReadonlyDetailShell } from './ReadonlyDetailShell'

export interface InspirationReadonlyDetailProps {
  /** 当前选中的灵感行（列表命中项；行被删 / 刷新后由外层回落列表）。 */
  row: InspirationRow
  /** 返回列表。 */
  onBack: () => void
}

/** 只读详情：标题 + 标签 + 富文本正文 + 底部返回栏。 */
export function InspirationReadonlyDetail({
  row,
  onBack
}: InspirationReadonlyDetailProps): ReactElement {
  const { t } = useTranslation('inspiration')
  const title = row.title.trim()
  const contentJson = resolveInspirationContentJson(row)

  return (
    <ReadonlyDetailShell backLabel={t('detail.back')} onBack={onBack}>
      <div className="inspiration-readonly__head wf-readonly-block">
        <span className="inspiration-readonly__title">
          {title === '' ? t('field.untitled') : title}
        </span>
      </div>

      {row.tags.length === 0 ? null : (
        <div className="inspiration-readonly__section">
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
        <ReadonlyRichText
          json={contentJson}
          emptyText={t('field.contentEmpty')}
          className="inspiration-readonly__content wf-readonly-block doc-body"
        />
      </div>
    </ReadonlyDetailShell>
  )
}

export default InspirationReadonlyDetail

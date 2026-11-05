/**
 * 灵感列表单卡（中栏网格单元）：标题 + 删除按钮 + 正文摘要（3 行截断）+ 标签胶囊。
 *
 * 结构 / 公共视觉规格统一由通用壳 `EntityStyleCard` 提供（与伏笔 `ForeshadowItem`、
 * 设定档案 `DossierCard` 同款，AGENTS §9：不复制平行卡片）；本文件只组合域内内容，
 * 并挂 `inspiration-card` 语义类供 `writer-inspiration.css` 做域内覆写。
 *
 * 卡根是壳输出的 `<article>`：可交互变体带 `role="button"`（`<button>` 不能内嵌删除按钮，
 * 故改用可聚焦容器 + 键盘 Enter / Space 选中）；hover / 选中光晕复用通用
 * `.wf-card--halo`（仅描边 / 阴影变化，无 transform，AGENTS §8）。
 */
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashIcon } from '../../../components/icons'
import { EntityStyleCard, IconButton, Tag } from '../../../components/ui'
import type { InspirationRow } from './inspirationTree'

export interface InspirationCardProps {
  row: InspirationRow
  active: boolean
  onSelect: (id: number) => void
  /** 请求删除（由中栏视图弹二次确认，本卡不直接落库）。 */
  onDelete: (id: number) => void
}

export default function InspirationCard({ row, active, onSelect, onDelete }: InspirationCardProps) {
  const { t } = useTranslation('inspiration')
  const title = row.title.trim()
  const content = row.content.trim()

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    // 只处理卡片自身获得焦点时的按键；卡内删除按钮的 Enter / Space 不触发选中。
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect(row.id)
  }

  return (
    <EntityStyleCard
      className="inspiration-card"
      active={active}
      cardProps={{
        role: 'button',
        tabIndex: 0,
        'aria-pressed': active,
        onClick: () => onSelect(row.id),
        onKeyDown: handleKeyDown
      }}
      head={
        <span className="wf-entity-card__title inspiration-card__title">
          {title === '' ? t('field.untitled') : title}
        </span>
      }
      actions={
        <IconButton
          size="sm"
          tone="danger"
          label={t('action.delete')}
          tooltipPlacement="top"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(row.id)
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <TrashIcon />
        </IconButton>
      }
      description={
        content === '' ? (
          <span className="inspiration-card__empty">{t('field.contentEmpty')}</span>
        ) : (
          content
        )
      }
      descriptionClassName="inspiration-card__desc"
      chips={
        row.tags.length === 0
          ? undefined
          : row.tags.map((tag, index) => (
              <Tag key={`${tag}-${index}`} tone="neutral" className="inspiration-card__tag">
                {tag}
              </Tag>
            ))
      }
      chipsClassName="inspiration-card__tags"
      chipsProps={{
        role: 'group',
        'aria-label': t('field.tags'),
        onClick: (event) => event.stopPropagation()
      }}
    />
  )
}

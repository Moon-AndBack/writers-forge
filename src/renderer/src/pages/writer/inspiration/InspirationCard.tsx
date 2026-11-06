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
 *
 * 变体（AGENTS §9：同组件按参数覆写，不复制平行卡片）：
 * - `readonly`：章节右栏「灵感」总览用——只负责不渲染删除按钮；卡片是否可交互
 *   由 `onSelect` 是否存在决定（有 `onSelect` 仍保留 `role="button"` / 键盘选中）；
 * - `compact`：右栏窄栏用——收窄内衬 / 字号，正文摘要由 3 行降为 2 行
 *   （样式见 `writer-inspiration-overview.css`）。
 */
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashIcon } from '../../../components/icons'
import { EntityStyleCard, IconButton, Tag } from '../../../components/ui'
import type { InspirationRow } from './inspirationTree'

export interface InspirationCardProps {
  row: InspirationRow
  active: boolean
  /** 只读变体：不渲染删除按钮；可交互性由 `onSelect` 是否存在决定（右栏总览用）。 */
  readonly?: boolean
  /** 紧凑变体：收窄内衬 / 字号与摘要行数（右栏窄栏用）。 */
  compact?: boolean
  onSelect?: (id: number) => void
  /** 请求删除（由中栏视图弹二次确认，本卡不直接落库）。 */
  onDelete?: (id: number) => void
}

export default function InspirationCard({
  row,
  active,
  readonly = false,
  compact = false,
  onSelect,
  onDelete
}: InspirationCardProps) {
  const { t } = useTranslation('inspiration')
  const title = row.title.trim()
  const content = row.content.trim()

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    // 只处理卡片自身获得焦点时的按键；卡内删除按钮的 Enter / Space 不触发选中。
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect?.(row.id)
  }

  // 卡片交互性与 `readonly` 解耦：只有传了 `onSelect` 才是可点 / 可键盘选中的卡
  // （右栏总览既是 `readonly`（无删除按钮）又可点进只读详情）。无 `onSelect` = 纯展示。
  const interactive = onSelect !== undefined

  return (
    <EntityStyleCard
      className="inspiration-card"
      active={active}
      // 壳的 `readonly` 只管光标（不暗示可点）：有 `onSelect` 时仍按可交互卡渲染。
      readonly={!interactive}
      compact={compact}
      cardProps={{
        // 交互性只看 `onSelect`：有则保留按钮语义与键盘选中，无则纯展示。
        role: interactive ? 'button' : undefined,
        tabIndex: interactive ? 0 : undefined,
        'aria-pressed': interactive ? active : undefined,
        onClick: interactive ? () => onSelect?.(row.id) : undefined,
        onKeyDown: interactive ? handleKeyDown : undefined
      }}
      head={
        <span className="wf-entity-card__title inspiration-card__title">
          {title === '' ? t('field.untitled') : title}
        </span>
      }
      actions={
        readonly || onDelete === undefined ? undefined : (
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
        )
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

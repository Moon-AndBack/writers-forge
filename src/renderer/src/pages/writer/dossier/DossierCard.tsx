/**
 * 设定档案单卡（中栏网格单元）：名称 + 子类型标签 + 别名 + 正文截断 + 关系行。
 *
 * 从 `DossierView.tsx` 迁出（该文件当时已逼近 500 行上限）。本文件只负责单卡渲染：
 * - 别名行：前 3 个，可换行，无「+N」；
 * - 关系行：按 `useChipOverflow` 实测容器宽单行自适应，放不下才收口成「+N」，
 *   「+N」悬停经 `useOverflowPopup` 打开 `EntityCardMorePopup` 浮窗；
 * - hover / 开合事件一律经 props 上抛（关系胶囊 → 第一层详情卡由 `DossierView` 渲染，
 *   「+N」浮窗内胶囊 → 第二层详情卡同样由 `DossierView` 渲染）。
 */
import { useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { LinkIcon, TrashIcon } from '../../../components/icons'
import { Tag } from '../../../components/ui'
import { useChipOverflow } from '../../../components/useChipOverflow'
import { useOverflowPopup } from '../../../components/useOverflowPopup'
import type { OverflowPopupControl } from '../../../components/useOverflowPopup'
import { EntityCardMorePopup } from '../entities/EntityCardMorePopup'
import { PencilIcon } from '../icons'
import { dossierCardRelations } from './dossierCardRelations'
import type { DossierRow } from './dossierTree'
import { entityChipClass } from './relationChip'

/**
 * 「+N」计数胶囊的语义类：`useChipOverflow` 的 `moreSelector` 靠它把计数槽排除在容量测量外
 * （容量只描述关系胶囊能占多少，「+N」槽位由组件侧在容量内预留）。CSS 见 `writer-dossier-card.css`。
 */
const MORE_CHIP_CLASS = 'dossier-card__chip--more'

export interface DossierCardProps {
  row: DossierRow
  active: boolean
  /**
   * 布局签名（单卡内容可用宽，px）：`auto-fill` 网格列宽随窗口 / 中栏拖拽变化，
   * 由父级观察 `.dossier-grid` 得出后统一传入，变化即触发关系行容量重测。
   */
  layoutKey: number
  onSelect: (id: number) => void
  /** 编辑入口（缺省 = 不渲染编辑按钮）。 */
  onEdit?: (id: number) => void
  /** 关联关系入口（缺省 = 不渲染关系按钮，仅境界体系模块隐藏）。 */
  onRelations?: (id: number) => void
  /** 删除入口（缺省 = 不渲染删除按钮，与编辑按钮并排）。 */
  onDelete?: (id: number) => void
  /** 关系胶囊移入（延迟后显示对端实体悬停卡）。 */
  onChipEnter: (event: ReactMouseEvent<HTMLElement>, peerId: number) => void
  /** 关系胶囊移出（延迟关闭悬停卡）。 */
  onChipLeave: () => void
  /** 「+N」浮窗内胶囊移入（显示第二层详情卡）。 */
  onMoreItemEnter?: (el: HTMLElement, peerId: number, rowId: number) => void
  /** 「+N」浮窗内胶囊移出。 */
  onMoreItemLeave?: () => void
  /** 「+N」浮窗打开（父级借此收掉仍在显示的关系胶囊悬停卡，避免两层浮层叠加）。 */
  onPopupOpen?: () => void
  /**
   * 上报本卡「+N」浮窗的开合控制器（父级按 rowId 登记；卸载时以 null 注销）。
   * 父级在第二层详情卡悬停时据此取消 / 重启浮窗收起，避免「浮窗 → 详情卡」途中浮窗被关。
   */
  onPopupControl?: (rowId: number, control: OverflowPopupControl | null) => void
}

/** 单条设定卡：名称 + 子类型标签（有值才显示）+ 别名标签 + 正文前 4 行（逐段缩进）+ 关系标签；选中态落卡自身（无位移 / 缩放）。 */
export function DossierCard({
  row,
  active,
  layoutKey,
  onSelect,
  onEdit,
  onRelations,
  onDelete,
  onChipEnter,
  onChipLeave,
  onMoreItemEnter,
  onMoreItemLeave,
  onPopupOpen,
  onPopupControl
}: DossierCardProps) {
  const { t } = useTranslation('dossier')
  // 正文按段落拆行（`\n` 由派生摘要保留）；逐段渲染以做段首缩进，空行丢弃。
  const paragraphs = row.body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const hasDesc = paragraphs.length > 0
  const hasName = row.name.trim() !== ''
  const typeLabel = row.subType.trim() === '' ? null : row.subType
  // 别名以独立标签展示，最多前三个，可换行（无「+N」）。
  const aliasChips = row.aliases.slice(0, 3)
  // 关系胶囊数据（全量；出边「上级 文心城」+ 入边「锻笔剑 属于我」同口径）。
  const relations = dossierCardRelations(row.relations)
  // 本卡自身（实体模块 + 预设分类）的色系类名：仅右上类别标签使用。
  const ownChipClass = entityChipClass(row.entityType, row.presetKey)

  const listRef = useRef<HTMLDivElement | null>(null)
  // 单行容量（宽够则更多、窄则更少）；「+N」不计入容量测量。
  const capacity = useChipOverflow(listRef, relations.items.length, layoutKey, {
    maxRows: 1,
    moreSelector: `.${MORE_CHIP_CLASS}`
  })
  // 「+N」槽位预留：有溢出时容量先扣 1 给计数胶囊（同悬停卡 / 剧情场景卡的 `capacity - 1` 口径）。
  let visibleCount = Math.min(relations.items.length, capacity)
  if (relations.items.length - visibleCount > 0) {
    visibleCount = Math.max(0, Math.min(relations.items.length, capacity - 1))
  }
  const visibleItems = relations.items.slice(0, visibleCount)
  const hiddenItems = relations.moreItems.slice(visibleCount)
  const hiddenCount = hiddenItems.length

  // 「+N」浮窗开合（悬停即开 / 120ms 延迟收起）。
  const {
    anchor: moreAnchor,
    open: openMore,
    cancelClose: cancelMoreClose,
    scheduleClose: scheduleCloseMore
  } = useOverflowPopup()

  // 向父级登记浮窗控制器（第二层详情卡悬停时据此保持浮窗打开）；卸载时注销。
  useEffect(() => {
    if (!onPopupControl) return undefined
    onPopupControl(row.id, { cancelClose: cancelMoreClose, scheduleClose: scheduleCloseMore })
    return () => onPopupControl(row.id, null)
  }, [onPopupControl, row.id, cancelMoreClose, scheduleCloseMore])

  return (
    <article
      className={`dossier-card wf-card--halo${active ? ' is-active' : ''}`}
      onClick={() => onSelect(row.id)}
    >
      <div className="dossier-card__head">
        <h3 className="dossier-card__name">{hasName ? row.name : t('unnamed')}</h3>
        {typeLabel ? (
          <Tag tone="neutral" className={`dossier-card__type ${ownChipClass}`}>
            {typeLabel}
          </Tag>
        ) : null}
        {onEdit || onRelations || onDelete ? (
          <span className="dossier-card__actions">
            {onEdit ? (
              <button
                type="button"
                className="dossier-card__edit"
                aria-label={t('editAction')}
                title={t('editAction')}
                onClick={(event) => {
                  event.stopPropagation()
                  onEdit(row.id)
                }}
              >
                <PencilIcon width={13} />
              </button>
            ) : null}
            {onRelations ? (
              <button
                type="button"
                className="dossier-card__edit"
                aria-label={t('relationsAction')}
                title={t('relationsAction')}
                onClick={(event) => {
                  event.stopPropagation()
                  onRelations(row.id)
                }}
              >
                <LinkIcon />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="dossier-card__edit dossier-card__delete"
                aria-label={t('detail.delete')}
                title={t('detail.delete')}
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(row.id)
                }}
              >
                <TrashIcon />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {aliasChips.length > 0 ? (
        <div className="dossier-card__chips">
          {aliasChips.map((alias, index) => (
            <Tag
              key={`alias-${index}`}
              tone="neutral"
              className="dossier-card__chip dossier-card__chip--alias"
            >
              {alias}
            </Tag>
          ))}
        </div>
      ) : null}
      {hasDesc ? (
        <div className="dossier-card__desc">
          {paragraphs.map((paragraph, index) => (
            <p className="dossier-card__para" key={`para-${index}`}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="dossier-card__desc is-empty">{t('cardEmptyDesc')}</p>
      )}
      {relations.items.length > 0 ? (
        <div className="dossier-card__chips dossier-card__chips--relations" ref={listRef}>
          {visibleItems.map((item, index) => (
            <Tag
              key={`relation-${index}`}
              tone="neutral"
              className={`dossier-card__chip ${item.chipClass}`}
              onMouseEnter={(event) => onChipEnter(event, item.peerId)}
              onMouseLeave={onChipLeave}
            >
              {item.label}
            </Tag>
          ))}
          {hiddenCount > 0 ? (
            <Tag
              tone="neutral"
              className={`dossier-card__chip ${MORE_CHIP_CLASS} chip-pill--neutral`}
              onMouseEnter={(event) => {
                onPopupOpen?.()
                openMore(event.currentTarget)
              }}
              onMouseLeave={scheduleCloseMore}
            >
              +{hiddenCount}
            </Tag>
          ) : null}
        </div>
      ) : null}
      {moreAnchor !== null && moreAnchor.isConnected && hiddenItems.length > 0 ? (
        <EntityCardMorePopup
          anchorEl={moreAnchor}
          items={hiddenItems}
          onPointerEnter={cancelMoreClose}
          onPointerLeave={scheduleCloseMore}
          onItemEnter={
            onMoreItemEnter ? (el, peerId) => onMoreItemEnter(el, peerId, row.id) : undefined
          }
          onItemLeave={onMoreItemEnter ? onMoreItemLeave : undefined}
        />
      ) : null}
    </article>
  )
}

export default DossierCard

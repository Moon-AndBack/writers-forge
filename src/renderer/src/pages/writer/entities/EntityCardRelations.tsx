/**
 * 实体悬停卡的关系行（第四行）：按容器实测宽自适应，放不下才收口成「+N」。
 *
 * 与改造前的固定前 6 条不同：容量由 `useChipOverflow` 按 DOM 实测得出（单行），
 * 「+N」槽位在容量内预留，保证「恰好放满且有余项」时最后一条不被计数胶囊挤掉。
 *
 * 关系胶囊可 hover 展开对端详情（`expandable`）：展开出的卡片（嵌套层）由调用方渲染，
 * 本组件只上报 hover 事件；嵌套层传 `expandable={false}`，其关系行仅展示、`+N` 不可展开。
 */
import { useRef } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { WorldEntityDetail } from '../../../../../preload/types/worldEntity'
// 跨域复用档案域的胶囊纯函数（entities → dossier）：文案与配色与档案卡第四行同口径。
import { entityChipClass, relationChipLabel } from '../dossier/relationChip'
import { useRelationLabels } from '../dossier/useRelationLabels'
import { useChipOverflow } from '../../../components/useChipOverflow'
import { useOverflowPopup } from '../../../components/useOverflowPopup'
import { EntityCardMorePopup } from './EntityCardMorePopup'
import type { EntityCardMoreItem } from './EntityCardMorePopup'

/**
 * 「+N」计数胶囊的语义类：既供 `useChipOverflow` 的 `moreSelector` 排除计数槽，
 * 也作为「这是溢出计数而非关系胶囊」的标记。配色仍由 `chip-pill--neutral` 提供。
 */
const MORE_CHIP_CLASS = 'entity-card-chip--more'

export interface EntityCardRelationsProps {
  /** 当前实体的关系摘要（主进程已返回，含 `peerId`）。 */
  relations: WorldEntityDetail['relations']
  /** 布局签名（卡片内容宽实测值）：宽度变化时触发重新测量容量。 */
  layoutKey: number
  /** 是否允许关系胶囊 hover 展开对端详情；嵌套层传 false。 */
  expandable: boolean
  /** 关系胶囊 hover 进入（`expandable` 为 true 时才绑定）。 */
  onChipEnter?: (el: HTMLElement, peerId: number) => void
  /** 关系胶囊 hover 离开。 */
  onChipLeave?: () => void
  /** 「+N」浮窗内胶囊 hover 进入（`expandable` 为 true 时才传给浮窗）。 */
  onMoreItemEnter?: (el: HTMLElement, peerId: number) => void
  /** 「+N」浮窗内胶囊 hover 离开。 */
  onMoreItemLeave?: () => void
  /** 鼠标进入「+N」浮窗：调用方取消自身（悬停卡）的挂起关闭。 */
  onPopupEnter?: () => void
  /** 鼠标离开「+N」浮窗：调用方重启自身的延迟关闭。 */
  onPopupLeave?: () => void
}

export function EntityCardRelations({
  relations,
  layoutKey,
  expandable,
  onChipEnter,
  onChipLeave,
  onMoreItemEnter,
  onMoreItemLeave,
  onPopupEnter,
  onPopupLeave
}: EntityCardRelationsProps): ReactElement | null {
  const { t } = useTranslation('entities')
  // 关系文案映射（i18n，`dossier` ns）：本组件自身文案仍取 `entities` ns。
  const relationLabels = useRelationLabels()
  const listRef = useRef<HTMLSpanElement | null>(null)
  // 单行容量（宽够则更多、窄则更少）；「+N」不计入容量测量。
  const capacity = useChipOverflow(listRef, relations.length, layoutKey, {
    maxRows: 1,
    moreSelector: `.${MORE_CHIP_CLASS}`
  })
  // 「+N」槽位预留：有溢出时容量先扣 1 给计数胶囊（同 `SceneCard` 的 `capacity - 1` 口径）。
  let visibleCount = Math.min(relations.length, capacity)
  if (relations.length - visibleCount > 0) {
    visibleCount = Math.max(0, Math.min(relations.length, capacity - 1))
  }
  const visibleRelations = relations.slice(0, visibleCount)
  const hiddenCount = relations.length - visibleCount

  // 「+N」浮窗的开合由共享 hook 自管（锚点胶囊 + 往返余量定时器）。
  const {
    anchor: moreAnchor,
    open: openMore,
    cancelClose: cancelMoreClose,
    scheduleClose: scheduleCloseMore
  } = useOverflowPopup()

  // `expandable` 为 false（嵌套层）时胶囊不绑定任何 hover，`+N` 也不可展开。
  const chipsInteractive = expandable && onChipEnter !== undefined

  const moreItems: EntityCardMoreItem[] = relations.slice(visibleCount).map((rel) => ({
    peerId: rel.peerId,
    label: relationChipLabel(rel, relationLabels),
    chipClass: entityChipClass(rel.peerEntityType, rel.peerPresetKey)
  }))

  if (relations.length === 0) return null

  return (
    <>
      <div className="entity-card-relations">
        <span className="entity-card-label">{t('relations')}</span>
        <span className="entity-card-chips" ref={listRef}>
          {visibleRelations.map((rel, index) => (
            <span
              key={`relation-${index}`}
              className={`entity-card-chip chip-pill ${entityChipClass(rel.peerEntityType, rel.peerPresetKey)}${chipsInteractive ? ' is-interactive' : ''}`}
              onMouseEnter={
                chipsInteractive
                  ? (event) => onChipEnter?.(event.currentTarget, rel.peerId)
                  : undefined
              }
              onMouseLeave={chipsInteractive ? onChipLeave : undefined}
            >
              {relationChipLabel(rel, relationLabels)}
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span
              className={`entity-card-chip chip-pill chip-pill--neutral ${MORE_CHIP_CLASS}${expandable ? ' is-interactive' : ''}`}
              onMouseEnter={expandable ? (event) => openMore(event.currentTarget) : undefined}
              onMouseLeave={expandable ? scheduleCloseMore : undefined}
            >
              +{hiddenCount}
            </span>
          ) : null}
        </span>
      </div>
      {expandable && moreAnchor !== null && moreAnchor.isConnected && hiddenCount > 0 ? (
        <EntityCardMorePopup
          anchorEl={moreAnchor}
          items={moreItems}
          onPointerEnter={() => {
            cancelMoreClose()
            onPopupEnter?.()
          }}
          onPointerLeave={() => {
            scheduleCloseMore()
            onPopupLeave?.()
          }}
          onItemEnter={onMoreItemEnter}
          onItemLeave={onMoreItemLeave}
        />
      ) : null}
    </>
  )
}

export default EntityCardRelations

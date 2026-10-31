import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { HoverPopupShell } from '../../../components/HoverPopupShell'

/**
 * 「+N」浮窗条目：文案与配色由调用方按第四行同一口径预计算
 * （`relationChipLabel` + `entityChipClass`），本组件只负责摆放，避免重复一套胶囊生成逻辑。
 */
export interface EntityCardMoreItem {
  /** 对端实体 id，供浮窗内胶囊 hover 时取详情。 */
  peerId: number
  /** 胶囊文案（与第四行前 N 条同口径）。 */
  label: string
  /** 胶囊配色 class（`entityChipClass(peerEntityType, peerPresetKey)` 的结果）。 */
  chipClass: string
}

export interface EntityCardMorePopupProps {
  /** 触发浮窗的「+N」胶囊（活元素，滚动 / 缩放时按其最新视口矩形重定位）。 */
  anchorEl: HTMLElement
  /** 被收口的关系条目（`relations.slice(visibleCount)`，条数由调用方按容器实测宽度算出）。 */
  items: EntityCardMoreItem[]
  /** 鼠标进入浮窗：调用方取消挂起的关闭（含悬停卡自身）。 */
  onPointerEnter: () => void
  /** 鼠标离开浮窗：调用方重启延迟关闭。 */
  onPointerLeave: () => void
  /** 鼠标进入某个条目胶囊：调用方借此展示对端实体详情。未传则条目不可交互。 */
  onItemEnter?: (el: HTMLElement, peerId: number) => void
  /** 鼠标离开条目胶囊。 */
  onItemLeave?: () => void
}

/**
 * 悬停卡「+N」关系浮窗：列出被收口的关系胶囊（与第四行同样式 / 同配色）。
 *
 * 定位走「渲染后实测 → 写样式」同口径（不在 effect 里同步 setState），
 * 与实体悬停卡保持一致；淡入仅 opacity（禁 transform，见 AGENTS §8）。
 */
export function EntityCardMorePopup({
  anchorEl,
  items,
  onPointerEnter,
  onPointerLeave,
  onItemEnter,
  onItemLeave
}: EntityCardMorePopupProps): ReactElement {
  // 锚点快照：HoverPopupShell 仅在活元素断开时回退它（收起窗口内胶囊先卸载的极短场景）。
  const anchorRect = useMemo(() => anchorEl.getBoundingClientRect(), [anchorEl])

  // portal 到 body：悬停卡自身 `overflow-y: auto` 会裁剪后代，脱离卡片 DOM 后按视口坐标定位。
  return (
    <HoverPopupShell
      anchorRect={anchorRect}
      anchorEl={anchorEl}
      variant="more"
      className="entity-card-more"
      contentKey={items}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <span className="entity-card-chips">
        {items.map((item, index) => (
          <span
            key={`more-relation-${index}`}
            className={`entity-card-chip chip-pill ${item.chipClass}${onItemEnter ? ' is-interactive' : ''}`}
            onMouseEnter={
              onItemEnter ? (event) => onItemEnter(event.currentTarget, item.peerId) : undefined
            }
            onMouseLeave={onItemEnter ? onItemLeave : undefined}
          >
            {item.label}
          </span>
        ))}
      </span>
    </HoverPopupShell>
  )
}

export default EntityCardMorePopup

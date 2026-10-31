/**
 * 设定档案卡关系行（第四行）的数据推导（纯函数，不依赖 React）。
 *
 * 只负责「全量关系 → 胶囊数据」的映射，**不做条数收口**：自适应条数由组件侧的
 * `useChipOverflow`（按容器实测宽、单行）决定，被收口的条目再从同一份 `items` 切出，
 * 保证卡片上的胶囊与「+N」浮窗里的胶囊文案 / 配色完全同口径。
 */
import type { WorldEntityType } from '../../../../../preload/types/worldEntity'
import type { EntityCardMoreItem } from '../entities/EntityCardMorePopup'
import type { DossierRow } from './dossierTree'
import { entityChipClass, relationChipLabel } from './relationChip'

/** 单条关系胶囊的渲染数据（文案 + 配色已预计算，组件只负责摆放）。 */
export interface DossierRelationChip {
  /** 对端实体 id，供胶囊 hover 时取对端详情卡。 */
  peerId: number
  /** 胶囊文案（读法见 {@link dossierCardRelations} 函数级注释）。 */
  label: string
  /** 胶囊配色 class（`entityChipClass(peerEntityType, peerPresetKey)` 的结果）。 */
  chipClass: string
  /** 对端所属模块（原样透出，供调用方按需做二次展示判断）。 */
  entityType: WorldEntityType
  /** 对端预设分类键（同上）。 */
  presetKey: string
}

/** 关系行数据：全部胶囊 + 「+N」浮窗条目。 */
export interface DossierCardRelations {
  /** 全部关系的胶囊数据（未收口，顺序即主进程返回的出边在前 / 入边在后）。 */
  items: DossierRelationChip[]
  /** 与 `items` 一一对应的浮窗条目（供 `EntityCardMorePopup`）。 */
  moreItems: EntityCardMoreItem[]
}

/**
 * 关系摘要标签统一读作「正向前缀 对端名」（出边 / 入边同款，如「上级 抄书阁」
 * 「下级 抄书阁」「属于 砚秋」）；平级（`peer`）两端都不标前缀，只显示对端名。
 * 唯一例外是入边的 `belongs_to`：该码描述「对端属于我」，若取正向「属于 对端名」
 * 会被读成「我属于对方」，故保留反向收尾「对端名 属于我」。未知语义码（历史残留空码）
 * 只显示对端名。文案计算统一走 `relationChipLabel`。
 *
 * `peerId` 一并透出，供标签悬停时取对端实体详情（名称 / 类别 / 正文摘要）；
 * `entityType` / `presetKey` 取自关系摘要的对端字段，供标签按对端模块 + 预设分类取色。
 * 无关系返回空数组（`items` / `moreItems` 均为空）。
 */
export function dossierCardRelations(relations: DossierRow['relations']): DossierCardRelations {
  const items: DossierRelationChip[] = relations.map((relation) => ({
    peerId: relation.peerId,
    label: relationChipLabel(relation),
    chipClass: entityChipClass(relation.peerEntityType, relation.peerPresetKey),
    entityType: relation.peerEntityType,
    presetKey: relation.peerPresetKey
  }))
  // 「+N」浮窗条目：文案与配色直接复用上面同一份结果，避免第二套映射口径。
  const moreItems: EntityCardMoreItem[] = items.map((item) => ({
    peerId: item.peerId,
    label: item.label,
    chipClass: item.chipClass
  }))
  return { items, moreItems }
}

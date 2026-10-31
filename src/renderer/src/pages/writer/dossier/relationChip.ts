/**
 * 关系 / 别名标签的**配色类名**与**关系文案**计算（纯函数，不依赖 React）。
 *
 * 视觉真源为全局胶囊层：`chip-pill-tokens.css` 负责 `.chip-m-*`（5 个模块基色，供自定义
 * 分类 / 未分类兜底）与胶囊形态，`chip-preset-colors.css` 负责 `.chip-p-*`（23 个预设子类
 * 各一独立色）。二者合计即「23 预设 + 5 模块 = 28 色」口径。
 *
 * 旧的「分类顺序 → 6 档色阶（`.chip-s0` ~ `.chip-s5`）」取色方式已下线：本模块不再按
 * 分类顺序算深浅。CSS 中存量的 `.chip-s*` 定义仅为既有样式保留，不由本模块产出。
 */
import type { WorldEntityType } from '../../../../../preload/types/worldEntity'
import {
  relationSemanticLabel,
  relationSemanticReverseLabel
} from '../../../../../shared/worldRelationCodes'
import { presetChipClass } from './presetChipColors'

/**
 * 按「模块 + 预设键」拼装配色类名：始终带模块类 `chip-m-<entityType>`（`power_system`
 * 保持下划线原样，与 CSS 选择器一致，**不做**驼峰转换）；命中 23 个预设子类时再追加
 * `chip-p-<presetKey>`（该预设的独立颜色）。
 *
 * 兜底：未命中（自定义分类 / 未分类 / 空串）时只返回模块类，由 `chip-pill-tokens.css` 的
 * `:root` 默认 `--chip-mix` 兜底，保证标签始终有色可辨而不是退回无色。
 *
 * `.chip-p-*` 与 `.chip-m-*` 特异性相同，前者在 `index.css` 中后加载，因此预设色天然覆盖
 * 模块基色。
 */
export function entityChipClass(entityType: WorldEntityType, presetKey: string): string {
  const moduleClass = `chip-m-${entityType}`
  const presetClass = presetChipClass(presetKey)
  return presetClass ? `${moduleClass} ${presetClass}` : moduleClass
}

/**
 * 关系胶囊文案所需的最小结构：档案卡摘要（`DossierRow['relations'][number]`）与实体详情
 * 摘要（`WorldEntityDetail['relations'][number]`）同为主进程的 `WorldEntityRelationSummary`，
 * 此处只声明文案用到的三个字段，避免渲染层为一句文案反向依赖主进程类型模块。
 */
export interface RelationChipSource {
  /** 相对当前实体的方向：`'out'` 出边 / `'in'` 入边。 */
  direction: 'out' | 'in'
  /** 语义码（`superior` / `subordinate` / `peer` / `belongs_to` 等，可能为空串）。 */
  semanticCode: string
  /** 对端实体名称。 */
  targetName: string
}

/**
 * 单条关系的关系摘要标签统一读作「正向前缀 对端名」（出边 / 入边同款，如「上级 抄书阁」
 * 「下级 抄书阁」「属于 砚秋」）；平级（`peer`）两端都不标前缀，只显示对端名。
 * 唯一例外是入边的 `belongs_to`：该码描述「对端属于我」，若取正向「属于 对端名」
 * 会被读成「我属于对方」，故保留反向收尾「对端名 属于我」。未知语义码（历史残留空码）
 * 只显示对端名。
 *
 * 收敛自 `DossierView.tsx`（`relationChipLabel`）与 `HoverCard.tsx`（`relationLabel`）
 * 两份逐字等价实现；档案卡第四行、实体悬停卡与「+N」浮窗共用本函数，保证三处口径一致。
 */
export function relationChipLabel(relation: RelationChipSource): string {
  const name = relation.targetName
  if (relation.direction === 'in' && relation.semanticCode === 'belongs_to') {
    return `${name} ${relationSemanticReverseLabel('belongs_to')}`
  }
  const label = relationSemanticLabel(relation.semanticCode)
  return relation.semanticCode === 'peer' || label === '' ? name : `${label} ${name}`
}

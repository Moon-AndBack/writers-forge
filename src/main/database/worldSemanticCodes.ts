import { RELATION_SEMANTIC_LABELS } from '../../shared/worldRelationCodes'

/**
 * 统一设定库 · 关系类型（语义码）字典真源（码与类型约束；展示名取自共享层）。
 *
 * 关系类型收敛为两类语义：
 * - 层级三码（世界观与势力之间可选，含世界观 ↔ 世界观 / 世界观 ↔ 势力 / 势力 ↔ 势力）：
 *   `superior`（上级，源是目标的上级）、`subordinate`（下级，源是目标的下级）、
 *   `peer`（平级，两端互不统属）；
 * - `belongs_to`（属于）：语义为「from 属于 to」，其余模块组合通用（角色属于势力、
 *   物品属于角色等）；角色 → 物品由界面层自动反向写为「物品属于角色」。
 *
 * `from_type` / `to_type` 全部为 `NULL`（不限模块，任意实体对通用）；具体某对模块能选
 * 哪些码由渲染层按模块组合计算（`dossierTree.ts` 的 `relationCodesForPair`），字典本身
 * 不按模块收窄，便于后续扩展组合而无需迁移。`note` 为界面展示名，属**数据常量**（不译），
 * 中文字面量即最终展示文案——真源为共享层 `src/shared/worldRelationCodes.ts`（渲染层卡片
 * 摘要同源取用），本文件不再另写一份。
 *
 * 消费方：
 * - `worldEntitySeed.ts` 的 `seedSemanticCodeDictionary()`（每次启动幂等补齐）；
 * - `worldRefsHierarchyMigration.ts`（一次性清空旧码并重灌本字典）。
 * 两处共用同一常量，禁止各写一份，避免字典漂移。
 */
export interface SemanticCodeDef {
  code: string
  fromType: string | null
  toType: string | null
  note: string
}

/** 关系类型字典（顺序即界面默认展示顺序的稳定来源）。 */
export const HIERARCHY_SEMANTIC_CODES: ReadonlyArray<SemanticCodeDef> = [
  { code: 'superior', fromType: null, toType: null, note: RELATION_SEMANTIC_LABELS.superior },
  {
    code: 'subordinate',
    fromType: null,
    toType: null,
    note: RELATION_SEMANTIC_LABELS.subordinate
  },
  { code: 'peer', fromType: null, toType: null, note: RELATION_SEMANTIC_LABELS.peer },
  {
    code: 'belongs_to',
    fromType: null,
    toType: null,
    note: RELATION_SEMANTIC_LABELS.belongs_to
  }
]

/** 允许保留的语义码（迁移按此白名单清理旧码）。 */
export const HIERARCHY_SEMANTIC_CODE_NAMES: readonly string[] = HIERARCHY_SEMANTIC_CODES.map(
  (entry) => entry.code
)

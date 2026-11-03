/**
 * 关系语义码的**中文名**（主进程字典 `note` 播种用；渲染层展示名走 i18n）。
 *
 * 用途分两层：
 * - **主进程**（`worldSemanticCodes.ts`）：把本表中文名写进 `world_semantic_codes.note`，仅作
 *   **未知 / 自定义语义码**的兜底展示；该 note 属**数据常量**（不译），中文字面量即数据。
 * - **渲染层**：四个内置码的界面展示名已改由 i18n 提供（`dossier` ns 的
 *   `detail.relation.typeName` / `detail.relation.peerLabel`，见 `dossier/useRelationLabels.ts`），
 *   本文件不被渲染层引用。
 *
 * 语义码分两类：
 * - 层级三码（`superior` / `subordinate` / `peer`）：世界观与势力之间可选（含
 *   世界观 ↔ 世界观、世界观 ↔ 势力、势力 ↔ 势力）；
 * - 归属码（`belongs_to`，语义为「from 属于 to」）：其余模块组合通用。
 *
 * 方向口径：`from → to` 记录一条关系，`superior` 表示「from 是 to 的上级」。
 * 卡片展示**不以「我」为中心**，而是直接描述对端身份（如当前条目是 `from` 时显示
 * 「下级 对端名」，是 `to` 时显示「上级 对端名」），映射见 `useRelationLabels`。
 */
export const RELATION_SEMANTIC_LABELS: Readonly<Record<string, string>> = {
  superior: '上级',
  subordinate: '下级',
  peer: '平级',
  belongs_to: '属于'
}

/** 取语义码中文兜底名；未知 / 空码返回空串（调用方按自身兜底）。 */
export function relationSemanticLabel(code: string): string {
  return RELATION_SEMANTIC_LABELS[code] ?? ''
}

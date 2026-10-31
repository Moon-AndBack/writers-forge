/**
 * 关系语义码展示名**唯一真源**：主进程字典（`worldSemanticCodes.ts`）
 * 与渲染层卡片关系摘要（`DossierView`）共用，避免两处各写一份中文字面量而漂移。
 *
 * 口径：`note` 属**数据常量**（不译），中文字面量即最终展示文案；详见 AGENTS §10「不译项」。
 *
 * 语义码分两类：
 * - 层级三码（`superior` / `subordinate` / `peer`）：世界观与势力之间可选（含
 *   世界观 ↔ 世界观、世界观 ↔ 势力、势力 ↔ 势力）；
 * - 归属码（`belongs_to`，语义为「from 属于 to」）：其余模块组合通用。
 */
export const RELATION_SEMANTIC_LABELS: Readonly<Record<string, string>> = {
  superior: '上级',
  subordinate: '下级',
  peer: '平级',
  belongs_to: '属于'
}

/**
 * 语义码**反向**展示名：以「当前卡片对应实体」为参照，描述另一端与我的关系。
 *
 * - 卡片摘要（`DossierView`）：出边读作「<正向标签> <对端名>」（如「上级 文心城」）；
 *   入边读作「<对端名> <反向标签>」（如角色卡上「锻笔剑 属于我」、
 *   势力 B 卡上「势力 A 是我的上级」）。
 * - 「关联关系」弹窗的入边胶囊（`RelationList`）改用与出边一致的**正向**读法
 *   「<正向标签> <对端名>」，本表仅 `belongs_to` 仍被使用（「对端名 属于我」），
 *   其余三码在弹窗入边不再读取反向文案。
 *
 * 反向文案同样属数据常量，不纳入 i18n。
 */
export const RELATION_SEMANTIC_REVERSE_LABELS: Readonly<Record<string, string>> = {
  superior: '是我的上级',
  subordinate: '是我的下级',
  peer: '与我平级',
  belongs_to: '属于我'
}

/** 取语义码展示名；未知 / 空码返回空串（调用方按「只显示目标名」兜底）。 */
export function relationSemanticLabel(code: string): string {
  return RELATION_SEMANTIC_LABELS[code] ?? ''
}

/** 取语义码反向展示名；未知 / 空码返回空串（调用方按「只显示对端名」兜底）。 */
export function relationSemanticReverseLabel(code: string): string {
  return RELATION_SEMANTIC_REVERSE_LABELS[code] ?? ''
}

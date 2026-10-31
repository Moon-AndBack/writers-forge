/**
 * 统一设定库 · 主表 CRUD（五类统一寻址）。
 *
 * 结构真源见 `schema/worldEntities.ts`；本文件按职责拆分后的单一入口：
 * - `worldEntityTypes.ts`：公共类型 / 枚举常量；
 * - `worldEntityMeta.ts`：别名 / 长文本 / 标签；
 * - `worldRefs.ts`：通用引用（出 / 入边、语义码字典）；
 * - `worldPowerQueries.ts`：境界体系只读；
 * - `worldItemGradeRank.ts`：物品品阶（`grade` / `rank`）读写（第 3 批起落在物品子分类表）。
 * - `worldEntityQueries.ts`：主表只读路径（列表 / 详情）；
 * - `worldEntityWrites.ts`：主表写路径（增 / 改 / 软删 + 子表字段）。
 * 主表 + 模块子表（character / power_system）+ 子类字段的读写在上述两文件内，
 * 本文件只做统一再导出，供上层单点引用。
 *
 * 依赖方向单向：本 barrel → `worldEntityQueries` / `worldEntityWrites`；
 * `worldEntityQueries` → `worldEntityShared`；`worldEntityWrites` → `worldEntityShared` +
 * `worldEntityQueries`。`worldEntityShared.ts` 承载读 / 写共用的模块私有常量，
 * **不**在此再导出（不扩大公共 API）。
 *
 * 子类（第 4 批）：真源为 `world_entities.subtype_id` → `world_subtypes`。读路径统一
 * `LEFT JOIN world_subtypes st ON st.id = e.subtype_id`，把分类名与预设路由键投影为
 * `subType` / `presetKey`；写路径只接受 `subtypeId`（分类归属由 `resolveEntitySubtype`
 * 校验，不满足按未分类处理）。
 *
 * 约定：
 * - 读 / 写默认过滤 `deleted_at IS NULL`；删除为软删（仅置 `deleted_at`）；
 * - 子表行由**数据库触发器**在插入主行时补建，本层只更新既有子行；类型不匹配时
 *   `UPDATE` 命中 0 行，天然忽略；
 * - 写操作均包事务，任何字段变更（含仅改别名 / 标签 / 正文）都刷新
 *   `updated_at` + `revision+1`，供后续匹配 / 列表缓存按版本失效。
 */

export * from './worldEntityTypes'
export * from './worldEntityMeta'
export * from './worldRefs'
export * from './worldPowerQueries'
export * from './worldPowerWrites'
export * from './worldEntityQueries'
export * from './worldEntityWrites'

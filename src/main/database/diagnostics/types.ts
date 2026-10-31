/**
 * 数据健康自检（diagnostics）域类型。
 *
 * **不产出任何用户可见文案**（AGENTS §10）：只回传**结构化问题码 + 插值参数**，
 * 文案由渲染层经 i18n（`diagnostics` ns）按 `issue.<code>.title` / `.detail` 渲染。
 *
 * 问题码即 i18n key 的中间路径：`<code>.title` / `<code>.detail` 均为
 * `locales/{zh-CN,en}/diagnostics.ts` 中 `issue.<code>` 下的两个叶子。
 * 新增 / 删除问题码**必须**同步双端资源（缺 key 会在 `npm run typecheck:web` 报错）。
 */

/** 问题码（字面量联合：渲染层可经模板字面量精确映射到 i18n key）。 */
export type DiagnosticsIssueCode =
  // ---- 结构：严格相等（多出亦算不符）----
  | 'structure.missingTable'
  | 'structure.extraTable'
  | 'structure.missingColumn'
  | 'structure.extraColumn'
  | 'structure.missingIndex'
  | 'structure.extraIndex'
  // ---- A 类：外键悬空 ----
  | 'foreignKey.orphan'
  // ---- B 类：应用层不变量 ----
  | 'invariant.volumeWithoutOutline'
  | 'invariant.duplicateVolumeOutline'
  | 'invariant.chapterInGroupVolume'
  | 'invariant.specialChapterMissingPrefix'
  | 'invariant.normalChapterPinned'
  | 'invariant.specialChapterInCustomVolume'
  | 'invariant.outlineItemConsistency'
  // ---- 统一设定库 / 剧情关联（批F）----
  | 'world.orphanChild'
  | 'world.entityChildMismatch'
  | 'world.selfRelation'
  | 'plot.sceneEntityOrphan'
  // ---- 文件完整性 ----
  | 'integrity.corrupt'
  // ---- 自检自身 ----
  | 'diagnostics.checkFailed'
  | 'diagnostics.internalError'

/**
 * 单条问题：`code` 定位 i18n 模板，`params` 为插值参数。
 *
 * 口径：**同类问题聚合为一条**（`n` = 命中总数，`items` = 前若干标识，
 * 以语言中立的 `', '` 连接、超出上限用 `…` 截断），避免弹窗列出成百上千行。
 *
 * ⚠️ 计数参数名用 `n` 而**非** `count`：i18next 把 `count` 视为复数选择器，
 * 会去查 `..._one` / `..._other` 变体 key（本项目资源无此变体）而取不到译文。
 */
export interface DiagnosticsIssue {
  code: DiagnosticsIssueCode
  params: Record<string, string | number>
}

/** 自检报告：`clean` = 无问题；`problems` = 至少一条 issue。 */
export interface DiagnosticsReport {
  status: 'clean' | 'problems'
  issues: DiagnosticsIssue[]
  /** 自检完成时刻（ISO 8601）。 */
  checkedAt: string
}

/**
 * 伏笔锚点的**展示口径**（纯函数，渲染层多处共用）。
 *
 * 数据层的锚点 `quote` 按设计保存**整段快照**（匹配算法据此判断段落是否被改动），
 * 真实选区另存在 `charStart` / `charEnd`。UI 上凡是要显示「选中文字」的地方，
 * 都必须先切出窄串——直接把 `quote` 当选中文字渲染会把整段显示出来。
 *
 * 本模块不改变数据层语义：`foreshadowAnchorMatch` / 正文标记仍使用整段 `quote`。
 */

/**
 * 取锚点快照中的选中文字（`quote.slice(charStart, charEnd)`）。
 *
 * 以下情况**回退整段 `quote`**（而不是空串）：
 * - `charStart` / `charEnd` 为 `null`（老数据 / 大纲锚点未记偏移）；
 * - `charEnd <= charStart`（空区间，快照无有效选区）；
 * - 越界（`charStart < 0` 或 `charEnd > quote.length`，快照与区间不一致）；
 * - `quote` 为空串（无内容可切，回退后仍为空串）。
 *
 * 回退整段而非空串：这些情况只说明**偏移信息不可用**，快照本身仍是用户创建时看到的
 * 那段正文——显示整段至少保留了上下文，比空白或报错更可解释；真正无内容时
 * `quote` 本身就是空串，调用方照常显示占位。
 */
export function sliceSelectedText(
  quote: string,
  charStart: number | null,
  charEnd: number | null
): string {
  if (quote === '') return quote
  if (charStart === null || charEnd === null) return quote
  if (charStart < 0 || charEnd > quote.length || charEnd <= charStart) return quote
  return quote.slice(charStart, charEnd)
}

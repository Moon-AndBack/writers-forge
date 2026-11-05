/**
 * 通用卡片网格的「单卡内容可用宽」读取（设定档案五域 / 伏笔共用，AGENTS §9）。
 *
 * `auto-fit` 网格各列等宽，`grid-template-columns` 的解析值即各列实际像素宽（列数随容器宽
 * 变化时该值同步变化），取首列即可代表所有卡片；再减去卡片自身左右内边距，得到卡内单行
 * 胶囊容器的可用宽。观察与「拖拽分隔条期间暂停测量」由 `useStableMeasure` 统一处理
 * （逐帧写回测量值会让列宽 / 胶囊折行 / 卡高 / 滚动条互相牵动，形成抖动闭环）。
 * 该值只作布局签名用（真实容量仍由 `useChipOverflow` 在 DOM 上实测），故取整避免抖动。
 */
export function readGridCardWidth(grid: HTMLElement): number {
  const card = grid.firstElementChild as HTMLElement | null
  const cardStyle = card === null ? null : window.getComputedStyle(card)
  const paddingX =
    (Number.parseFloat(cardStyle?.paddingLeft ?? '') || 0) +
    (Number.parseFloat(cardStyle?.paddingRight ?? '') || 0)
  const columnWidth = Number.parseFloat(window.getComputedStyle(grid).gridTemplateColumns)
  const base = Number.isFinite(columnWidth) ? columnWidth : (card?.offsetWidth ?? 0)
  return Math.max(0, Math.round(base - paddingX))
}

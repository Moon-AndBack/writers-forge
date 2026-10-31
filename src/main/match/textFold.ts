/**
 * 匹配用文本规范化（主进程）。
 *
 * 目标：词表（实体名 / 别名）与待匹配正文走**同一规则**，使「英文大小写、全角 / 半角、
 * 兼容字符、基字 + 组合附加符」等写法差异都能命中；同时**保证位置映射正确**——
 * 规范化结果的下标边界可映射回**原文 UTF-16 code unit 下标**，返回给渲染层的
 * `start` / `end` 始终指向原文正确区间。
 *
 * 规则：
 * 1. 按「基字 + 组合附加符（Unicode Mark）」分簇，对每簇做 **NFKC** 兼容规范化
 *    （`Ａ→A`、`①→1`、`ﬁ→fi`、`e+́→é` 等）；
 * 2. 再逐 code point 做**长度不变**的大小写折叠（折叠后长度变化的字符保留原样，
 *    确保同一字符在词表与正文两侧折叠一致，且不破坏 code point 计数）；
 * 3. **不 trim**（trim 会移动位置）：词条在构建匹配器时先 trim 词条本身即可
 *    （词条独立，不影响正文位置）。
 *
 * 位置映射：分簇产出「规范化文本 + 边界映射表」。簇内因 NFKC 展开 / 合并产生的
 * **内部边界**标记为非法切点（`valid=false`）——落在非法切点上的命中会被丢弃，
 * 从而避免把展开字符（如 `ﬁ`）的一半错标成整字区间。
 *
 * 已知限制：Hangul 分解字母（jamo）不成簇，不做 jamo 组合（极罕见，暂不处理）。
 */

/** 组合附加符（Unicode Mark 类）：跟随基字构成一簇。 */
const MARK_RE = /\p{M}/u

/**
 * 单 code point 大小写折叠：仅接受**长度不变**的折叠，否则保留原样。
 * 例：`İ`.toLowerCase() 长度为 2（会漂移）→ 保留 `İ`；`ß`.toUpperCase() 为 `SS` → 保留 `ß`。
 */
function foldCasePoint(ch: string): string {
  const lower = ch.toLowerCase()
  if (lower.length === ch.length) return lower
  const upper = ch.toUpperCase()
  if (upper.length === ch.length) return upper
  return ch
}

/** 规范化结果：折叠文本 + 边界映射 + 合法切点标记。 */
export interface FoldedText {
  /** 规范化后的文本（供 AC 扫描）。 */
  text: string
  /**
   * 规范化文本的 **code point 边界下标 → 原文 UTF-16 code unit 下标** 映射表。
   * 长度 = 折叠文本的 code point 数 + 1；末位恒为原文长度。
   */
  offsets: number[]
  /** 与 `offsets` 等长：该边界是否为「合法切点」（簇边界，可映射回原文）。 */
  valid: boolean[]
}

/** 按同一规则规范化一段文本，并给出「折叠下标 → 原文下标」映射。 */
export function foldForMatch(text: string): FoldedText {
  // 逐 code point 记录其在原文中的 code unit 起点。
  const points: Array<{ ch: string; unit: number }> = []
  let unit = 0
  for (const ch of text) {
    points.push({ ch, unit })
    unit += ch.length
  }

  const offsets: number[] = []
  const valid: boolean[] = []
  let folded = ''

  let i = 0
  while (i < points.length) {
    // 一簇 = 基字 + 其后连续的组合附加符。
    let j = i + 1
    while (j < points.length && MARK_RE.test(points[j].ch)) j += 1
    const startUnit = points[i].unit
    let cluster = ''
    for (let k = i; k < j; k += 1) cluster += points[k].ch

    const normalized = Array.from(cluster.normalize('NFKC'))
    for (let k = 0; k < normalized.length; k += 1) {
      const foldedPoint = foldCasePoint(normalized[k])
      const foldedPoints = Array.from(foldedPoint)
      for (let m = 0; m < foldedPoints.length; m += 1) {
        folded += foldedPoints[m]
        // 簇内首个 code point 的起点 = 簇起点（合法切点）；其余为簇内边界（非法切点）。
        offsets.push(startUnit)
        valid.push(k === 0 && m === 0)
      }
    }
    i = j
  }

  // 末位边界（= 原文长度）恒为合法切点。
  offsets.push(text.length)
  valid.push(true)

  return { text: folded, offsets, valid }
}

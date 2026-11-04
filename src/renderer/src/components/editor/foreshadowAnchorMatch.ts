/**
 * 伏笔锚点「部分存活」匹配（纯函数，零依赖，不碰 ProseMirror）。
 *
 * 语义单元是**选中文字** `quote.slice(charStart, charEnd)`，不是整段 `quote`：
 * - 段落里只改了选区之外的字（段首插入 / 段尾删除）→ 选中文字仍完整存活，重新定位即可；
 * - 选区内部被删掉几个字 → 剩下的连续片段仍算伏笔，标记铺在存活片段上；
 * - 选中的字被全部删光 → 才算失效（返回 `null`）。
 *
 * 三级匹配（成本由低到高，命中即返回）：
 * 0. **快速路径**：段落文本与快照逐字一致 → 直接返回原区间（绝大多数帧走这条）；
 * 1. **完整存活**：在当前文本里找选中文字，优先取离原位置最近的一处（同一段文字可能在
 *    段内重复出现，取第一处会把标记甩到段首）；
 * 2. **邻域有序贪心**：以原位置为中心 ±{@link NEIGHBOR_RADIUS} 字符内，按顺序逐个匹配
 *    选中文字的字符——被删掉的字符直接跳过，文本里多出来的字符形成片段间隔；连续命中的
 *    字符并成一段（纯删除时存活字天然相邻，只产生一段）。同时跑「不限间隔」与「紧邻
 *    （间隔 ≤{@link MAX_STEP} 字符）」两档，取存活字更多的结果，兼顾「被删的字在段内偶然
 *    重现」与「大段选中里插入长文本」两种相反场景；
 * 3. **全局兜底**：同样的贪心放到整段（选区外被大量插入 / 删除，邻域已不含存活字时）。
 *
 * 紧致度约束（{@link isAcceptable}）：存活片段的总跨度不得超过「存活字数 × 2 + 8」。
 * 纯删除时跨度 ≈ 存活字数，必过；只有用户在两段存活字之间插入了长文本时跨度才会膨胀
 * ——那正是应判失效的场景，否则会把两处存活字之间的整段无关文字都标成伏笔。
 *
 * 合并（{@link coalesceAnchorRuns}）：相邻片段间隔 ≤ {@link MERGE_GAP} 字符或全空白时并成
 * 一段，让「中间补一两个字」也被标记覆盖；合并后仍超过 {@link MAX_RUNS} 段则退化为首尾单区间
 * （片段过多会让 ProseMirror 生成大量 inline span，影响中文输入法组字）。
 */

/** 匹配出的连续存活片段（文本坐标，左闭右开，相对**当前**块文本）。 */
export interface AnchorRun {
  from: number
  to: number
}

/** 邻域贪心半径（字符）：覆盖常见的段首 / 段尾插入引起的整体位移。 */
const NEIGHBOR_RADIUS = 96

/** 紧致度余量：存活片段跨度允许超出「存活字数」的上限。 */
const SPAN_SLACK = 8

/** 合并阈值：相邻片段间隔 ≤ 该字符数（或全空白）时并成一段。 */
const MERGE_GAP = 2

/** 片段数上限：合并后仍超过该值 → 退化为首尾单区间。 */
const MAX_RUNS = 3

/**
 * 相邻存活字之间允许的最大文本间隔（字符）。
 *
 * 超出即视为「这个字已被删 / 已漂出邻域」而不是「这段被插入了长文本」：被删的字常在段落
 * 后面偶然重现，若一路追过去，对齐会被带到远处、跨度超限后整条标记失效。紧邻档的代价是
 * 「插入超过该长度的文字后，后半段存活字不再标记」，故与不设上限的宽松档并行跑，择优取用。
 */
const MAX_STEP = 12

/**
 * 有序贪心：在 `[lo, hi)` 内按顺序逐个匹配 `target` 的字符。
 *
 * 关键点是**以 target 为驱动**而不是遍历文本逐字比较：某个字被删掉时直接跳到 target 的
 * 下一个字（文本侧不留痕），文本侧多出的字则自然形成片段间隔——这样「删中间几个字」与
 * 「中间补几个字」都能正确对齐，不会因一个被删的字而丢掉后面的全部存活字。
 *
 * `maxStep` 为相邻存活字之间的间隔上限（`Infinity` = 不设限，见 {@link MAX_STEP}）。
 */
function greedyRuns(
  target: string,
  text: string,
  lo: number,
  hi: number,
  maxStep: number
): AnchorRun[] {
  const runs: AnchorRun[] = []
  let scan = lo
  let runStart = -1
  let runEnd = -1
  for (let i = 0; i < target.length; i += 1) {
    const at = text.indexOf(target[i], scan)
    // 窗口内找不到 → 该字已被删（或已漂出邻域）：跳过，扫描位置不前移。
    if (at < 0 || at >= hi) continue
    // 已有存活片段、但下一个存活字隔得太远 → 同样按「被删」处理，不追过去。
    if (runStart >= 0 && at - runEnd > maxStep) continue
    if (runStart >= 0 && at === runEnd) {
      runEnd = at + 1
    } else {
      if (runStart >= 0) runs.push({ from: runStart, to: runEnd })
      runStart = at
      runEnd = at + 1
    }
    scan = at + 1
  }
  if (runStart >= 0) runs.push({ from: runStart, to: runEnd })
  return runs
}

/** 存活字数（所有片段长度之和）。 */
function survivedLength(runs: readonly AnchorRun[]): number {
  return runs.reduce((sum, run) => sum + (run.to - run.from), 0)
}

/** 存活片段的首尾跨度。 */
function runsSpan(runs: readonly AnchorRun[]): number {
  return runs[runs.length - 1].to - runs[0].from
}

/** 紧致度判定：至少存活 1 个字符，且首尾跨度不超过「存活字数 × 2 + 8」。 */
function isAcceptable(runs: readonly AnchorRun[], targetLength: number): boolean {
  if (runs.length === 0) return false
  if (survivedLength(runs) < 1) return false
  return runsSpan(runs) <= targetLength * 2 + SPAN_SLACK
}

/** 在若干贪心候选里挑最优：存活字多者优先，其次首尾跨度小者。 */
function pickBestRuns(
  candidates: readonly AnchorRun[][],
  targetLength: number
): AnchorRun[] | null {
  let best: AnchorRun[] | null = null
  for (const runs of candidates) {
    if (!isAcceptable(runs, targetLength)) continue
    if (best === null) {
      best = runs
      continue
    }
    const survivedDiff = survivedLength(runs) - survivedLength(best)
    if (survivedDiff > 0 || (survivedDiff === 0 && runsSpan(runs) < runsSpan(best))) best = runs
  }
  return best
}

/** 在当前文本里找 `target` 的全部出现位置，返回离 `prefer` 最近的一处（无则 -1）。 */
function findNearestOccurrence(text: string, target: string, prefer: number): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  let at = text.indexOf(target)
  while (at >= 0) {
    const distance = Math.abs(at - prefer)
    if (distance < bestDistance) {
      best = at
      bestDistance = distance
    }
    at = text.indexOf(target, at + 1)
  }
  return best
}

/**
 * 把锚点快照匹配到**当前**块文本上，返回存活片段（文本坐标）；锚点已完全失效返回 `null`。
 *
 * `charStart` / `charEnd` 是快照 `quote` 内的字符区间（与 `paragraphAnchor` 同口径），
 * 返回的片段坐标则相对 `text`（当前 `block.textContent`）。
 */
export function matchAnchorRuns(
  text: string,
  quote: string,
  charStart: number,
  charEnd: number
): AnchorRun[] | null {
  if (charStart < 0 || charEnd > quote.length || charEnd <= charStart) return null

  // 0) 快速路径：段落未改动（绝大多数帧）。
  if (text === quote) return [{ from: charStart, to: charEnd }]

  const target = quote.slice(charStart, charEnd)
  if (target === '') return null

  // 1) 完整存活：选区外被编辑 / 段首插入导致整体位移。
  const near = findNearestOccurrence(text, target, charStart)
  if (near >= 0) return [{ from: near, to: near + target.length }]

  // 2) 邻域有序贪心（宽松档 + 紧邻档，择优）。
  const lo = Math.max(0, charStart - NEIGHBOR_RADIUS)
  const hi = Math.min(text.length, charEnd + NEIGHBOR_RADIUS)
  const local = pickBestRuns(
    [greedyRuns(target, text, lo, hi, Infinity), greedyRuns(target, text, lo, hi, MAX_STEP)],
    target.length
  )
  if (local !== null) return local

  // 3) 全局兜底（同样两档）。
  return pickBestRuns(
    [
      greedyRuns(target, text, 0, text.length, Infinity),
      greedyRuns(target, text, 0, text.length, MAX_STEP)
    ],
    target.length
  )
}

/**
 * 合并相邻片段：间隔为空 / 全空白 / ≤ {@link MERGE_GAP} 字符时并成一段；
 * 合并后仍超过 {@link MAX_RUNS} 段 → 退化为 `[首段起点, 末段终点]` 单区间。
 */
export function coalesceAnchorRuns(runs: readonly AnchorRun[], text: string): AnchorRun[] {
  if (runs.length === 0) return []
  const merged: AnchorRun[] = [{ from: runs[0].from, to: runs[0].to }]
  for (let i = 1; i < runs.length; i += 1) {
    const run = runs[i]
    const prev = merged[merged.length - 1]
    const gap = text.slice(prev.to, run.from)
    if (gap.length <= MERGE_GAP || gap.trim() === '') {
      prev.to = run.to
      continue
    }
    merged.push({ from: run.from, to: run.to })
  }
  if (merged.length > MAX_RUNS) {
    return [{ from: merged[0].from, to: merged[merged.length - 1].to }]
  }
  return merged
}

export default matchAnchorRuns

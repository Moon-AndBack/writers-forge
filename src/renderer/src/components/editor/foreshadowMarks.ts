import type { Editor } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { coalesceAnchorRuns, matchAnchorRuns } from './foreshadowAnchorMatch'

/**
 * 伏笔「正文标记」：把锚定在当前章 / 当前大纲条目上的伏笔以 `Decoration.inline`
 * 铺在正文对应区间。同一段正文可同时承载三类互不替代的标记：
 * - **正文埋点**（`kind: 'plant'`）：`anchor_*` 快照所在区间；
 * - **大纲埋点**（`kind: 'plant2'`）：`anchor2_*` 快照所在区间（与正文埋点同状态、
 *   同视觉变体，仅 `kind` 与悬停文案前缀不同——两槽位可各留一处标记）；
 * - **回收点**（`kind: 'recover'`）：`recover_*` 快照所在区间。
 *
 * 四种视觉变体（线型 / 颜色见 `styles/foreshadow-mark.css`，四主题经令牌自适应）：
 * - `planted`：埋设中（派生状态 `planted`）→ 品牌色虚线；
 * - `abandoned`：埋设点、但伏笔已废弃（派生状态 `abandoned`）→ 浅灰虚线（比「已回收」的灰实线更浅）；
 * - `recovered`：埋设点、但伏笔已回收（有回收点，派生优先级最高）→ 中性灰实线；
 * - `recover-site`：回收点本身 → 成就色点线。
 * 悬停内容由调用层组好后随条目传入（存插件 state，**不**写进 span 属性）：本层只负责铺装饰，
 * 浮层由 `useMarkHover` + `MarkHoverTip` 按 `data-foreshadow-id` 查表自绘，不用原生 `title`。
 *
 * 设计要点（与 `outlineSearch.ts` / `proofreadMark.ts` 同构）：
 * - 插件 state 只保存**标记条目列表**（`ForeshadowMarkEntry[]`），不保存 DecorationSet：
 *   装饰由 `props.decorations` 依**当前 doc** 即时构建，故切章 `setContent` / 用户编辑
 *   引起的文档变化会自动重算位置，无需 `tr.mapping` 映射，也不会因载入时序错位而漏标；
 * - 埋设 / 回收**共用一条列表 + `kind` / `variant` 判别字段**（而非两组列表）：两类标记的
 *   区间解析、装饰构建、失效判定完全同源，合一条列表可免去两份重复循环与两次 `setMeta`；
 *   需要独立控制时按 `kind` 过滤即可；
 * - 数据**只**经 `tr.setMeta(foreshadowMarkKey, entries)` 写入（meta 事务不改文档、不动选区），
 *   严禁把伏笔数据塞进 `useEditor` 的 `extensions` / `content` / `editorProps` 闭包
 *   （W11 中文输入法焦点修复硬约束，见 `richTextExtensions.ts`）；
 * - **锚点部分存活即标记**：`paragraphIdx` 定位到的顶层块文本与快照 `quote` **不再要求**
 *   逐字一致——语义单元是选中文字 `quote.slice(charStart, charEnd)`，按「完整存活 → 邻域
 *   有序贪心 → 全局兜底」在当前文本里重新匹配（见 `foreshadowAnchorMatch.ts`）：删掉几个字
 *   仍然标记（只铺在存活片段上），存活 1 个字符就保留，全部删光才失效；中间补字（间隔
 *   ≤2 字符 / 全空白）并入同一段。一条标记可对应多个存活片段，每个片段一个
 *   `Decoration.inline`，故同一伏笔可能出现多个同 `data-foreshadow-id` 的 span。
 */

/** 标记 span 基础类名（样式见 `styles/foreshadow-mark.css`，四主题经令牌自适应）。 */
export const FORESHADOW_MARK_CLASS = 'wf-foreshadow-mark'

/** 埋设点·已废弃变体类名（浅灰虚线）。 */
export const FORESHADOW_ABANDONED_CLASS = 'wf-foreshadow-mark--abandoned'

/** 埋设点·已回收变体类名（灰色实线）。 */
export const FORESHADOW_RECOVERED_CLASS = 'wf-foreshadow-mark--recovered'

/** 回收点变体类名（成就色点线）。 */
export const FORESHADOW_RECOVER_SITE_CLASS = 'wf-foreshadow-mark--recover-site'

/** 标记 span 的伏笔 id 属性名（悬停浮层 `useMarkHover` 据此查插件 state 取文案）。 */
export const FORESHADOW_ID_ATTR = 'data-foreshadow-id'

/** 标记 span 的「埋设 / 回收」判别属性（`plant` / `plant2` / `recover`；悬停查表时用于区分同一伏笔的多处标记）。 */
export const FORESHADOW_KIND_ATTR = 'data-foreshadow-mark'

/** 插件 key（供外部经 `tr.setMeta` 写回标记条目）。 */
export const foreshadowMarkKey = new PluginKey<readonly ForeshadowMarkEntry[]>('foreshadowMark')

/** 标记来源：正文埋点 / 大纲埋点 / 回收点。 */
export type ForeshadowMarkKind = 'plant' | 'plant2' | 'recover'

/** 标记视觉变体：埋设中 / 埋设点已废弃 / 埋设点已回收 / 回收点。 */
export type ForeshadowMarkVariant = 'planted' | 'abandoned' | 'recovered' | 'recover-site'

/**
 * 悬停浮窗的三行内容（调用层组好，本层只承载与透传）。
 *
 * 拆成对象而非三个平铺字段：三行是**同一个展示单元**，随 `useMarkHover` 一次性
 * 传给 `MarkHoverTip`；平铺会让 `ForeshadowMarkEntry` 同时混入「锚点几何」与
 * 「展示文案」两组互不相关的字段，取值 / 判空 / 传参都要逐个列举。
 */
export interface ForeshadowMarkTip {
  /** 第 1 行：`伏笔：名字`（名字为空以「未命名伏笔」兜底）。 */
  heading: string
  /** 第 2 行：回收位置 / 待回收 / 已废弃 / 原锚点位置（按 `variant` 分支）。 */
  status: string
  /** 第 3 行：伏笔描述；空串 = 不渲染该行。 */
  description: string
}

/**
 * 单条正文标记（调用层把 `ForeshadowRow` 的埋设 / 回收字段解构成此结构，
 * `variant` / `tip` 已按状态与位置名组好，本层不再关心数据来源）。
 */
export interface ForeshadowMarkEntry {
  /** 伏笔 id（写入 `data-foreshadow-id`）。 */
  id: number
  kind: ForeshadowMarkKind
  variant: ForeshadowMarkVariant
  /** 悬停浮窗三行内容（由 `useMarkHover` 读插件 state 后经自绘浮层展示）。 */
  tip: ForeshadowMarkTip
  paragraphIdx: number | null
  quote: string
  charStart: number | null
  charEnd: number | null
}

/** 单条标记的文档绝对区间（左闭右开；一条条目可能解析出多个存活片段）。 */
interface MarkRange {
  from: number
  to: number
}

/** 变体 → span class（四种变体都保留基础类，样式只挂变体修饰类）。 */
const VARIANT_CLASSES: Record<ForeshadowMarkVariant, string> = {
  planted: FORESHADOW_MARK_CLASS,
  abandoned: `${FORESHADOW_MARK_CLASS} ${FORESHADOW_ABANDONED_CLASS}`,
  recovered: `${FORESHADOW_MARK_CLASS} ${FORESHADOW_RECOVERED_CLASS}`,
  'recover-site': `${FORESHADOW_MARK_CLASS} ${FORESHADOW_RECOVER_SITE_CLASS}`
}

/**
 * 「块文本偏移」→「块内文档偏移」（相对块内容起点）。
 *
 * 不能直接相加：行内原子节点（图片 / 硬换行）占文档位置却不贡献 `textContent`，
 * 直接相加会把锚点区间整体前移。这里按子节点顺序累计文本长度（原子节点记 0），
 * 口径与 `paragraphAnchor.ts` 的 `textBetween(..., '')` 一致。
 */
function textOffsetToDocOffset(block: PMNode, charOffset: number): number {
  if (charOffset <= 0) return 0
  let consumed = 0
  let found = -1
  block.nodesBetween(0, block.content.size, (node, pos) => {
    if (found >= 0) return false
    if (!node.isText) return undefined
    const length = node.text?.length ?? 0
    if (consumed + length >= charOffset) {
      found = pos + (charOffset - consumed)
      return false
    }
    consumed += length
    return undefined
  })
  // 偏移超出当前文本总长（快照与当前文本不一致的边界情形）：夹到内容末尾。
  return found >= 0 ? found : block.content.size
}

/**
 * 把一条标记条目解析为当前文档的绝对区间；锚点已完全失效返回 `null`。
 *
 * 位置口径与 `paragraphAnchor.ts` 一致：`paragraphIdx` 是 **doc 第 n 个子节点**（0 起），
 * 块起点 = 前序顶层块 `nodeSize` 之和，块**内容起点** = 块起点 + 1（越过开标记）。
 * 存活判定见 `foreshadowAnchorMatch.ts`：选中的字删掉几个仍然标记（铺在存活片段上），
 * 全部删光才失效；存活片段可能不止一个，故返回区间数组。
 */
function resolveMarkRanges(doc: PMNode, entry: ForeshadowMarkEntry): MarkRange[] | null {
  const { paragraphIdx, quote, charStart, charEnd } = entry
  if (paragraphIdx === null || charStart === null || charEnd === null) return null
  if (paragraphIdx < 0 || paragraphIdx >= doc.childCount) return null
  // 快照区间本身必须自洽：非空且落在 quote 内。
  if (charStart < 0 || charEnd > quote.length || charEnd <= charStart) return null

  let blockStart = 0
  for (let i = 0; i < paragraphIdx; i += 1) blockStart += doc.child(i).nodeSize
  const block = doc.child(paragraphIdx)
  const text = block.textContent

  const runs = matchAnchorRuns(text, quote, charStart, charEnd)
  if (runs === null) return null

  const contentStart = blockStart + 1
  const ranges: MarkRange[] = []
  for (const run of coalesceAnchorRuns(runs, text)) {
    const from = contentStart + textOffsetToDocOffset(block, run.from)
    const to = contentStart + textOffsetToDocOffset(block, run.to)
    if (to > from) ranges.push({ from, to })
  }
  return ranges.length === 0 ? null : ranges
}

/**
 * 由标记条目构建 inline DecorationSet（失效条跳过；空列表 → 空集合）。
 *
 * 一条条目可能解析出**多个**存活片段（中间被插入长文本时），每个片段各铺一条
 * `Decoration.inline`，它们共用同一组 attrs（同 `data-foreshadow-id` + 同 `kind`），
 * 悬停时 `useMarkHover` 按 `id + kind` 查表仍能命中同一条内容。去重键为
 * `id:from:to`，只拦「同一伏笔同一区间」的重复条目。
 *
 * 重叠处理：**同一伏笔**的埋设区间与回收区间恰好完全重合（就地回收的极端情形）时，
 * 只保留先入的埋设条目。两个 `Decoration.inline` 落同一区间时 ProseMirror 会嵌套两层
 * span，`text-decoration` 叠成一条更粗的线、`data-foreshadow-id` 也只留内层可读——与其叠出
 * 一团，不如保留信息量更大的埋设点（其 `tip.status` 已指出回收位置）。
 * 不同伏笔的区间重叠无法避免（锚点各自独立），交给 ProseMirror 正常嵌套。
 */
function buildForeshadowDecorations(
  doc: PMNode,
  entries: readonly ForeshadowMarkEntry[]
): DecorationSet {
  if (entries.length === 0) return DecorationSet.empty
  const decorations: Decoration[] = []
  const claimed = new Set<string>()
  for (const entry of entries) {
    const ranges = resolveMarkRanges(doc, entry)
    if (ranges === null) continue
    const attrs: Record<string, string> = {
      class: VARIANT_CLASSES[entry.variant],
      [FORESHADOW_ID_ATTR]: String(entry.id),
      [FORESHADOW_KIND_ATTR]: entry.kind
    }
    for (const range of ranges) {
      const key = `${String(entry.id)}:${String(range.from)}:${String(range.to)}`
      if (claimed.has(key)) continue
      claimed.add(key)
      // 悬停内容不进 DOM 属性：由 useMarkHover 按 id + kind 查插件 state 后经自绘浮层展示
      // （原生 `title` 方角、延迟约 1s、不随主题，已弃用）。
      decorations.push(Decoration.inline(range.from, range.to, attrs))
    }
  }
  return decorations.length === 0 ? DecorationSet.empty : DecorationSet.create(doc, decorations)
}

/**
 * 伏笔正文标记扩展：插件 state 保存标记条目列表，`props.decorations` 依当前 doc 即时构建。
 *
 * state 的 `apply` 只处理 meta 直写；文档变更**不**改动列表——装饰在每次 state 更新时
 * 由 `decorations` 依据新 doc 重新解析，锚点随段落位移 / 文本改动自动保持或失效。
 */
export const ForeshadowMark = Extension.create({
  name: 'foreshadowMark',

  addProseMirrorPlugins() {
    return [
      new Plugin<readonly ForeshadowMarkEntry[]>({
        key: foreshadowMarkKey,
        state: {
          init(): readonly ForeshadowMarkEntry[] {
            return []
          },
          apply(tr, entries): readonly ForeshadowMarkEntry[] {
            const meta = tr.getMeta(foreshadowMarkKey) as readonly ForeshadowMarkEntry[] | undefined
            return meta ?? entries
          }
        },
        props: {
          decorations(state: EditorState): DecorationSet {
            return buildForeshadowDecorations(state.doc, foreshadowMarkKey.getState(state) ?? [])
          }
        }
      })
    ]
  }
})

/**
 * 写回当前编辑器要标记的伏笔条目（空数组 = 清空全部标记）。
 *
 * 只发 meta 事务：不改文档、不动选区、不抢焦点（IME 安全），可重复调用
 * （数据刷新 / 创建 / 回收成功后复用）。
 */
export function updateForeshadowMarks(
  editor: Editor,
  entries: readonly ForeshadowMarkEntry[]
): void {
  if (editor.isDestroyed || !editor.isInitialized) return
  editor.view.dispatch(editor.state.tr.setMeta(foreshadowMarkKey, entries))
}

export default ForeshadowMark

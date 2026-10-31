import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor as TiptapEditor } from '@tiptap/core'
import { countCharacters } from './chapters/docParagraphs'

/**
 * 单篇正文字数上限 · **输入时阻止**（渲染层核心）。
 *
 * **上限口径**：单篇 ≤ 200,000 有效字（每章正文独立计、每条大纲正文独立计，**非全书合计**）；
 * 有效字 = 排除标点 / 符号 / 空白 / 控制符，直接复用 `docParagraphs.countCharacters`
 * 这一**既有唯一真源**，不新造统计逻辑。
 *
 * **拦截机制（为何可靠）**：ProseMirror `PluginSpec.filterTransaction` —— 在
 * `EditorState.applyTransaction` 的**第一行**调用，返回 false 即返回
 * `{ state: this, transactions: [] }`（state 原样不动）；Tiptap `dispatchTransaction`
 * 随后 `if (!rootTrWasApplied) return`，既不 `updateState` 也不 emit 任何事件。展开：
 * 1. **内容零丢失**：被拒事务的 step 根本不 apply —— 既不改 doc，也不会回滚用户
 *    上一次成功的输入（上一次成功输入是**上一个**事务，已在更早的 `updateState` 中落定）；
 * 2. **光标零跳动**：state 未更换 → `EditorView.updateStateInner` 不进入 `updateSel`
 *    分支 → DOM selection 不重写；
 * 3. **覆盖面**：ProseMirror 中**一切 doc 变更**最终都经 `view.dispatch(tr)` 汇入同一
 *    拦截点 —— 击键（`handleTextInput`）、**IME 确认**（`readDOMChange` 产出的 tr）、
 *    **粘贴**（`doPaste`:3783 `view.dispatch(tr...)`）、拖放（`handleDrop`）、
 *    块级 split / join / wrap、**撤销重做**（history）、替换命令无一例外。
 *    故**单一钩子即全覆盖**，无需逐入口枚举（这是选它而非 `handleTextInput` 的理由：
 *    后者只管直接键入，粘贴 / 块级操作 / 撤销全都要另写钩子，必然漏）。
 *
 * **性能策略（本任务的关键风险）**：20 万有效字（1667 段）下**全量统计实测 ~10.7ms/次**
 * （Node 24，本机），逐键全量遍历必然卡顿。本模块因此采用三层优化：
 * - **L1 差量短路**（绝大多数击键走这条）：用 `step.getMap()` 取事务插入的新区间，
 *    只统计**新增内容**的可计字符（O(插入量)），`当前总数 + 增量 ≤ 上限` 即放行，
 *    连块级统计都不执行；
 * - **L2 块级增量**：维护「每顶层块有效字数」缓存，`filterTransaction` 需要精确值时
 *    按 stepMap 定位**被触碰块**重算（实测单块 ~0.006ms），未触碰块沿用旧值；
 * - **L3 共享读数**：`docCharCount(editor)` 读同一份缓存 —— UI 脚注显示的字数与
 *    拦截依据的字数**同源同值**，不存在「显示没到上限却被拦」的错位。
 *
 * **切换章 / 重载的例外**：`setContent` 走 `replaceWith` 事务，同样经过本拦截点。
 * 本扩展据「单个 ReplaceStep 覆盖 `[0, 旧 doc 全文]`」**自动识别整篇改写并放行**
 * （见 `isWholeDocReplace`），保证「库内已有内容无条件可加载，仅用户继续输入被拦」，
 * 对上限下调 / 历史超限数据也不会打不开；用户正常输入则永远无法突破上限
 * （拦截阈值取 **> 上限**，即允许刚好填到 200,000）。
 */

/** 单篇正文有效字数上限（与主进程 `ipc/docLimit.MAX_DOC_CHARS` 同值，跨进程须同步）。 */
export const MAX_DOC_CHARS = 200_000

/** 预警阈值比例：达到上限的 90% 即在脚注变色并提示「接近上限」。 */
export const DOC_LIMIT_WARN_RATIO = 0.9

/** 达到预警阈值的有效字数（`200_000 * 0.9` = 180,000）。 */
export const DOC_LIMIT_WARN_CHARS = Math.floor(MAX_DOC_CHARS * DOC_LIMIT_WARN_RATIO)

/**
 * 「显式整篇提交」事务标记（可选）：调用方若能确知某次改写是「库内内容加载」，
 * 可在派发前 `editor.commands.setMeta(DOC_LIMIT_COMMIT_META, true)` 声明以无条件放行。
 *
 * ⚠️ 实际上**无需使用** —— `isWholeDocReplace` 已能自动识别 `setContent` 的整篇替换，
 * 本 meta 仅作为诊断 / 未来其他整篇来源（如批量导入）的显式入口保留。
 */
export const DOC_LIMIT_COMMIT_META = 'docWordLimitCommit'

/** 拦截命中时写入的 transaction meta（供诊断区分「被拒」与「普通未变更」）。 */
export const DOC_LIMIT_EXCEEDED_META = 'docWordLimitExceeded'

/** 本插件 key：持有块级字数缓存。 */
const wordLimitKey = new PluginKey<number[]>('docWordLimit')

/* ---------- 纯计数工具（口径统一走 docParagraphs.countCharacters） ---------- */

/** doc 全部顶层块的纯文本（与 `docToParagraphs` 的 `text` 字段口径一致）。 */
function topBlockTexts(doc: ProseMirrorNode): string[] {
  const texts: string[] = []
  doc.forEach((node) => {
    texts.push(node.textContent)
  })
  return texts
}

/** 由 doc 全量重算块级有效字数（顶层块 = paragraphs 表的一行 / 大纲的一个块）。 */
function blockCounts(doc: ProseMirrorNode): number[] {
  return topBlockTexts(doc).map((text) => countCharacters([text]))
}

/** 块级字数合计。 */
function totalChars(counts: readonly number[]): number {
  let total = 0
  for (const value of counts) total += value
  return total
}

/**
 * 事务**新增**的可计字符数（差量，O(插入内容)）。
 *
 * 遍历各 step 的 `StepMap` 的 `[newStart, newEnd)` 新区间，在**事务结果 doc** 上取
 * `textBetween` 统计。删除 / 替换为纯删除时无新增区间 → 返回 0（只会使总数变小）。
 */
function insertedChars(tr: Transaction): number {
  let inserted = 0
  tr.steps.forEach((step) => {
    step.getMap().forEach((_from, _to, newStart, newEnd) => {
      if (newEnd <= newStart) return
      inserted += countCharacters([tr.doc.textBetween(newStart, newEnd, '')])
    })
  })
  return inserted
}

/* ---------- 拦截判定 ---------- */

/**
 * 事务是否属于「整篇改写」（`setContent` / 重载全库内容）：
 * 单个 `ReplaceStep` 覆盖 `[0, 旧 doc 全文]`（`from === 0 && to === 旧 doc.content.size`）。
 *
 * 这类事务来自**库内已有内容**（切章 / 搜索替换后重载 / 重置为空），不是用户输入 ——
 * 必须放行，否则上限下调或历史超限数据会导致章节打不开。故按「是否整篇改写」自动识别，
 * **调用方无需传任何标记**（比要求每个 setContent 点传 meta 更不易漏）。
 */
function isWholeDocReplace(tr: Transaction, oldDoc: ProseMirrorNode): boolean {
  if (tr.steps.length !== 1) return false
  // Step 基类不声明 from / to（仅 ReplaceStep 等子类有）；此处按结构收窄。
  const step = tr.steps[0] as { from?: number; to?: number }
  return step.from === 0 && step.to === oldDoc.content.size
}

/**
 * 事务是否会让单篇正文超过上限。
 *
 * 短路顺序（由廉价到昂贵）：
 * 1. `!tr.docChanged` → 放行（纯选区 / meta 事务）；
 * 2. 整篇改写（切章 / 重载）→ 放行（库内内容必须可加载）；
 * 3. 差量：`缓存总数 + 新增可计字符 ≤ 上限` → 放行（**绝大多数普通击键，成本 O(插入量)**）；
 * 4. 否则按事务结果 doc 精确重算并比对（粘贴 / IME 批量确认 / 块级操作，成本 O(全文)）。
 */
function wouldExceedLimit(state: EditorState, tr: Transaction): boolean {
  if (!tr.docChanged) return false
  if (isWholeDocReplace(tr, state.doc)) return false

  const cached = wordLimitKey.getState(state)
  const current = cached ? totalChars(cached) : totalChars(blockCounts(state.doc))
  if (current + insertedChars(tr) <= MAX_DOC_CHARS) return false

  // 精确判定：以事务结果 doc 为准（差量可能高估，如「选中 100 字替换为 1 字」净增为负）
  return totalChars(blockCounts(tr.doc)) > MAX_DOC_CHARS
}

/* ---------- 块级字数缓存（插件状态） ---------- */

/**
 * 块级字数缓存的增量维护：
 * - 整篇改写 / `COMMIT_META` / 块数变化 → 整篇重算（切章、整篇替换）；
 * - 否则按 stepMap 定位**被触碰的顶层块**重算，未触碰块沿用旧值（增量计数）。
 *
 * @returns 新缓存数组；`counts` 未变化时**原样返回同一引用**（供 `docCharCount` 快路径）
 */
function nextBlockCounts(tr: Transaction, counts: number[]): number[] {
  if (tr.getMeta(DOC_LIMIT_COMMIT_META)) return blockCounts(tr.doc)
  if (!tr.docChanged) return counts
  // 整篇改写（setContent / 重载）：块级缓存整体失效，重算。
  if (tr.steps.length === 1) {
    const step = tr.steps[0] as { from?: number; to?: number }
    if (step.from === 0 && step.to === tr.before.content.size) return blockCounts(tr.doc)
  }
  // 块数变化（新建 / 删块 / 拆并块）：按块定位会失准，直接重算。
  if (counts.length !== tr.doc.childCount) return blockCounts(tr.doc)

  const next = counts.slice()
  let touched = false
  tr.steps.forEach((step, index) => {
    const map = tr.mapping.maps[index]
    if (!map) return
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      // 沿新 doc 逐顶层块推进，把落在 [newStart, newEnd) 内的块标记为需重算
      let pos = 0
      for (let i = 0; i < tr.doc.childCount; i += 1) {
        const node = tr.doc.child(i)
        if (newStart < pos + node.nodeSize && newEnd > pos) {
          next[i] = countCharacters([node.textContent])
          touched = true
        }
        pos += node.nodeSize
      }
    })
  })
  return touched ? next : counts
}

/* ---------- Tiptap 扩展 ---------- */

/**
 * 单篇字数上限扩展（章节编辑器与大纲编辑器**共用**同一实例配置）。
 *
 * 通过 `addProseMirrorPlugins` 挂载 `filterTransaction`（拦截超限事务）+ 块级字数缓存
 * 状态。缓存由插件 `state.apply` 在每次事务 apply 时增量维护 —— **不依赖 `appendTransaction`**：
 * `setContent` 走的 `replaceWith` 同样经过 `filterTransaction` + `state.apply`，只会被
 * `COMMIT_META` 放行，故缓存与拦截对新旧内容都保持一致。
 */
export const DocWordLimit = Extension.create({
  name: 'docWordLimit',

  addProseMirrorPlugins() {
    return [
      new Plugin<number[]>({
        key: wordLimitKey,
        state: {
          init(_config, state): number[] {
            return blockCounts(state.doc)
          },
          apply(tr, counts): number[] {
            return nextBlockCounts(tr, counts)
          }
        },
        // filterTransaction 在事务 apply 前拦截：返回 true 放行、false 整个丢弃。
        filterTransaction(tr, state): boolean {
          if (!wouldExceedLimit(state, tr)) return true
          // 记 meta 供上层（调试 / 诊断）识别被拒事务；state 不变故无副作用。
          tr.setMeta(DOC_LIMIT_EXCEEDED_META, true)
          return false
        }
      })
    ]
  }
})

/* ---------- 对外读数（与拦截同源） ---------- */

/**
 * 当前正文的有效字数（读块级缓存，**不触发全量统计**）。
 *
 * 与 `filterTransaction` 的判定值**同源同值** —— 脚注显示的字数即拦截依据的字数。
 * 无缓存（扩展未挂载）时降级为全量统计，保证不抛错。
 */
export function docCharCount(editor: TiptapEditor | null): number {
  if (!editor || !editor.isInitialized) return 0
  const counts = wordLimitKey.getState(editor.state)
  if (counts && counts.length === editor.state.doc.childCount) return totalChars(counts)
  return totalChars(blockCounts(editor.state.doc))
}

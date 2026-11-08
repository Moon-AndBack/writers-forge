import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import type { Editor as TiptapEditor } from '@tiptap/core'
import type { WorldEntityType } from '../../../../../preload/types/worldEntity'
import { ParagraphMatchCache } from './paragraphMatchCache'
// 跨域复用：胶囊配色类名真源在 `dossier/relationChip`（entities → dossier 只读依赖）。
import { entityChipClass } from '../dossier/relationChip'

/** 高亮 span 的 class 前缀与 data 属性名（HoverCard 依赖 data-entity-id）。 */
export const ENTITY_HIGHLIGHT_CLASS = 'entity-highlight'
export const ENTITY_TYPE_CLASS_PREFIX = 'entity-'
export const ENTITY_ID_ATTR = 'data-entity-id'

/** 实体高亮插件 key（供外部读取 DecorationSet / 悬停定位）。 */
export const entityHighlightKey = new PluginKey<DecorationSet>('entityHighlight')

/** 扩展配置：bookId 提供者（路由参数）与匹配 IPC。 */
export interface EntityHighlightOptions {
  /** 返回当前书籍 id（来自路由），空串表示不可匹配。 */
  getBookId: () => string
  /**
   * 编辑器创建后是否补一次全文重匹配（默认 `false`）。
   *
   * 背景：插件只在**文档变更事务**上重算高亮，而 `useEditor` 的 `content` 建 doc 不产生事务——
   * 故「以 `content` 直接带入初始正文」的编辑器打开时旧正文不会被高亮。置 `true` 即补一次
   * **整篇**匹配（走 500ms 尾沿防抖；章节正文经 `setContent` 载入，本就不需要）。
   */
  matchOnCreate?: boolean
}

/** 单条文本块内匹配（与 preload 的 EntityMatch 结构一致，此处独立声明避免类型耦合）。 */
interface TextblockMatch {
  entityId: number
  /** 统一设定库五类（直接复用 preload 类型）。 */
  type: WorldEntityType
  /** 实体所属分类（保留字段：主进程 `entities:match` 仍返回，配色已改用 `presetKey`）。 */
  subtypeId: number | null
  /** 子类预设路由键（`world_subtypes.preset_key`）；空串 = 自定义分类或未分类。 */
  presetKey: string
  start: number
  end: number
}

/** 文本块匹配结果缓存（渲染进程）：按「书 + 词表版本 + 文本块内容」命中，未变文本块跳过 IPC。 */
const matchCache = new ParagraphMatchCache<TextblockMatch[]>()

/** 单个待重算文本块：**整块绝对区间** + 文本（供匹配与整块清除）。 */
interface TextblockTarget {
  from: number
  to: number
  text: string
}

/** 是否参与实体高亮的文本块：所有 textblock，排除代码块（不在源码上标词）。 */
function isHighlightableTextblock(node: PMNode): boolean {
  return node.isTextblock === true && node.type.name !== 'codeBlock'
}

/**
 * 对单个文本块构建 inline Decoration。
 *
 * 位置换算：`entities:matchMany` 返回块内 UTF-16 code unit 下标（左闭右开），
 * 加上文本块在 doc 中的绝对起始 pos + 1（越过块开标记）即为 doc 绝对 pos。
 */
function buildTextblockDecorations(
  matches: readonly TextblockMatch[],
  target: TextblockTarget
): Decoration[] {
  return matches
    .filter((match) => match.end > match.start && match.end <= target.text.length)
    .map((match) => {
      const chipClass = entityChipClass(match.type, match.presetKey)
      const className = [
        ENTITY_HIGHLIGHT_CLASS,
        `${ENTITY_TYPE_CLASS_PREFIX}${match.type}`,
        chipClass
      ]
        .filter(Boolean)
        .join(' ')
      return Decoration.inline(target.from + 1 + match.start, target.from + 1 + match.end, {
        class: className,
        [ENTITY_ID_ATTR]: String(match.entityId)
      })
    })
}

/**
 * 批量解析文本块匹配结果：先查缓存，未命中内容合并为**一次** `entities:matchMany` 取回并回填缓存。
 *
 * 返回与 `targets` 等长同序的结果数组；返回 `null` 表示批量结果与请求长度不符
 * （主进程对非法入参返回空数组），调用方按整批失败处理——保留旧装饰、不抽干待办。
 * `revision` 为 null（版本获取失败）时绕过缓存，仍走批量匹配。
 */
async function matchTextblocks(
  bookId: string,
  revision: string | null,
  targets: readonly TextblockTarget[]
): Promise<TextblockMatch[][] | null> {
  const results = new Array<TextblockMatch[]>(targets.length)
  const missingTexts: string[] = []
  const missingIndexes: number[] = []
  for (let index = 0; index < targets.length; index += 1) {
    const text = targets[index].text
    if (text === '') {
      results[index] = []
      continue
    }
    const cached = revision === null ? undefined : matchCache.get(bookId, revision, text)
    if (cached !== undefined) {
      results[index] = cached
      continue
    }
    missingIndexes.push(index)
    missingTexts.push(text)
  }
  if (missingTexts.length === 0) return results

  const fetched = (await window.api.entities.matchMany(bookId, missingTexts)) as TextblockMatch[][]
  // 等长同序是批量通道的约定；长度不符说明 IPC 入参校验失败，整批按失败处理。
  if (fetched.length !== missingTexts.length) return null
  for (let index = 0; index < fetched.length; index += 1) {
    const matches = fetched[index]
    results[missingIndexes[index]] = matches
    if (revision !== null) matchCache.set(bookId, revision, missingTexts[index], matches)
  }
  return results
}

/**
 * 收集整篇文档中的**全部可高亮文本块**（整块边界 + 文本）。
 *
 * 用于**整篇**重匹配场景（`onCreate` 的 `matchOnCreate` 补匹配）：遍历标题 / 段落 /
 * 引用内段落等所有 textblock（排除代码块），返回整块边界，供「按块整块清除 + 重算」。
 * 日常编辑走 `collectTextblockTargets` 的脏区域增量路径（只重算变更区间覆盖的文本块）。
 */
function collectAllTextblocks(doc: PMNode): TextblockTarget[] {
  const targets: TextblockTarget[] = []
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (isHighlightableTextblock(node)) {
        targets.push({ from: pos, to: pos + node.nodeSize, text: node.textContent })
      }
      return false
    }
    return true
  })
  return targets
}

/** 待重算的文档区间（**当前文档坐标**，左闭右开；纯删除会折叠为 `from === to`）。 */
interface DocRange {
  from: number
  to: number
}

/** 合并重叠 / 相邻区间（按起点升序）：连击时逐事务追加的区间及时归并，避免无界增长。 */
function mergeRanges(ranges: readonly DocRange[]): DocRange[] {
  if (ranges.length <= 1) return ranges.map((range) => ({ from: range.from, to: range.to }))
  const sorted = [...ranges].sort((a, b) => a.from - b.from)
  const merged: DocRange[] = [{ from: sorted[0].from, to: sorted[0].to }]
  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1]
    const next = sorted[i]
    if (next.from <= last.to) {
      if (next.to > last.to) last.to = next.to
    } else {
      merged.push({ from: next.from, to: next.to })
    }
  }
  return merged
}

/**
 * 把待重算区间解析为**当前文档中**需要重算的文本块清单（整块区间 + 文本）。
 *
 * 刷新策略核心：不依赖「文本块绝对起点」的精确匹配（删除 / 合并 / 拆分使起点漂移时会失配
 * → 整块被跳过 → 旧装饰残留），而是按**区间**落到文本块上：
 * - 区间向两侧各探一位（`from - 1` / `to + 1`）：删除 / 插入落在块边界（合并、拆分）时，
 *   边界两侧的文本块都能覆盖（`Fragment.nodesBetween` 只回调与区间相交的节点）；
 * - 纯删除区间折叠为 `from === to`，用 `from + 1` 兜底探一位，避免漏掉删除所在文本块；
 * - 同一文本块按起点去重（`Map`），返回**整块边界**，供后续「按块整块清除 + 重算」。
 */
function collectTextblockTargets(doc: PMNode, ranges: readonly DocRange[]): TextblockTarget[] {
  const docSize = doc.content.size
  const targets = new Map<number, TextblockTarget>()
  for (const range of ranges) {
    const from = Math.max(0, range.from - 1)
    const to = Math.min(docSize, Math.max(range.to, range.from + 1) + 1)
    if (from >= to) continue
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) {
        if (isHighlightableTextblock(node) && !targets.has(pos)) {
          targets.set(pos, { from: pos, to: pos + node.nodeSize, text: node.textContent })
        }
        return false
      }
      return true
    })
  }
  return [...targets.values()]
}

/**
 * 实体高亮扩展（阶段②）。
 *
 * - 匹配走阶段① IPC `entities:matchMany`（词表为统一设定库主表 name + 别名），按文本块批量调用
 *   （一次 IPC 匹配多个未缓存文本块；块内下标 + 块绝对 pos 换算）；仅收集 textblock 并排除代码块；
 * - **脏区域增量重算**：事务变更时用 `tr.mapping` 映射旧 DecorationSet 并**保留**旧装饰
 *   （编辑中不闪断），同时把本次变更区间经 `tr.mapping` 映射后并入待重算集合；**停笔 500ms 后**
 *   只对「变更区间覆盖到的文本块（含相邻块，覆盖合并 / 拆分）」整块重算，不再整篇重算；
 * - **整篇**重算仅用于 `matchOnCreate`（文档以 `content` 直接带入、无变更事务）；
 * - **文本块缓存**：按「书 + 词表版本 + 文本块内容」缓存匹配结果，未变文本块命中缓存、跳过 IPC；
 * - **刷新不变式**：任何曾装饰但当前无匹配的范围**必须**被移除——按目标文本块整块区间清除旧装饰
 *   再补新结果；`await` 期间文档变化 / IPC 失败**不抽干待办**（期间事务已把区间映射并入并重置
 *   尾沿定时器），确保删除实体文字后高亮不残留（吸取历史「抽干后丢弃」教训）；
 * - 任务**按 EditorView 隔离**（同页多编辑器共享本扩展时互不抢占）。
 */
export const EntityHighlight = Extension.create<EntityHighlightOptions, DecorationSet>({
  name: 'entityHighlight',

  addOptions() {
    return { getBookId: () => '', matchOnCreate: false }
  },

  /** 创建后补一次整篇匹配（`matchOnCreate`）：打开后经尾沿防抖高亮既有正文（见选项说明）。 */
  onCreate() {
    if (!this.options.matchOnCreate) return
    const doc = this.editor.state.doc
    if (doc.content.size === 0) return
    // 文档以 `content` 直接带入（无变更事务）：挂尾沿定时器，停笔 500ms 后**整篇**重算一次。
    scheduleFullRematch(this.editor, this.options)
  },

  addProseMirrorPlugins() {
    const options = this.options
    // 供 plugin 回调访问 editor（no-this-alias：改用 bind/箭头函数捕获 this）
    const getEditor = (): TiptapEditor => this.editor

    return [
      new Plugin<DecorationSet>({
        key: entityHighlightKey,
        state: {
          init(): DecorationSet {
            return DecorationSet.empty
          },
          apply(tr, oldDecorations) {
            // meta 写回路径：重匹配完成后一次替换 DecorationSet
            const meta = tr.getMeta(entityHighlightKey) as
              { decorations: DecorationSet } | undefined
            if (meta) return meta.decorations

            // 无 doc 变更：直接复用旧集合并做位置映射
            if (!tr.docChanged) return oldDecorations

            // 旧装饰整体映射到新文档：**编辑中不立即剔除**旧装饰，否则连续输入期间高亮会
            // 先消失、再等重匹配恢复。旧装饰保留到 500ms 尾沿对脏区域重算拿到新结果时替换。
            const mapped = oldDecorations.map(tr.mapping, tr.doc)

            // 收集本次事务的**变更区间**（新文档坐标）。纯删除会折叠为 `from === to`，
            // 由 `collectTextblockTargets` 兜底探一位后解析到文本块——不依赖文本块绝对起点的
            // 精确匹配（删除 / 合并致起点漂移时会失配 → 整块被跳过 → 旧装饰残留）。
            const ranges: DocRange[] = []
            tr.steps.forEach((_step, index) => {
              tr.mapping.maps[index].forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                ranges.push({ from: newStart, to: newEnd })
              })
            })

            // 纯尾沿防抖 500ms：把本次变更区间并入待重算，停笔后只重算脏区域文本块。
            scheduleRematch(getEditor(), options, ranges, tr.mapping)

            return mapped
          }
        },
        props: {
          decorations(state: EditorState) {
            return entityHighlightKey.getState(state)
          }
        }
      })
    ]
  }
})

/* ---------- 重匹配调度（按 EditorView 隔离，多编辑器互不抢占） ---------- */

/** 单次输入停顿的防抖时长（ms）：与保存防抖 800ms 独立。 */
const REMATCH_DEBOUNCE_MS = 500

interface RematchTask {
  /** 待重算**区间**（当前文档坐标；每次事务经 `tr.mapping` 增量映射，避免漂移失配）。 */
  ranges: DocRange[]
  /** 是否需要**整篇**重算（`matchOnCreate`）；与 `ranges` 独立，命中后清除。 */
  full: boolean
  /** 尾沿防抖定时器；null 表示当前无挂起定时器。 */
  timer: number | null
  /** 是否已有一次 `runRematch` 在执行（执行期间到期的触发置 `pending`，由其循环消化）。 */
  running: boolean
  /** 执行期间又到期：当前一轮结束后立即再跑一轮。 */
  pending: boolean
}

/**
 * 待重算任务**按 EditorView 隔离**（WeakMap）。
 *
 * 章节编辑器与剧情编辑器常驻同页、共享本扩展：模块级单例会让后到的 view 直接抢占
 * 并丢弃前者的待重算（旧缺陷：剧情 `onCreate` 的整篇匹配批被章节切章的 docChanged
 * 清掉）。按 view 各持独立任务与定时器即互不影响；view 销毁后随键被回收。
 */
const rematchTasks = new WeakMap<EditorView, RematchTask>()

/** 取（或建）某 view 的重算任务。 */
function ensureTask(view: EditorView): RematchTask {
  let task = rematchTasks.get(view)
  if (!task) {
    task = { ranges: [], full: false, timer: null, running: false, pending: false }
    rematchTasks.set(view, task)
  }
  return task
}

/** 挂 / 重置尾沿防抖定时器：停笔 `REMATCH_DEBOUNCE_MS` 后触发一轮重算。 */
function armRematchTimer(view: EditorView, bookId: string, task: RematchTask): void {
  const fire = (): void => {
    task.timer = null
    if (task.running) {
      task.pending = true
      return
    }
    void runRematch(view, bookId, task)
  }
  if (task.timer !== null) window.clearTimeout(task.timer)
  task.timer = window.setTimeout(fire, REMATCH_DEBOUNCE_MS)
}

/**
 * 调度**脏区域**重匹配（**纯尾沿防抖 500ms**）。
 *
 * - 把既有待重算区间先经 `mapping` 映射到新文档坐标，再并入本次变更区间（`mergeRanges` 归并）；
 * - 重置尾沿定时器，**停笔 500ms 后**才发起一次重算（无前沿立即触发）；
 * - 定时器到期时若已有 `runRematch` 在执行，置 `pending`，由其在当前轮结束后再跑一轮。
 */
function scheduleRematch(
  editor: TiptapEditor,
  options: EntityHighlightOptions,
  ranges: readonly DocRange[],
  mapping?: { map: (pos: number, assoc?: number) => number }
): void {
  const view = editor.view
  if (!view) return

  const bookId = options.getBookId()
  if (bookId === '') return

  const task = ensureTask(view)

  // 既有待重算区间映射到新文档坐标（文本块在本次事务中的位移不失配）。
  // 起点取左偏（assoc=-1）、终点取右偏（assoc=1）：只可能把区间**放宽**，不会漏掉脏区域。
  const carried = mapping
    ? task.ranges.map((range) => ({
        from: mapping.map(range.from, -1),
        to: mapping.map(range.to, 1)
      }))
    : task.ranges
  task.ranges = mergeRanges([...carried, ...ranges])

  armRematchTimer(view, bookId, task)
}

/** 调度**整篇**重匹配（`matchOnCreate`：文档以 `content` 直接带入，无变更事务可收集区间）。 */
function scheduleFullRematch(editor: TiptapEditor, options: EntityHighlightOptions): void {
  const view = editor.view
  if (!view) return

  const bookId = options.getBookId()
  if (bookId === '') return

  const task = ensureTask(view)
  task.full = true
  armRematchTimer(view, bookId, task)
}

/**
 * 重匹配到期：对**脏区域**（或整篇，`full`）解析出的文本块发起匹配，返回后**按块增量替换**装饰。
 *
 * - 只重算目标文本块；未变文本块命中匹配缓存（跳过 IPC），其余文本块既有高亮保留；
 * - 未命中缓存的内容合并为**一次** `entities:matchMany`（整篇从 N 次 IPC 降为 1 次）；
 * - 刷新不变式：目标文本块整块区间的旧装饰先清除再补新结果（删除实体文字后高亮必然被清除）；
 * - await 期间文档可能变化：`view.state.doc` 与快照不是同一对象则丢弃本轮结果——**不抽干待办**
 *   （期间事务已把区间映射并入 `task.ranges` 并重置尾沿定时器），停笔后会再算一次；
 * - 匹配失败（IPC 异常 / 批量返回长度不符）：**不抽干待办**，保留旧装饰，等下一次输入 / 尾沿
 *   再算（不静默清除高亮）；
 * - 视图销毁（isDestroyed）后不再 dispatch，静默丢弃本轮结果；
 * - `pending` 为真（执行期间又有触发到期）时循环再跑一轮，确保「最后一次停笔」被覆盖。
 */
async function runRematch(view: EditorView, bookId: string, task: RematchTask): Promise<void> {
  if (task.running) {
    task.pending = true
    return
  }
  task.running = true
  try {
    do {
      task.pending = false
      if (view.isDestroyed) break

      const doc = view.state.doc
      const isFull = task.full
      const targets = isFull ? collectAllTextblocks(doc) : collectTextblockTargets(doc, task.ranges)
      if (targets.length === 0) {
        // 无待重算文本块：清空待办，避免空转。
        task.ranges = []
        task.full = false
        continue
      }

      // 词表版本（缓存键的一部分）；获取失败则本轮绕过缓存、仍走 IPC 匹配。
      let revision: string | null = null
      try {
        revision = await window.api.entities.revision(bookId)
      } catch {
        revision = null
      }
      if (view.isDestroyed) break

      // 配色只取决于 `match.presetKey`（随 `entities:matchMany` 同步返回），无需任何映射前置。
      let perTextblock: TextblockMatch[][]
      try {
        const matched = await matchTextblocks(bookId, revision, targets)
        // 长度不符（IPC 入参校验失败）按整批失败处理：保留旧装饰，等待下一次重算。
        if (matched === null) break
        perTextblock = matched
      } catch {
        // IPC 失败：不抽干待办，保留旧装饰，下一次输入 / 尾沿会再次重算。
        break
      }

      if (view.isDestroyed) break
      const newDoc = view.state.doc
      if (newDoc !== doc) {
        // await 期间文档已变：本轮结果作废。期间事务已把待办区间映射并入 `task.ranges` 并
        // 重置尾沿定时器；此处**不抽干待办**（旧缺陷：抽干后丢弃 → 该段再不被重算 → 残留）。
        continue
      }

      // 按目标文本块整块区间增量替换旧装饰（其余文本块既有高亮保留）。
      let merged = entityHighlightKey.getState(view.state) ?? DecorationSet.empty
      const fresh: Decoration[] = []
      for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i]
        const found = merged.find(target.from, target.to)
        if (found.length > 0) merged = merged.remove(found)
        fresh.push(...buildTextblockDecorations(perTextblock[i], target))
      }
      merged = merged.add(newDoc, fresh)
      view.dispatch(view.state.tr.setMeta(entityHighlightKey, { decorations: merged }))

      // 成功提交：清空已处理的待办（整篇重算覆盖全部区间，故一并清空）。
      task.ranges = []
      task.full = false
    } while (task.pending)
  } finally {
    task.running = false
  }
}

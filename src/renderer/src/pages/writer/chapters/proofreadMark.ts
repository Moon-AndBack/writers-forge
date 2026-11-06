import { useSyncExternalStore } from 'react'
import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { ActiveCleanWord, CleanWordCategory } from '../../../../../preload/types/cleanWords'
import {
  getCleanWordsEpoch,
  loadActiveCleanWords,
  onCleanWordsInvalidated
} from '../../../components/editor/cleanWordCache'

/**
 * 章节正文违禁词标注（**只提示不阻断**）。
 *
 * 口径：
 * - 词源＝`window.api.cleanWords.active()`（只含 enabled=1，主进程 `database/cleanWords` 真源）；
 * - 词表缓存与失效广播在 `components/editor/cleanWordCache.ts`（模块级 Promise，扫描全程零 IPC）；
 *   词库变更后经其 `resetActiveCleanWords()` 失效，本模块订阅后清各控制器快照并立即重扫；
 * - 匹配为**最长匹配 + 不重叠**（首字分桶，每桶按词长降序，逐位 `startsWith`）；
 * - 命中以 `Decoration.inline` 铺**波浪下划线**（类名 `wf-clean-hit`），只改装饰不改文档，
 *   不与实体高亮的 `background` / `color` 冲突；
 * - 扫描时机：文档变更后**尾沿防抖 500ms**；整章替换（`setContent(..., { emitUpdate: false })`
 *   带 `preventUpdate` 元信息）**立即**扫一次（切章不等防抖）；编辑器首次挂载扫一次。
 *
 * 性能（本地实测，860 条内置词）：5000 字 0.31ms / 20000 字 0.58ms / 200000 字 6.4ms（中位），
 * 故「防抖 + 全量重扫」无需脏区域增量（对比：整篇重扫远低于一帧 16.7ms 预算）。
 *
 * 与 `outlineSearch.ts` / `linkSelectionMirror.ts` 同构：PluginKey + `apply` 里 meta 直写优先、
 * `tr.docChanged` 时 `map` 跟随；插件经扩展静态注册（不改 `components/editor/**`）。
 */

/** 命中饰带类名（样式见 `styles/writer-ai.css`，四主题经 `--danger` 自适应）。 */
export const CLEAN_HIT_CLASS = 'wf-clean-hit'

/** 命中词 data 属性名（供后续详情面板 / 悬停取词，本批只写入不消费）。 */
export const CLEAN_WORD_ATTR = 'data-clean-word'

/** 违禁词标注插件 key（供外部经 meta 写回 / 清除 DecorationSet）。 */
export const proofreadKey = new PluginKey<DecorationSet>('cleanWordProofread')

/** 停笔多久后重扫（ms）：与实体高亮同频，纯尾沿防抖。 */
const SCAN_DEBOUNCE_MS = 500

/** 违禁词命中（装饰用，`from` / `to` 为**文档绝对 pos**，左闭右开）。 */
export interface ProofreadHit {
  from: number
  to: number
  word: string
  category: CleanWordCategory
  replacement: string
}

/** 段内命中（偏移相对该段文本起点，左闭右开，UTF-16 code unit）。 */
export interface CleanWordScanHit {
  start: number
  end: number
  word: string
  category: CleanWordCategory
  replacement: string
}

/* ---------- 词表（缓存与失效广播在共享层，见 components/editor/cleanWordCache.ts） ---------- */

/* ---------- 匹配 ---------- */

/** 首字分桶（按词长降序），建一次复用；键为词表数组**引用**，词表换新自动重建。 */
interface WordBuckets {
  /** 首字 → 同首字词条（词长降序）。 */
  lists: Map<string, ActiveCleanWord[]>
}

const bucketCache = new WeakMap<ActiveCleanWord[], WordBuckets>()

function getBuckets(words: ActiveCleanWord[]): WordBuckets {
  const cached = bucketCache.get(words)
  if (cached !== undefined) return cached
  const lists = new Map<string, ActiveCleanWord[]>()
  for (const item of words) {
    const word = item.word
    // 单字词与正文高频字重合，误报面过大且装饰数量爆炸（种子最短 2 字），一并跳过。
    if (word.length < 2) continue
    const key = word.charAt(0)
    const list = lists.get(key)
    if (list === undefined) lists.set(key, [item])
    else list.push(item)
  }
  for (const list of lists.values()) list.sort((a, b) => b.word.length - a.word.length)
  const buckets: WordBuckets = { lists }
  bucketCache.set(words, buckets)
  return buckets
}

/**
 * 扫描单段文本，返回段内命中（偏移相对 `text` 起点）。
 *
 * 重叠取舍：**最长匹配优先、命中区间互不重叠**——同一位置同时命中「色情」与「色情网站」时
 * 取后者并整段跳过；同一词的多次出现各自独立命中（不因相邻而合并）。
 * 依据：违禁词提示是「哪段话有问题」的粗粒度信号，最长匹配既避免嵌套 span（PM inline
 * 装饰叠加会切碎文本节点、令光标 / 选区在词内跳动，也拖慢 DOM），又保证更具体的词先露头。
 */
export function findCleanWordHits(text: string, words: ActiveCleanWord[]): CleanWordScanHit[] {
  if (text === '' || words.length === 0) return []
  const { lists } = getBuckets(words)
  const hits: CleanWordScanHit[] = []
  const length = text.length
  let at = 0
  while (at < length) {
    const candidates = lists.get(text.charAt(at))
    if (candidates === undefined) {
      at += 1
      continue
    }
    let matched: ActiveCleanWord | null = null
    for (const candidate of candidates) {
      if (text.startsWith(candidate.word, at)) {
        matched = candidate
        break
      }
    }
    if (matched === null) {
      at += 1
      continue
    }
    hits.push({
      start: at,
      end: at + matched.word.length,
      word: matched.word,
      category: matched.category,
      replacement: matched.replacement
    })
    at += matched.word.length
  }
  return hits
}

/**
 * 扫描整篇文档：逐**文本块**（段落 / 标题等）匹配，段内偏移 + 段绝对起点换算为文档绝对 pos。
 *
 * 段落为正文唯一块类型（`paragraphs` 表按段存储），此处不设块类型白名单——任何文本块都扫，
 * 便于今后大纲 / 剧情编辑器复用本模块。
 */
export function scanDocForCleanWordHits(doc: PMNode, words: ActiveCleanWord[]): ProofreadHit[] {
  if (words.length === 0) return []
  const hits: ProofreadHit[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textContent
    if (text === '') return false
    for (const hit of findCleanWordHits(text, words)) {
      // 块内容起点 = 块起点 + 1（越过开标记）；marks 不占位，textContent 偏移可直接换绝对 pos。
      hits.push({
        from: pos + 1 + hit.start,
        to: pos + 1 + hit.end,
        word: hit.word,
        category: hit.category,
        replacement: hit.replacement
      })
    }
    return false
  })
  return hits
}

/** 把命中列表转成 inline DecorationSet（越界夹取，空列表 → 空集合）。 */
export function buildProofreadDecorations(doc: PMNode, hits: ProofreadHit[]): DecorationSet {
  if (hits.length === 0) return DecorationSet.empty
  const size = doc.content.size
  const decorations: Decoration[] = []
  for (const hit of hits) {
    const from = Math.max(0, hit.from)
    const to = Math.min(size, hit.to)
    if (to <= from) continue
    decorations.push(
      Decoration.inline(from, to, {
        class: CLEAN_HIT_CLASS,
        [CLEAN_WORD_ATTR]: hit.word
      })
    )
  }
  return decorations.length === 0 ? DecorationSet.empty : DecorationSet.create(doc, decorations)
}

/* ---------- 状态栏计数（模块级可订阅 store） ---------- */

/** 当前命中处数（状态栏消费；0 时状态栏不渲染）。 */
let hitCount = 0
const countListeners = new Set<() => void>()
/** 当前「计数拥有者」：多编辑器共用时以最后一次扫描为准，销毁时仅拥有者可清零。 */
let countOwner: object | null = null

function publishHitCount(owner: object, next: number): void {
  countOwner = owner
  if (next === hitCount) return
  hitCount = next
  for (const listener of countListeners) listener()
}

function releaseHitCount(owner: object): void {
  if (countOwner !== owner) return
  countOwner = null
  if (hitCount === 0) return
  hitCount = 0
  for (const listener of countListeners) listener()
}

/** 订阅命中处数变化（`useSyncExternalStore` 用）。 */
export function subscribeProofreadHitCount(listener: () => void): () => void {
  countListeners.add(listener)
  return () => {
    countListeners.delete(listener)
  }
}

/** 读取当前命中处数（快照，`useSyncExternalStore` 用）。 */
export function getProofreadHitCount(): number {
  return hitCount
}

/** 命中处数 hook（状态栏用；0 表示无命中 / 无编辑器）。 */
export function useProofreadHitCount(): number {
  return useSyncExternalStore(
    subscribeProofreadHitCount,
    getProofreadHitCount,
    getProofreadHitCount
  )
}

/* ---------- 写入 / 清除（meta 直写） ---------- */

/**
 * 写入命中装饰（`hits` 须为**当前文档**的绝对 pos；位置已漂移时请改用扫描链路）。
 * 只发 meta 事务，不改文档、不动选区，不抢焦点（IME 安全）。
 */
export function applyProofreadMarks(editor: Editor, hits: ProofreadHit[]): void {
  if (editor.isDestroyed || !editor.isInitialized) return
  const decorations = buildProofreadDecorations(editor.state.doc, hits)
  editor.view.dispatch(editor.state.tr.setMeta(proofreadKey, decorations))
}

/** 清除全部命中装饰（切换 / 清空正文时用，无残留）。 */
export function clearProofreadMarks(editor: Editor): void {
  if (editor.isDestroyed || !editor.isInitialized) return
  editor.view.dispatch(editor.state.tr.setMeta(proofreadKey, DecorationSet.empty))
}

/* ---------- 扫描调度（按编辑器隔离） ---------- */

interface ProofreadController {
  editor: Editor
  /** 尾沿防抖定时器；null = 无挂起。 */
  timer: number | null
  /** 是否有扫描在执行（执行期到期的触发置 pending，由其循环消化）。 */
  scanning: boolean
  /** 执行期又到期：本轮结束立即再跑一轮。 */
  pending: boolean
  /** 编辑器已销毁：丢弃一切后续动作。 */
  disposed: boolean
  /** 词表快照（载入后常驻）。 */
  words: ActiveCleanWord[] | null
}

/** 控制器按编辑器隔离（同页多编辑器共享本扩展时互不抢占）。 */
const controllers = new WeakMap<Editor, ProofreadController>()

/** 可遍历的控制器集合（WeakMap 不能遍历，词库变更时需逐个通知）。 */
const activeControllers = new Set<ProofreadController>()

function ensureController(editor: Editor): ProofreadController {
  let controller = controllers.get(editor)
  if (controller === undefined) {
    controller = {
      editor,
      timer: null,
      scanning: false,
      pending: false,
      disposed: false,
      words: null
    }
    controllers.set(editor, controller)
    activeControllers.add(controller)
  }
  return controller
}

/** 挂 / 重置尾沿定时器（`immediate` = 结构性替换，0ms 立即扫）。 */
function requestScan(controller: ProofreadController, immediate = false): void {
  if (controller.disposed) return
  if (controller.timer !== null) window.clearTimeout(controller.timer)
  controller.timer = window.setTimeout(
    () => {
      controller.timer = null
      void runScan(controller)
    },
    immediate ? 0 : SCAN_DEBOUNCE_MS
  )
}

// 词库改动 → 共享层广播失效：丢弃各控制器的词表快照并立即重扫（模块级订阅；控制器
// 只在编辑器的 `view` 回调里产生，故注册时机不早于任何控制器）。
onCleanWordsInvalidated(() => {
  for (const controller of activeControllers) {
    if (controller.disposed) continue
    controller.words = null
    requestScan(controller, true)
  }
})

/**
 * 扫一轮：取词表（首次走 IPC）→ 整篇匹配 → 写装饰 + 发布计数。
 *
 * IME 组合期不 dispatch（会让组合串丢失），改为延后再扫；await 期间编辑器销毁则整轮丢弃。
 */
async function runScan(controller: ProofreadController): Promise<void> {
  if (controller.disposed) return
  if (controller.scanning) {
    controller.pending = true
    return
  }
  controller.scanning = true
  try {
    do {
      controller.pending = false
      const { editor } = controller
      if (controller.disposed || editor.isDestroyed || !editor.isInitialized) return
      const epoch = getCleanWordsEpoch()
      const words = controller.words ?? (await loadActiveCleanWords())
      if (controller.disposed || editor.isDestroyed) return
      if (epoch !== getCleanWordsEpoch()) {
        // 等待期间词表被重置：这份快照已过期，丢掉并立刻用新词表重扫（不要把旧快照写回 `words`）。
        controller.words = null
        controller.pending = true
        continue
      }
      controller.words = words
      if (editor.view.composing) {
        requestScan(controller)
        return
      }
      const doc = editor.state.doc
      const hits = scanDocForCleanWordHits(doc, words)
      publishHitCount(controller, hits.length)
      editor.view.dispatch(
        editor.state.tr.setMeta(proofreadKey, buildProofreadDecorations(doc, hits))
      )
    } while (controller.pending)
  } finally {
    controller.scanning = false
  }
}

/** 释放控制器（编辑器销毁时）：清定时器、清计数，不留残留。 */
function disposeController(controller: ProofreadController): void {
  controller.disposed = true
  activeControllers.delete(controller)
  if (controller.timer !== null) {
    window.clearTimeout(controller.timer)
    controller.timer = null
  }
  releaseHitCount(controller)
}

/* ---------- TipTap 扩展 ---------- */

/**
 * 违禁词标注扩展：注册插件（DecorationSet 状态 + `props.decorations`）与扫描调度。
 *
 * 只挂在章节正文编辑器（`ChaptersView` 的 `EDITOR_BASE_EXTENSIONS`）；
 * 扫描调度收在编辑器内部，调用方无需任何 effect。
 */
export const CleanWordMark = Extension.create({
  name: 'cleanWordMark',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin<DecorationSet>({
        key: proofreadKey,
        state: {
          init(): DecorationSet {
            return DecorationSet.empty
          },
          apply(tr: Transaction, oldDecorations: DecorationSet): DecorationSet {
            const meta = tr.getMeta(proofreadKey) as DecorationSet | undefined
            if (meta) return meta
            if (tr.docChanged) return oldDecorations.map(tr.mapping, tr.doc)
            return oldDecorations
          }
        },
        props: {
          decorations(state: EditorState): DecorationSet {
            return proofreadKey.getState(state) ?? DecorationSet.empty
          }
        },
        view: () => {
          const controller = ensureController(editor)
          const onTransaction = ({ transaction }: { transaction: Transaction }): void => {
            if (!transaction.docChanged) return
            // `setContent(..., { emitUpdate: false })` 的整章 / 整篇替换带 `preventUpdate` 元信息：
            // 结构性替换立即重扫（切章不等 500ms 防抖，旧标记不残留在新正文上）。
            requestScan(controller, transaction.getMeta('preventUpdate') === true)
          }
          editor.on('transaction', onTransaction)
          // 首次挂载即扫一次（词表异步载入，实质上载入完成才出标记）。
          requestScan(controller, true)
          return {
            destroy: () => {
              editor.off('transaction', onTransaction)
              disposeController(controller)
            }
          }
        }
      })
    ]
  }
})

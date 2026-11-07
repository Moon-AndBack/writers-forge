import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import { loadActiveCleanWords } from '../../../components/editor/cleanWordCache'
import { getCleanWordFlash, subscribeCleanWordFlash } from './proofreadHits'
import { scanDocForCleanWordHits } from './proofreadMark'
import type { ProofreadHit } from './proofreadMark'

/**
 * 命中清单点击 → 正文对应命中位置短暂闪烁。
 *
 * 与 `proofreadMark.ts` 分工：扫描算法 / 词表缓存 / 波浪线标注全部复用，本文件只负责
 * 「按词过滤 → 写一次性装饰 → 定时清除 → 必要时滚动」。拆出独立文件是因为
 * `proofreadMark.ts` 已逼近 500 行硬上限。
 *
 * 口径：
 * - 请求经 `proofreadHits.ts` 的模块级 store 传递，`seq` 判重（同词连点可重放）；
 * - 装饰只经 `tr.setMeta` 写入，**不改文档、不动选区、不进撤销历史**；
 * - 定时器归插件 view 所有，destroy 时清除并退订；异步词表返回后仍校验编辑器存活；
 * - 滚动用 `coordsAtPos` + 最近滚动祖先手工计算，**不调用 `scrollIntoView` 改选区**。
 */

/** 闪烁饰带类名（样式见 `styles/clean-word-hits.css`）。 */
export const CLEAN_FLASH_CLASS = 'wf-clean-flash'

/** 闪烁装饰插件 key（只写 meta，不产生文档变更）。 */
export const cleanWordFlashKey = new PluginKey<DecorationSet>('cleanWordFlash')

/** 闪烁时长（ms）：与 CSS `wf-clean-flash` 动画时长一致，到点清除装饰。 */
const FLASH_DURATION_MS = 1800

/** 滚动留白（px）：命中位置距滚动视口上下缘不足该距离时居中，避免贴边。 */
const SCROLL_MARGIN = 24

/** 每次请求写入装饰的序号属性：属性变化强制 ProseMirror 重建 span，令 CSS 动画重播。 */
const FLASH_SEQ_ATTR = 'data-flash-seq'

/** 把命中列表转成闪烁装饰（越界夹取；空列表 → 空集合）。 */
function buildFlashDecorations(
  doc: PMNode,
  hits: readonly ProofreadHit[],
  seq: number
): DecorationSet {
  if (hits.length === 0) return DecorationSet.empty
  const size = doc.content.size
  const decorations: Decoration[] = []
  for (const hit of hits) {
    const from = Math.max(0, hit.from)
    const to = Math.min(size, hit.to)
    if (to <= from) continue
    decorations.push(
      Decoration.inline(from, to, {
        class: CLEAN_FLASH_CLASS,
        [FLASH_SEQ_ATTR]: String(seq)
      })
    )
  }
  return decorations.length === 0 ? DecorationSet.empty : DecorationSet.create(doc, decorations)
}

/** 向上找最近的纵向滚动祖先（章节正文为 `.editor-scroll`）。 */
function findScrollParent(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement
  while (current !== null) {
    const overflowY = window.getComputedStyle(current).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return current
    current = current.parentElement
  }
  return null
}

/**
 * 第一个命中不在视口内时滚动到它（居中）。
 *
 * 用 `coordsAtPos` 读位置坐标后直接改滚动容器的 `scrollTop`，**不设置选区、不抢焦点**
 * （清单按钮保持聚焦，方便连续核对多个词）。
 */
function scrollHitIntoView(view: EditorView, hit: ProofreadHit): void {
  const scroller = findScrollParent(view.dom)
  if (scroller === null) return
  const coords = view.coordsAtPos(hit.from)
  const rect = scroller.getBoundingClientRect()
  if (coords.top >= rect.top + SCROLL_MARGIN && coords.bottom <= rect.bottom - SCROLL_MARGIN) {
    return
  }
  const height = coords.bottom - coords.top
  scroller.scrollTop += coords.top - rect.top - (scroller.clientHeight - height) / 2
}

/**
 * 违禁词闪烁扩展：挂在章节正文编辑器（`ChaptersView` 的 `EDITOR_BASE_EXTENSIONS`）。
 *
 * 只响应显式请求，不参与扫描调度；装饰状态在 `docChanged` 时随 mapping 漂移。
 */
export const CleanWordFlash = Extension.create({
  name: 'cleanWordFlash',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin<DecorationSet>({
        key: cleanWordFlashKey,
        state: {
          init(): DecorationSet {
            return DecorationSet.empty
          },
          apply(tr: Transaction, oldDecorations: DecorationSet): DecorationSet {
            const meta = tr.getMeta(cleanWordFlashKey) as DecorationSet | undefined
            if (meta !== undefined) return meta
            if (tr.docChanged) return oldDecorations.map(tr.mapping, tr.doc)
            return oldDecorations
          }
        },
        props: {
          decorations(state) {
            return cleanWordFlashKey.getState(state) ?? DecorationSet.empty
          }
        },
        view: () => {
          let timer: number | null = null
          let lastSeq = 0
          let disposed = false

          const clearTimer = (): void => {
            if (timer === null) return
            window.clearTimeout(timer)
            timer = null
          }

          const clearDecorations = (): void => {
            if (disposed || editor.isDestroyed) return
            editor.view.dispatch(editor.state.tr.setMeta(cleanWordFlashKey, DecorationSet.empty))
          }

          const runFlash = (word: string, seq: number): void => {
            if (disposed || editor.isDestroyed || !editor.isInitialized) return
            void loadActiveCleanWords().then((words) => {
              // 异步等待期间可能已切章 / 卸载：丢弃整轮，不向死编辑器 dispatch。
              if (disposed || editor.isDestroyed) return
              const hits = scanDocForCleanWordHits(editor.state.doc, words).filter(
                (hit) => hit.word === word
              )
              if (hits.length === 0) return
              // 只发 meta 事务：不改文档、不动选区、不进撤销历史。
              editor.view.dispatch(
                editor.state.tr.setMeta(
                  cleanWordFlashKey,
                  buildFlashDecorations(editor.state.doc, hits, seq)
                )
              )
              scrollHitIntoView(editor.view, hits[0])
              clearTimer()
              timer = window.setTimeout(() => {
                timer = null
                clearDecorations()
              }, FLASH_DURATION_MS)
            })
          }

          const unsubscribe = subscribeCleanWordFlash(() => {
            const request = getCleanWordFlash()
            if (request === null || request.seq === lastSeq) return
            lastSeq = request.seq
            runFlash(request.word, request.seq)
          })

          return {
            destroy: () => {
              disposed = true
              clearTimer()
              unsubscribe()
            }
          }
        }
      })
    ]
  }
})

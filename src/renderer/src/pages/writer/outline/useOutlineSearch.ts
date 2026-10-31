import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import {
  buildOutlineSearchDecorations,
  findOutlineMatches,
  outlineSearchKey,
  type OutlineSearchMatch
} from './outlineSearch'

export interface UseOutlineSearchOptions {
  /** Tiptap 编辑器实例（未就绪时为 null）。 */
  editor: Editor | null
  /** 浮窗是否打开（关闭时清除高亮）。 */
  open: boolean
}

export interface OutlineSearchController {
  query: string
  replacement: string
  /** 当前文档内命中总数。 */
  total: number
  /** 当前命中下标（0 起；无命中为 -1）。 */
  activeIndex: number
  setQuery: (value: string) => void
  setReplacement: (value: string) => void
  /** 跳到下一个命中（循环）。 */
  next: () => void
  /** 跳到上一个命中（循环）。 */
  prev: () => void
  /** 用替换文本替换当前命中。 */
  replaceOne: () => void
  /** 用替换文本替换当前文档内全部命中。 */
  replaceAll: () => void
}

/**
 * 大纲条目「当前内容」查找 / 替换状态机（**仅当前编辑器文档**）。
 *
 * - 触发重算：`query` 变化 + 编辑器文档变更（`transaction.docChanged`，含切换条目时
 *   的 `setContent`）；空查询 / 无编辑器时清空；
 * - 高亮：命中集合经插件 meta 写回 `OutlineSearchHighlight`（类名 `ep-search-hit`），
 *   关闭浮窗时清空；命中项另经编辑器选区（TextSelection）滚动入视；
 * - 替换：单条 / 全部均以**单个事务**完成（各自一条撤销记录），替换后经文档变更自然重算。
 *
 * 不依赖 `chapters:search` IPC，也不跨条目 / 全书搜索（与章节搜索的本质差异）。
 */
export function useOutlineSearch({
  editor,
  open
}: UseOutlineSearchOptions): OutlineSearchController {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matches, setMatches] = useState<OutlineSearchMatch[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)

  // 供编辑器事件 / 命令回调读取最新值的引用（仅经 effect / 回调写入，不在渲染期触碰）。
  const queryRef = useRef(query)
  const replacementRef = useRef(replacement)
  const matchesRef = useRef<OutlineSearchMatch[]>([])
  const activeRef = useRef(-1)

  useEffect(() => {
    queryRef.current = query
  }, [query])
  useEffect(() => {
    replacementRef.current = replacement
  }, [replacement])

  /** 重新匹配当前文档；同步更新引用与展示态。 */
  const recompute = useCallback(
    (rawQuery: string): void => {
      const trimmed = rawQuery.trim()
      let list: OutlineSearchMatch[] = []
      if (editor && !editor.isDestroyed && trimmed !== '') {
        list = findOutlineMatches(editor.state.doc, trimmed)
      }
      const prev = activeRef.current
      const nextIdx = list.length === 0 ? -1 : prev < 0 ? 0 : Math.min(prev, list.length - 1)
      matchesRef.current = list
      activeRef.current = nextIdx
      setMatches(list)
      setActiveIndex(nextIdx)
    },
    [editor]
  )

  // 查询词变化：重置到首个命中后重算（延迟到微任务，避免在 effect 内同步 setState）。
  useEffect(() => {
    void Promise.resolve().then(() => {
      activeRef.current = -1
      recompute(query)
    })
  }, [query, recompute])

  // 文档变更（输入 / 切换条目 setContent）：重算命中。
  useEffect(() => {
    if (!editor) return undefined
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (transaction.docChanged) recompute(queryRef.current)
    }
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor, recompute])

  // 高亮同步：命中集合 / 开关变化时写回 DecorationSet（关闭 → 空集合清除高亮）。
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.isInitialized) return
    const decorations = buildOutlineSearchDecorations(editor.state.doc, open ? matches : [])
    editor.view.dispatch(editor.state.tr.setMeta(outlineSearchKey, decorations))
  }, [editor, matches, open])

  /** 定位并滚动到某条命中（选中该范围）。 */
  const scrollToMatch = useCallback(
    (match: OutlineSearchMatch): void => {
      if (!editor || editor.isDestroyed || !editor.isInitialized) return
      const { state, view } = editor
      const size = state.doc.content.size
      const from = Math.min(match.from, size)
      const to = Math.min(match.to, size)
      const tr = state.tr.setSelection(TextSelection.create(state.doc, from, to))
      tr.scrollIntoView()
      view.dispatch(tr)
      view.focus()
    },
    [editor]
  )

  const next = useCallback((): void => {
    const list = matchesRef.current
    if (list.length === 0) return
    const idx = (activeRef.current + 1) % list.length
    activeRef.current = idx
    setActiveIndex(idx)
    scrollToMatch(list[idx])
  }, [scrollToMatch])

  const prev = useCallback((): void => {
    const list = matchesRef.current
    if (list.length === 0) return
    const idx = (activeRef.current - 1 + list.length) % list.length
    activeRef.current = idx
    setActiveIndex(idx)
    scrollToMatch(list[idx])
  }, [scrollToMatch])

  const replaceOne = useCallback((): void => {
    if (!editor || editor.isDestroyed || !editor.isInitialized) return
    const list = matchesRef.current
    const idx = activeRef.current
    if (idx < 0 || idx >= list.length) return
    const match = list[idx]
    // 单事务替换：事务处理器同步重算并更新 matchesRef（原下标处即下一个命中）。
    editor.view.dispatch(editor.state.tr.insertText(replacementRef.current, match.from, match.to))
    const fresh = matchesRef.current
    const at = Math.min(idx, fresh.length - 1)
    if (at >= 0) {
      activeRef.current = at
      setActiveIndex(at)
      scrollToMatch(fresh[at])
    }
  }, [editor, scrollToMatch])

  const replaceAll = useCallback((): void => {
    if (!editor || editor.isDestroyed || !editor.isInitialized) return
    const list = matchesRef.current
    if (list.length === 0) return
    const replacement = replacementRef.current
    // 单事务、自后向前替换：后方偏移不受先前替换影响，且合并为一条撤销记录。
    let tr = editor.state.tr
    for (let i = list.length - 1; i >= 0; i -= 1) {
      tr = tr.insertText(replacement, list[i].from, list[i].to)
    }
    editor.view.dispatch(tr)
  }, [editor])

  return {
    query,
    replacement,
    total: matches.length,
    activeIndex,
    setQuery,
    setReplacement,
    next,
    prev,
    replaceOne,
    replaceAll
  }
}

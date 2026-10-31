import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * 大纲条目「当前内容」查找高亮支撑（**仅当前编辑器文档**，不涉及 chapters 表 / 跨条目）。
 *
 * 与章节搜索（`chapters/useChapterSearch` + `chapters:search` IPC）的取舍：
 * 章节搜索走主进程全表扫描并按章 / 全书分页；大纲搜索只需在**当前 Tiptap 文档**内
 * 即时匹配，故完全在渲染层本地完成——不引入任何 IPC 依赖。
 *
 * 高亮沿用章节搜索浮窗的命中类名 `ep-search-hit`（见 writer-search.css），
 * 复用其品牌浅底样式，无需新增样式文件；当前命中项通过编辑器选区（TextSelection）区分。
 *
 * 匹配遍历文档全部 text 节点（不设块级边界），heading / 列表 / 表格块内的文本同样命中；
 * Decoration.inline 落在 text 节点上，与块级结构无关。
 */

/** 单条命中：`from` / `to` 为**文档绝对 pos**（左闭右开，UTF-16 code unit）。 */
export interface OutlineSearchMatch {
  from: number
  to: number
}

/** 命中高亮类名（复用章节搜索浮窗样式 `.ep-search-hit`，四主题自适应）。 */
export const OUTLINE_SEARCH_HIT_CLASS = 'ep-search-hit'

/** 查找高亮插件 key（供外部通过 meta 写回 / 清除 DecorationSet）。 */
export const outlineSearchKey = new PluginKey<DecorationSet>('outlineSearch')

/**
 * 在文档内查找 `query` 的全部**非重叠**命中（大小写敏感，与章节搜索 `indexOf` 口径一致）。
 * 逐文本节点 `indexOf` 循环步进 `query.length`，节点内偏移 + 节点绝对 pos 换算为文档绝对 pos。
 * 任意块级结构（paragraph / heading / 列表项 / 表格单元格）内的文本节点均可命中——
 * 遍历不设块级边界（返回 true），仅对 text 节点终止下钻。
 */
export function findOutlineMatches(doc: PMNode, query: string): OutlineSearchMatch[] {
  if (query === '') return []
  const matches: OutlineSearchMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    const text = node.text ?? ''
    let at = text.indexOf(query)
    while (at !== -1) {
      matches.push({ from: pos + at, to: pos + at + query.length })
      at = text.indexOf(query, at + query.length)
    }
    return false
  })
  return matches
}

/** 由命中列表构建 inline DecorationSet（空列表 → 空集合）。 */
export function buildOutlineSearchDecorations(
  doc: PMNode,
  matches: OutlineSearchMatch[]
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty
  return DecorationSet.create(
    doc,
    matches.map((match) =>
      Decoration.inline(match.from, match.to, { class: OUTLINE_SEARCH_HIT_CLASS })
    )
  )
}

/**
 * 查找高亮扩展：插件状态保存当前 DecorationSet，只经 `setMeta(outlineSearchKey, …)`
 * 写回（清空传 `DecorationSet.empty`）；事务仅变更文档时按 `tr.mapping` 映射旧集合，
 * 保持位置正确。
 */
export const OutlineSearchHighlight = Extension.create({
  name: 'outlineSearchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: outlineSearchKey,
        state: {
          init(): DecorationSet {
            return DecorationSet.empty
          },
          apply(tr, oldDecorations): DecorationSet {
            const meta = tr.getMeta(outlineSearchKey) as DecorationSet | undefined
            if (meta) return meta
            if (tr.docChanged) return oldDecorations.map(tr.mapping, tr.doc)
            return oldDecorations
          }
        },
        props: {
          decorations(state: EditorState): DecorationSet {
            return outlineSearchKey.getState(state) ?? DecorationSet.empty
          }
        }
      })
    ]
  }
})

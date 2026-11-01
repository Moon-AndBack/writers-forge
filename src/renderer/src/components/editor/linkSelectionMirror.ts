import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * 失焦期选区镜像（仿 `outlineSearch.ts` 的 Decoration.inline + PluginKey + map 跟随模式）。
 *
 * 原生蓝选区在编辑器 blur 后无法逐像素保持（`selectionToDOM` 遇 `hasFocus === false`
 * 即返回），纯 CSS 无效；故需要「看得见选区」的场景（链接面板、右栏 AI 面板）以
 * inline 饰带镜像一份快照选区，场景结束即清。空选区（光标）不画；饰带只铺浅底
 * （类名由调用方给定，样式分别见 `.wf-link-mirror` / `.ai-selection-mirror`），
 * 不改字色字重，与查找高亮 `.ep-search-hit` 区分。
 *
 * 类名参数化：同一编辑器同一时刻只保留一条饰带（单一 PluginKey），故两种场景互斥，
 * 后写覆盖先写——链接面板在大纲页、AI 面板在章节正文，实际不会同时写在同一个编辑器上。
 */

/** 链接面板镜像饰带类名（样式见 `styles/components/editor-format.css`，四主题自适应）。 */
export const LINK_SELECTION_MIRROR_CLASS = 'wf-link-mirror'

/** 选区镜像插件 key（供外部经 meta 写回 / 清除 DecorationSet）。 */
export const selectionMirrorKey = new PluginKey<DecorationSet>('selectionMirror')

/** 由快照 range 构建单块 inline DecorationSet（空选区 / 越界夹取后为空 → 空集合）。 */
export function buildSelectionMirror(
  doc: PMNode,
  range: { from: number; to: number },
  className: string
): DecorationSet {
  const size = doc.content.size
  const from = Math.max(0, Math.min(range.from, size))
  const to = Math.max(0, Math.min(range.to, size))
  if (to <= from) return DecorationSet.empty
  return DecorationSet.create(doc, [Decoration.inline(from, to, { class: className })])
}

/** 链接面板口径的饰带构建（保留原 API，等价于传 `LINK_SELECTION_MIRROR_CLASS`）。 */
export function buildLinkSelectionMirror(
  doc: PMNode,
  range: { from: number; to: number }
): DecorationSet {
  return buildSelectionMirror(doc, range, LINK_SELECTION_MIRROR_CLASS)
}

function createMirrorPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: selectionMirrorKey,
    state: {
      init(): DecorationSet {
        return DecorationSet.empty
      },
      apply(tr: Transaction, oldDecorations: DecorationSet): DecorationSet {
        const meta = tr.getMeta(selectionMirrorKey) as DecorationSet | undefined
        if (meta) return meta
        // 文档改动 → 快照位置失效；选区已不是镜像范围（用户点回正文 / 改选）→ 快照过期。
        // 两种情况都在**本事务内**清空，绝不另发清理事务：另发的事务会在 mousedown /
        // focus 帧内触发 `selectionToDOM`，把 state 里的旧选区强写回 DOM，吞掉这一次
        // 点击的落点（要点第二下）。清空随点击事务一起更新，ProseMirror 自己处理选区。
        if (tr.docChanged) return DecorationSet.empty
        const { selection } = tr
        const stillCurrent = oldDecorations
          .find()
          .some(
            (decoration) => decoration.from === selection.from && decoration.to === selection.to
          )
        return stillCurrent ? oldDecorations : DecorationSet.empty
      }
    },
    props: {
      decorations(state: EditorState): DecorationSet {
        return selectionMirrorKey.getState(state) ?? DecorationSet.empty
      }
    }
  })
}

/**
 * 首开时注入镜像插件（`state.reconfigure` 追加，重复调用幂等）。
 *
 * 不碰 `OutlineEditor` 的 `EDITOR_BASE_EXTENSIONS`：插件随首个需要镜像的调用注入，
 * 此后常驻空集合，仅经 meta 写回 / 清除。
 */
export function ensureSelectionMirror(editor: Editor): void {
  if (editor.isDestroyed || !editor.isInitialized) return
  if (selectionMirrorKey.getState(editor.state) !== undefined) return
  const { view } = editor
  view.updateState(
    view.state.reconfigure({ plugins: [...view.state.plugins, createMirrorPlugin()] })
  )
}

/** 写入镜像饰带（空选区不画；不抢焦点，IME 安全）。 */
export function showSelectionMirror(
  editor: Editor,
  range: { from: number; to: number },
  className: string
): void {
  if (editor.isDestroyed || !editor.isInitialized) return
  ensureSelectionMirror(editor)
  const decorations = buildSelectionMirror(editor.state.doc, range, className)
  editor.view.dispatch(editor.state.tr.setMeta(selectionMirrorKey, decorations))
}

/**
 * 清除镜像饰带（场景结束 / 面板关闭 / 卸载时调用，无残留）。
 *
 * 聚焦编辑器时**不要**调用：聚焦由点击正文触发，此处 dispatch 的事务会在
 * mousedown 期间触发 `selectionToDOM` 把旧选区写回 DOM，吞掉该次点击的落点。
 * 聚焦期的可见性由 CSS（`.ProseMirror-focused`）处理，选区变化由插件 apply 清。
 */
export function clearSelectionMirror(editor: Editor): void {
  if (editor.isDestroyed || !editor.isInitialized) return
  if (selectionMirrorKey.getState(editor.state) === undefined) return
  editor.view.dispatch(editor.state.tr.setMeta(selectionMirrorKey, DecorationSet.empty))
}

/** 链接面板口径的写入（保留原 API，行为 / 类名不变）。 */
export function showLinkSelectionMirror(editor: Editor, range: { from: number; to: number }): void {
  showSelectionMirror(editor, range, LINK_SELECTION_MIRROR_CLASS)
}

/** 链接面板口径的清除（保留原 API，行为不变）。 */
export function clearLinkSelectionMirror(editor: Editor): void {
  clearSelectionMirror(editor)
}

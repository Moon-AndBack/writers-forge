import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { deriveForeshadowStatus } from '../../../../shared/foreshadowStatus'
import { sliceSelectedText } from '../../../../shared/foreshadowAnchorText'
import { resolveParagraphAnchor } from '../../components/editor/paragraphAnchor'

/**
 * 选区右键菜单的纯函数助手（取选中文字 / 查询规整 / 可回收判定）。
 *
 * 从 `SelectionContextMenu.tsx` 抽出（§3 单文件 ≤500 行）：均与组件状态无关，
 * 外置后菜单文件只保留交互与渲染。
 */

/**
 * 取选中的文字片段。
 *
 * 选区落在单个顶层块内时按锚点的段内区间截取；跨段选区没有锚点，回退到文档选区原文
 * （块间以换行分隔，调用方按需取首个非空行）。空选区返回空串。
 */
export function readSelectedText(editor: Editor | null): string {
  if (!editor) return ''
  const info = resolveParagraphAnchor(editor)
  if (info) return sliceSelectedText(info.quote, info.charStart, info.charEnd).trim()
  const { selection, doc } = editor.state
  if (selection.empty) return ''
  return doc.textBetween(selection.from, selection.to, '\n').trim()
}

/**
 * 菜单接管判定：选区必须是**文本选区**、非空，且能读出文字。
 *
 * 与锚点解耦：跨段选区（`resolveParagraphAnchor` 返回 null）照常接管，由菜单按锚点
 * 降级为仅「搜索选中文字」。调用方没有搜索回调时跨段无可用项，退回不接管（不弹空菜单）。
 */
export function shouldOpenSelectionMenu(editor: Editor, hasSearchItem: boolean): boolean {
  if (editor.isDestroyed) return false
  const { selection } = editor.state
  if (!(selection instanceof TextSelection) || selection.empty) return false
  if (readSelectedText(editor) === '') return false
  return resolveParagraphAnchor(editor) !== null || hasSearchItem
}

/**
 * 搜索词规整：搜索是**逐段 `indexOf`**，换行永远匹配不到。
 * 顶层块内一般无换行（锚点函数已排除跨块选区），但富文本段落内的硬换行会出现在
 * 块文本里——取首个非空行，避免整条查询直接失效。
 */
export function toSearchQuery(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  )
}

/**
 * 读取全书伏笔并判断是否存在「可回收」项（**派生状态为 `planted`**）。
 * 建设中 / 已废弃 / 已回收均不可回收（回收点优先，废弃记录不再参与判断）。
 * 失败按不可回收处理（永不抛错）：菜单项置灰比误开空弹窗更稳妥。
 */
export async function fetchRecoverable(bookId: string): Promise<boolean> {
  try {
    const rows = await window.api.foreshadow.list(bookId)
    return rows.some((row) => deriveForeshadowStatus(row) === 'planted')
  } catch {
    return false
  }
}

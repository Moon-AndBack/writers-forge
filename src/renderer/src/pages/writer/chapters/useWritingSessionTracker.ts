import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { docCharCount } from '../docWordLimit'
import { AI_APPLY_META, recordChapterEdit } from '../../../shell/writingSession'

/**
 * 章节正文码字统计：监听编辑器事务，按「事务前后 `docCharCount` 之差」记净增有效字。
 *
 * 只挂在 `ChaptersView` 的正文编辑器上（章节正文唯一编辑器），大纲 / 剧情 / 设定 /
 * 伏笔 / 灵感一律不计数。字数读数与输入拦截同源（`DocWordLimit` 的块级缓存）。
 *
 * 跳过（只同步基线，不记字）：
 * - `preventUpdate`：程序载入内容（切章 / 搜索替换后 `reload` 的
 *   `setContent(emitUpdate: false)`）——切章时基线随之更新，不会把整章算成新增；
 * - `AI_APPLY_META`：右栏 AI 回插正文（`applyToEditor` 打 meta），按决策不计入。
 *
 * 基线 `prev` 随每次事务推进；跳过分支也重读当前字数，保证下一次用户输入
 * 只计真实差量。编辑器实例更换（effect 重跑）时基线重新取当前值。
 */
export function useWritingSessionTracker(editor: Editor | null): void {
  useEffect(() => {
    if (!editor) return undefined

    let prev = docCharCount(editor)

    const onTransaction = ({ transaction }: { transaction: Transaction }): void => {
      if (!transaction.docChanged) return
      if (
        transaction.getMeta('preventUpdate') === true ||
        transaction.getMeta(AI_APPLY_META) === true
      ) {
        prev = docCharCount(editor)
        return
      }
      const next = docCharCount(editor)
      recordChapterEdit(next - prev)
      prev = next
    }

    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor])
}

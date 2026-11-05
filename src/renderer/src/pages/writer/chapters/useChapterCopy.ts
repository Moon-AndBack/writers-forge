import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { useToast } from '../../../components/ui/Toast'
import { docToParagraphs } from './docParagraphs'

/**
 * 章节「一键复制全文」：取**当前编辑器 doc** 的纯文本并写入系统剪贴板。
 *
 * 口径（与需求逐条对应）：
 * - **只复制正文**：章节标题是独立的输入框（`DocTitleRow`），不在 doc 内，天然不含；
 * - **无格式、仅保留换行**：复用 `docToParagraphs`（保留空段）取每段 `text`，以单个 `\n`
 *   连接——一段一行，空段自然成为空行；
 * - **不走主进程** `chapters:getParagraphs`：数据库内容落后于编辑器（800ms 防抖窗口内的
 *   未落盘改动 / 正在输入的最新文字会丢），doc 才是当前真源；
 * - **不用** `docJsonToBlockText`：它会 trim 并跳过空段，会吃掉空行。
 *
 * 只读（定稿）态**仍可复制**——复制读取 doc，不依赖 `editor.isEditable`。
 */

export interface UseChapterCopyOptions {
  /** 当前章节正文编辑器（`useEditor` 未就绪时为 null）。 */
  editor: Editor | null
  /** 当前章节 id（null = 无选中章）。 */
  chapterId: number | null
  /** 正文加载中：此时 doc 可能仍是上一章内容，禁用复制避免复制错章。 */
  loading?: boolean
}

export interface UseChapterCopyResult {
  /** 复制全文（异步：剪贴板 API 返回 Promise；失败已内部兜底，不抛出）。 */
  copyAll: () => Promise<void>
  /** 是否可用：有编辑器 + 有章节 + 正文已加载完成。 */
  canCopy: boolean
  /** Toast 节点（挂在调用方组件 return 内即可）。 */
  toastNode: ReactNode
}

/** 顶层块纯文本按行拼接：`docToParagraphs` 保留空段，join('\n') 即「一段一行、空段空行」。 */
function chapterPlainText(editor: Editor): string {
  return docToParagraphs(editor)
    .map((paragraph) => paragraph.text)
    .join('\n')
}

/**
 * 旧版回退：隐藏 textarea 选中 + `document.execCommand('copy')`。
 * 用于 `navigator.clipboard` 不可用 / reject（如文档未聚焦时的 `NotAllowedError`）。
 * 复制后移除节点并还原原焦点，避免抢走正文光标。
 */
function legacyCopy(text: string): boolean {
  const activeElement = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  let copied = false
  try {
    textarea.select()
    copied = document.execCommand('copy')
  } catch {
    // execCommand 在部分环境被禁用 / 不可用：保持 false，由调用方提示失败。
  }
  document.body.removeChild(textarea)
  if (activeElement instanceof HTMLElement) activeElement.focus()
  return copied
}

export function useChapterCopy({
  editor,
  chapterId,
  loading = false
}: UseChapterCopyOptions): UseChapterCopyResult {
  const { t } = useTranslation('chapters')
  const { show, node } = useToast()

  const canCopy = editor !== null && chapterId !== null && !loading

  const copyAll = useCallback(async (): Promise<void> => {
    if (editor === null || chapterId === null || loading) return
    const text = chapterPlainText(editor)
    // 空正文（仅空段）：**不写剪贴板**（清空用户既有剪贴板是破坏性副作用），只提示。
    if (text.trim() === '') {
      show(t('editor.copyEmpty'))
      return
    }
    try {
      if (navigator.clipboard?.writeText === undefined) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(text)
      show(t('editor.copyDone'))
    } catch {
      if (legacyCopy(text)) show(t('editor.copyDone'))
      else show(t('editor.copyFailed'))
    }
  }, [chapterId, editor, loading, show, t])

  return { copyAll, canCopy, toastNode: node }
}

export default useChapterCopy

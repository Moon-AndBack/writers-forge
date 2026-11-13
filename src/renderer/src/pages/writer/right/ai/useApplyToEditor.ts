import { useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import type { TFunction } from 'i18next'
import {
  readEditorSelection,
  type EditorSelectionSnapshot
} from '../../../../components/editor/useEditorSelection'
import { insertAfter, replaceSelection } from './applyToEditor'
import type { AiConversationMessage } from './chatRuntime'

/**
 * 章节右栏 AI · 回插正文（从 `AiPanel.tsx` 抽出，控制单文件行数，AGENTS §3）。
 *
 * 三条规则：
 * - **选区跟消息走**：每条 assistant 消息带一份发送瞬间的快照（仅内存），
 *   回插优先用它，避免所有回复共用面板里唯一的 `selectionRef` 被下一次发送覆盖；
 * - **替换前校验原文**：位置合法不代表内容没变——发送后正文可能被编辑，偏移会指向
 *   别的句子；`doc.textBetween` 与快照原文不一致时提示重新选择，不盲写；
 * - **全选归一化**：Ctrl+A 的 `AllSelection` 是 `[0, size]`，快照在捕获与回插时都
 *   收敛到文本选区合法区间 `[1, size - 1]`（空文档 / 单空段无可替换范围）。
 */

/** 把任意选区归一化到文本选区合法区间 `[1, doc.content.size - 1]`。 */
function normalizeSnapshot(
  snapshot: EditorSelectionSnapshot,
  docSize: number
): EditorSelectionSnapshot {
  // 空文档 / 单个空段落：没有可替换的文本区间，收敛为起点处的空选区。
  if (docSize <= 2) return { ...snapshot, from: 1, to: 1, empty: true }

  const from = Math.max(1, snapshot.from)
  const to = Math.min(docSize - 1, Math.max(from, snapshot.to))
  return { ...snapshot, from, to, empty: snapshot.empty || from === to }
}

/** 读取当前选区并归一化（编辑器不可用 → null）。 */
function readNormalizedSelection(editor: Editor | null): EditorSelectionSnapshot | null {
  if (editor === null || editor.isDestroyed) return null
  const snapshot = readEditorSelection(editor)
  if (snapshot === null) return null
  return normalizeSnapshot(snapshot, editor.state.doc.content.size)
}

/** `useApplyToEditor` 的参数：编辑器 + 提示通道（文案类型取 `ai` 命名空间）。 */
export interface UseApplyToEditorInput {
  editor: Editor | null
  showToast: (message: string) => void
  t: TFunction<'ai'>
}

/** 面板需要的三个动作：发送时快照、替换选中、插入到选中之后。 */
export interface ApplyToEditor {
  captureSelection: () => EditorSelectionSnapshot | null
  handleApplyReplace: (message: AiConversationMessage) => void
  handleApplyInsert: (message: AiConversationMessage) => void
}

export function useApplyToEditor(input: UseApplyToEditorInput): ApplyToEditor {
  const { editor, showToast, t } = input
  /** 最近一次发送时的快照（仅用于没有更精确消息快照的历史消息兜底）。 */
  const selectionRef = useRef<EditorSelectionSnapshot | null>(null)

  /** 发请求瞬间快照选区（并归一化全选边界）。 */
  const captureSelection = useCallback((): EditorSelectionSnapshot | null => {
    const snapshot = readNormalizedSelection(editor)
    selectionRef.current = snapshot
    return snapshot
  }, [editor])

  /** 回插成功后刷新快照，避免连续回插仍指向已变化的旧 range。 */
  const refreshSelection = useCallback((): void => {
    selectionRef.current = readNormalizedSelection(editor)
  }, [editor])

  /**
   * 取本次回插依据：消息自带快照 → 最近一次发送快照 → 当前实时选区。
   * 历史消息（重开会话 / 旧库）没有快照，只能退回后两者，由原文校验兜底。
   */
  const resolveSnapshot = useCallback(
    (message: AiConversationMessage): EditorSelectionSnapshot | null => {
      const snapshot = message.selection ?? selectionRef.current
      if (snapshot !== null && snapshot !== undefined) return snapshot
      return readNormalizedSelection(editor)
    },
    [editor]
  )

  const handleApplyReplace = useCallback(
    (message: AiConversationMessage): void => {
      const snapshot = resolveSnapshot(message)
      if (snapshot === null || snapshot.empty || snapshot.text === '') {
        showToast(t('panel.apply.noSelection'))
        return
      }
      if (editor === null || editor.isDestroyed) {
        showToast(t('panel.apply.failed'))
        return
      }

      const docSize = editor.state.doc.content.size
      const { from, to } = snapshot
      if (
        docSize <= 2 ||
        !Number.isInteger(from) ||
        !Number.isInteger(to) ||
        from < 1 ||
        to < from ||
        to > docSize - 1
      ) {
        showToast(t('panel.apply.staleSelection'))
        return
      }
      // 位置合法不代表原文还在：发送后正文可能被编辑，偏移已指向别的句子。
      if (editor.state.doc.textBetween(from, to, '\n') !== snapshot.text) {
        showToast(t('panel.apply.staleSelection'))
        return
      }

      if (replaceSelection(editor, message.content, { from, to })) {
        refreshSelection()
        showToast(t('panel.apply.replaced'))
        return
      }
      showToast(t('panel.apply.failed'))
    },
    [editor, refreshSelection, resolveSnapshot, showToast, t]
  )

  const handleApplyInsert = useCallback(
    (message: AiConversationMessage): void => {
      if (editor === null || editor.isDestroyed) {
        showToast(t('panel.apply.failed'))
        return
      }

      const snapshot = resolveSnapshot(message)
      const position = snapshot !== null ? snapshot.to : editor.state.selection.to
      const docSize = editor.state.doc.content.size
      if (!Number.isInteger(position) || position < 0 || position > docSize) {
        showToast(t('panel.apply.staleSelection'))
        return
      }

      if (insertAfter(editor, message.content, position)) {
        refreshSelection()
        showToast(t('panel.apply.inserted'))
        return
      }
      showToast(t('panel.apply.failed'))
    },
    [editor, refreshSelection, resolveSnapshot, showToast, t]
  )

  return { captureSelection, handleApplyReplace, handleApplyInsert }
}

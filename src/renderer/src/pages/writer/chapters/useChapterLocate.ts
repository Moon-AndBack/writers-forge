import { useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { ChapterDocState } from './useChapterDoc'
import type { ChapterSearchHit } from './useChapterSearch'

export interface UseChapterLocateOptions {
  /** 正文编辑器实例（未创建 / 未初始化时不定位）。 */
  editor: Editor | null
  /** 当前选中章 id（与命中的 chapterId 不一致时等待切章完成）。 */
  chapterId: number | null
  /** 正文加载状态（loading 期间不定位，等待目标章 doc 写入）。 */
  docStatus: ChapterDocState['status']
}

/**
 * 搜索命中后的正文定位（带有限重试），自 `ChaptersView` 原样上提。
 *
 * 仅当编辑器当前文档与命中同一 document 且已加载完成时才定位，否则短延时重试
 * （跨章跳转后目标章 doc 仍在异步加载 / 旧章内容尚未替换）。
 */
export function useChapterLocate({
  editor,
  chapterId,
  docStatus
}: UseChapterLocateOptions): (hit: ChapterSearchHit) => void {
  // 定位重试定时器（跨章跳转后目标章 doc 仍在异步加载时的有限重试）。
  const locateTimerRef = useRef<number | null>(null)

  // 在编辑器内定位命中：按段落 idx 求 ProseMirror 绝对 pos，选中命中范围并滚动入视。
  const locateHit = useCallback(
    (hit: ChapterSearchHit): void => {
      if (!editor || !editor.isInitialized) return
      if (hit.paragraphIdx < 0 || hit.paragraphIdx >= editor.state.doc.childCount) return
      const node = editor.state.doc.child(hit.paragraphIdx)
      if (node.type.name !== 'paragraph') return
      if (hit.end > node.nodeSize - 2) return
      // 段落绝对起点：doc 起点 1 + 前置段落 nodeSize 之和；再 +1 越过段落开标记得文本起点。
      let from = 1
      for (let i = 0; i < hit.paragraphIdx; i += 1) {
        from += editor.state.doc.child(i).nodeSize
      }
      const start = from + 1 + hit.start
      const end = from + 1 + hit.end
      const { tr } = editor.state
      tr.setSelection(TextSelection.create(tr.doc, start, end))
      tr.scrollIntoView()
      editor.view.dispatch(tr)
      editor.view.focus()
    },
    [editor]
  )

  // 定位（带有限重试）：仅当编辑器当前文档与命中同一 document 且已加载完成时才定位，
  // 否则短延时重试（跨章跳转后目标章 doc 仍在异步加载 / 旧章内容尚未替换）。
  const scheduleLocate = useCallback(
    (hit: ChapterSearchHit): void => {
      const attempt = (tries: number): void => {
        if (!editor || !editor.isInitialized) return
        if (chapterId !== hit.chapterId || docStatus === 'loading') {
          if (tries > 0) locateTimerRef.current = window.setTimeout(() => attempt(tries - 1), 120)
          return
        }
        locateHit(hit)
        if (tries > 0 && editor.state.doc.childCount <= hit.paragraphIdx) {
          locateTimerRef.current = window.setTimeout(() => attempt(tries - 1), 120)
        }
      }
      attempt(10)
    },
    [editor, locateHit, chapterId, docStatus]
  )

  // 卸载清理定位定时器。
  useEffect(
    () => () => {
      if (locateTimerRef.current !== null) window.clearTimeout(locateTimerRef.current)
    },
    []
  )

  return scheduleLocate
}

export default useChapterLocate

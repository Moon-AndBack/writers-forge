import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { createLogger } from '@renderer/lib/log'
import { useContentSwap } from '../../../components/editor/useContentSwap'
import { countCharacters, docToParagraphs, paragraphsToDocJSON } from './docParagraphs'
import type { DocParagraph } from './docParagraphs'

/** 章节文档链路日志（转发至主进程落盘）。 */
const log = createLogger('useChapterDoc')

/**
 * 章节正文链路：
 *
 * 读：`chapterId` 变化 → `chapters:getParagraphs` → 建 doc；
 * 写：doc 变更 → 防抖 800ms → `docToParagraphs` → `chapters:saveParagraphs`，失败 warn
 *     并静默重试一次；切换章节前 flush 立即落盘，避免丢字。
 *
 * `chapterId` 来源：章节树行 `ChapterRow.id`（正文直接归属章节，`documents` 表已删除）。
 * 字数口径复用 `docParagraphs.countCharacters`（排除标点 / 符号 / 空白），与主进程
 * `countEffectiveChars` 及 `docWordLimit` 拦截口径同源。
 */

export interface ChapterDocState {
  /** 加载 / 保存状态指示（状态栏展示）。 */
  status: 'loading' | 'ready' | 'saving' | 'error'
  /** 当前正文有效字数（从 doc 实时统计，排除标点 / 符号 / 空白）。 */
  charCount: number
  /** 是否存在尚未落盘的改动（状态栏「未保存」显示用，不参与保存机制）。 */
  dirty: boolean
  /** 最近一次成功落盘时间（ISO 字符串），供编辑头「最后编辑」相对时间展示。 */
  lastSavedAt: string | null
}

/** 保存防抖毫秒数。 */
const SAVE_DEBOUNCE_MS = 800

interface UseChapterDocOptions {
  /** 章节 id；null 表示无选中章（不加载 / 不保存）。 */
  chapterId: number | null
  editor: Editor | null
}

/**
 * 章节正文加载与防抖保存。
 *
 * 返回 `status`（loading/ready/saving/error）、`charCount`、`dirty`、`lastSavedAt`、
 * `swapPhase`（正文更换后的淡入相位，见 `useContentSwap`），
 * 并在卸载 / 切章时 flush 挂起的保存。`flush` 供外部（保存按钮 / 快捷键）调用。
 */
export function useChapterDoc({ chapterId, editor }: UseChapterDocOptions) {
  const [status, setStatus] = useState<ChapterDocState['status']>('loading')
  const [charCount, setCharCount] = useState(0)
  // 是否有未落盘变更（与 dirtyRef 同步的展示态，供状态栏消费）
  const [dirty, setDirty] = useState(false)
  // 最近一次成功落盘时间（ISO），供编辑头展示
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  // 正文整体更换后的淡入相位（`.editor-scroll` 的 data-swap-phase；章节 / 大纲共用逻辑）
  const { swapPhase, markContentSwapped } = useContentSwap()

  // 当前章节 id（null = 无选中 / 未加载）
  const chapterIdRef = useRef<number | null>(null)
  // 挂起的保存定时器
  const saveTimerRef = useRef<number | null>(null)
  // 是否有未落盘变更
  const dirtyRef = useRef(false)
  // 最近一次保存的文本快照（JSON 序列化；避免 doc 变更但 texts 未变时重复写库）
  const lastSavedRef = useRef<string | null>(null)

  const saveNow = useCallback(async (): Promise<void> => {
    const chapterId = chapterIdRef.current
    if (!chapterId || !editor || !editor.isInitialized) return

    const paragraphs = docToParagraphs(editor)
    const snapshot = JSON.stringify(paragraphs)
    if (lastSavedRef.current !== null && snapshot === lastSavedRef.current) {
      dirtyRef.current = false
      setDirty(false)
      return
    }

    setStatus('saving')
    try {
      const result = await window.api.chapters.saveParagraphs(chapterId, paragraphs)
      if (result.ok) {
        lastSavedRef.current = snapshot
        dirtyRef.current = false
        setDirty(false)
        setLastSavedAt(new Date().toISOString())
        setStatus('ready')
      } else {
        // 静默重试一次
        const retry = await window.api.chapters.saveParagraphs(chapterId, paragraphs)
        if (retry.ok) {
          lastSavedRef.current = snapshot
          dirtyRef.current = false
          setDirty(false)
          setLastSavedAt(new Date().toISOString())
          setStatus('ready')
        } else {
          log.warn('段落保存失败（含一次重试）')
          setStatus('error')
        }
      }
    } catch (error) {
      log.warn('段落保存异常', error)
      setStatus('error')
    }
  }, [editor])

  // flush：切换章节前立即落盘（可 await，供替换前的串行化调用）
  const flush = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (dirtyRef.current) await saveNow()
  }, [saveNow])

  // 重载：丢弃编辑器当前内容，从库重读该文档段落并重建 doc（用于「替换命中当前章」后同步）。
  // 调用方应先 flush 再 reload；setContent 以 emitUpdate:false 写入，不触发防抖保存。
  // **不触发淡入**（不调 markContentSwapped）：替换后紧接重读，同一内容原地同步而非
  // 「换到新内容」——全量淡入会把用户刚替换 / 正在定位的命中处压到 opacity 0，
  // 连续替换时还会逐次闪烁，故保持瞬变。
  const reload = useCallback(async (): Promise<void> => {
    const chapterId = chapterIdRef.current
    if (!chapterId || !editor || !editor.isInitialized) return
    try {
      const rows = await window.api.chapters.getParagraphs(chapterId)
      const paragraphs: DocParagraph[] =
        rows.length > 0
          ? [...rows]
              .sort((a, b) => a.idx - b.idx)
              .map((row) => ({ text: row.text, contentJson: row.contentJson }))
          : [{ text: '', contentJson: null }]
      editor.commands.setContent(paragraphsToDocJSON(paragraphs), { emitUpdate: false })
      lastSavedRef.current = JSON.stringify(paragraphs)
      dirtyRef.current = false
      setDirty(false)
      setCharCount(countCharacters(paragraphs.map((item) => item.text)))
      setStatus('ready')
    } catch (error) {
      log.warn('段落重载失败', error)
      setStatus('error')
    }
  }, [editor])

  // 读链路：chapterId 变化 → 读段落 → 建 doc
  useEffect(() => {
    if (!editor || !editor.isInitialized) return undefined
    let cancelled = false

    // 切章前 flush 上一章的挂起保存
    void flush()

    chapterIdRef.current = null
    lastSavedRef.current = null
    dirtyRef.current = false

    if (chapterId === null) {
      // 延迟到微任务再读写 state，避免在 effect 内同步 setState（react-hooks/set-state-in-effect）。
      void Promise.resolve().then(() => {
        if (cancelled || !editor.isInitialized) return
        editor.commands.setContent(
          { type: 'doc', content: [{ type: 'paragraph' }] },
          { emitUpdate: false }
        )
        setCharCount(0)
        setDirty(false)
        setStatus('ready')
        // 排在同批 setState 之后：flushSync 一次性提交（相位 + 字数 / 状态），仅一次渲染。
        markContentSwapped()
      })
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      setStatus('loading')
      setDirty(false)
      chapterIdRef.current = chapterId
      try {
        const rows = await window.api.chapters.getParagraphs(chapterId)
        if (cancelled) return
        const paragraphs: DocParagraph[] =
          rows.length > 0
            ? [...rows]
                .sort((a, b) => a.idx - b.idx)
                .map((row) => ({ text: row.text, contentJson: row.contentJson }))
            : [{ text: '', contentJson: null }]
        editor.commands.setContent(paragraphsToDocJSON(paragraphs), { emitUpdate: false })
        lastSavedRef.current = JSON.stringify(paragraphs)
        setCharCount(countCharacters(paragraphs.map((item) => item.text)))
        setStatus('ready')
        // 切章内容提交：翻转相位 → 正文区淡入（见 useContentSwap；排在同批 setState 之后）。
        markContentSwapped()
      } catch (error) {
        log.warn('段落读取失败', error)
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
    // flush 依赖 editor，且 flush 引用稳定（useCallback [saveNow]），不会频繁重建；
    // markContentSwapped 同样引用稳定（useContentSwap 内 useCallback []），入依赖仅为满足 exhaustive-deps
  }, [editor, chapterId, flush, markContentSwapped])

  // 写链路：doc 变更 → 防抖 800ms 保存
  const onUpdate = useCallback((): void => {
    dirtyRef.current = true
    setDirty(true)
    if (editor) setCharCount(countCharacters(docToParagraphs(editor).map((item) => item.text)))
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void saveNow()
    }, SAVE_DEBOUNCE_MS)
  }, [editor, saveNow])

  // 卸载兜底：flush 挂起保存
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (dirtyRef.current) void saveNow()
    }
  }, [saveNow])

  return { status, charCount, dirty, lastSavedAt, onUpdate, flush, reload, swapPhase }
}

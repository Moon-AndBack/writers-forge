import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Content } from '@tiptap/core'
import { createLogger } from '@renderer/lib/log'
import { sanitizeOutlineContent } from '@renderer/components/editor/imageNode'
import { useContentSwap, type ContentSwapPhase } from '@renderer/components/editor/useContentSwap'
import { countCharacters } from '../chapters/docParagraphs'

/** 大纲正文链路日志（转发至主进程落盘）。 */
const log = createLogger('outline')

/**
 * 大纲正文链路（新结构：正文**整条内联**在 `outline_items.content_json`）。
 *
 * 读：`contentId` 变化 → `outline:getContent` → 反差 `contentJson` 建 doc（空正文 → 空 doc）；
 * 写：doc 变更 → 防抖 800ms → 整条 doc JSON（`editor.getJSON()`，**落库前经
 *     `sanitizeOutlineContent` 归一图片节点**：上传图 `src` 强制为稳定占位串
 *     `wf-image://<id>`、运行时 `blob:` 一律剥离，见 `components/editor/imageNode.ts`）
 *     + 纯文本摘要（`doc.textContent`）→ `outline:saveContent`，失败 warn 并静默重试一次；
 *     切换条目 / 卸载前 flush 立即落盘，避免丢字。
 *
 * `contentId` 为正文**载体行 id**（`outline_items.id`）：条目 = 条目行 id；
 * 正文卷 / 分组容器 = 各自卷级大纲行（`scope='volume'`）id（由 `useOutlineVolumes` 解析）；
 * 载体缺失（如卷纲行缺失）为 null。
 *
 * 与章节域 `useChapterDoc` 的取舍：章节正文按「每段一行」存 `paragraphs` 表；大纲正文整条
 * 存 `content_json`（支持 heading / 列表 / 表格块级结构），故此处**不再复用**段落映射工具，
 * 仅复用与领域无关的 `countCharacters`（有效字数口径）。
 */

/** 保存防抖毫秒数（与章节正文一致）。 */
const SAVE_DEBOUNCE_MS = 800

/** 空文档（无正文 / 载体缺失时占位）：与 `OutlineEditor` 的空态判定口径一致。 */
const EMPTY_DOC: Content = { type: 'doc', content: [{ type: 'paragraph' }] }

/** 大纲文档链路状态。 */
export type OutlineDocStatus = 'loading' | 'ready' | 'saving' | 'error'

export interface UseOutlineDocOptions {
  /** 正文载体行 id（`outline_items.id`）；null 表示无载体（不加载 / 不保存）。 */
  contentId: number | null
  /** Tiptap 编辑器实例（未就绪时为 null）。 */
  editor: Editor | null
}

export interface UseOutlineDocResult {
  /** 加载 / 保存状态指示（脚注展示）。 */
  status: OutlineDocStatus
  /** 当前正文有效字数（排除标点 / 符号 / 空白，`docParagraphs.countCharacters` 口径）。 */
  charCount: number
  /** 是否存在尚未落盘的改动。 */
  dirty: boolean
  /** 最近一次成功落盘时间（ISO 字符串），供编辑头「最后编辑」相对时间展示。 */
  lastSavedAt: string | null
  /** 绑定到 `editor.on('update')` 的回调。 */
  onUpdate: () => void
  /** 立即落盘挂起保存（可 await）。 */
  flush: () => Promise<void>
  /**
   * 正文更换后的淡入相位（`null` = 首次挂载 / 初次载入，不淡入）。
   * 与章节域共用 `useContentSwap`，调用处渲染为 `.editor-scroll` 的 `data-swap-phase`。
   */
  swapPhase: ContentSwapPhase | null
}

/** 解析库内 `contentJson`：合法对象原样返回，非法 / 空 → 空文档（不抛错）。 */
function parseContentJson(contentJson: string | null): Content {
  if (contentJson === null || contentJson.trim() === '') return EMPTY_DOC
  try {
    const parsed = JSON.parse(contentJson) as unknown
    if (typeof parsed === 'object' && parsed !== null) return parsed as Content
    return EMPTY_DOC
  } catch {
    return EMPTY_DOC
  }
}

/**
 * 大纲条目正文加载与防抖保存（整条 `content_json`）。
 *
 * 返回 `status` / `charCount` / `dirty` / `onUpdate` / `flush` / `swapPhase`（正文更换后的
 * 淡入相位，见 `useContentSwap`），并在切换 `contentId` 与卸载时 flush 挂起的保存。
 */
export function useOutlineDoc({ contentId, editor }: UseOutlineDocOptions): UseOutlineDocResult {
  const [status, setStatus] = useState<OutlineDocStatus>('loading')
  const [charCount, setCharCount] = useState(0)
  // 是否有未落盘变更（与 dirtyRef 同步的展示态）
  const [dirty, setDirty] = useState(false)
  // 最近一次成功落盘时间（ISO），供编辑头「最后编辑」展示
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  // 正文整体更换后的淡入相位（`.editor-scroll` 的 data-swap-phase；与章节域共用逻辑）
  const { swapPhase, markContentSwapped } = useContentSwap()

  // 当前正文载体行 id（null = 无载体 / 未加载）
  const contentIdRef = useRef<number | null>(null)
  // 挂起的保存定时器
  const saveTimerRef = useRef<number | null>(null)
  // 是否有未落盘变更
  const dirtyRef = useRef(false)
  // 最近一次保存的快照（`{contentJson, text}` JSON；避免内容未变时重复写库）
  const lastSavedRef = useRef<string | null>(null)

  const saveNow = useCallback(async (): Promise<void> => {
    const itemId = contentIdRef.current
    if (!itemId || !editor || !editor.isInitialized) return

    const contentJson = JSON.stringify(sanitizeOutlineContent(editor.getJSON()))
    const text = editor.state.doc.textContent
    const snapshot = JSON.stringify({ contentJson, text })
    if (lastSavedRef.current !== null && snapshot === lastSavedRef.current) {
      dirtyRef.current = false
      setDirty(false)
      return
    }

    setStatus('saving')
    try {
      const ok = await window.api.outline.saveContent(itemId, contentJson, text)
      if (ok) {
        lastSavedRef.current = snapshot
        dirtyRef.current = false
        setDirty(false)
        setLastSavedAt(new Date().toISOString())
        setStatus('ready')
      } else {
        // 静默重试一次
        const retry = await window.api.outline.saveContent(itemId, contentJson, text)
        if (retry) {
          lastSavedRef.current = snapshot
          dirtyRef.current = false
          setDirty(false)
          setLastSavedAt(new Date().toISOString())
          setStatus('ready')
        } else {
          log.warn('大纲正文保存失败（含一次重试）')
          setStatus('error')
        }
      }
    } catch (error) {
      log.warn('大纲正文保存异常', error)
      setStatus('error')
    }
  }, [editor])

  // flush：切换条目 / 卸载前立即落盘（可 await）
  const flush = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (dirtyRef.current) await saveNow()
  }, [saveNow])

  // 读链路：contentId 变化 → 读整条正文 → 建 doc
  useEffect(() => {
    if (!editor || !editor.isInitialized) return undefined
    let cancelled = false

    // 切条目前 flush 上一条目的挂起保存
    void flush()

    contentIdRef.current = null
    lastSavedRef.current = null
    dirtyRef.current = false

    if (contentId === null) {
      // 延迟到微任务再读写 state，避免在 effect 内同步 setState（react-hooks/set-state-in-effect）。
      void Promise.resolve().then(() => {
        if (cancelled || !editor.isInitialized) return
        editor.commands.setContent(EMPTY_DOC, { emitUpdate: false })
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
      contentIdRef.current = contentId
      try {
        const payload = await window.api.outline.getContent(contentId)
        if (cancelled) return
        const contentJson = payload?.contentJson ?? null
        const text = payload?.text ?? ''
        editor.commands.setContent(parseContentJson(contentJson), { emitUpdate: false })
        lastSavedRef.current = JSON.stringify({ contentJson, text })
        setCharCount(countCharacters([text]))
        setStatus('ready')
        // 切换条目内容提交：翻转相位 → 正文区淡入（见 useContentSwap；排在同批 setState 之后）。
        markContentSwapped()
      } catch (error) {
        log.warn('大纲正文读取失败', error)
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
    // flush 依赖 editor，且引用稳定（useCallback [saveNow]）；markContentSwapped 亦稳定
  }, [editor, contentId, flush, markContentSwapped])

  // 写链路：doc 变更 → 防抖 800ms 保存
  const onUpdate = useCallback((): void => {
    dirtyRef.current = true
    setDirty(true)
    if (editor) setCharCount(countCharacters([editor.state.doc.textContent]))
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

  return { status, charCount, dirty, lastSavedAt, onUpdate, flush, swapPhase }
}

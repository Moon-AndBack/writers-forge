import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Content } from '@tiptap/core'
import { createLogger } from '@renderer/lib/log'
import { sanitizeOutlineContent } from '@renderer/components/editor/imageNode'
import { useContentSwap, type ContentSwapPhase } from '@renderer/components/editor/useContentSwap'
import { useAutoSaveEnabled } from '../useAutoSaveEnabled'

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
 *     切换条目 / 卸载前 flush 立即落盘，避免丢字。防抖保存受设置 `autoSave` 控制
 *     （见 `useAutoSaveEnabled`）：关闭时只置脏、不排定时器，由保存按钮 / 切换条目 /
 *     切模块 / 关窗 flush 落库。
 *
 * `contentId` 为正文**载体行 id**（`outline_items.id`）：条目 = 条目行 id；
 * 正文卷 / 分组容器 = 各自卷级大纲行（`scope='volume'`）id（由 `useOutlineVolumes` 解析）；
 * 载体缺失（如卷纲行缺失）为 null。
 *
 * 与章节域 `useChapterDoc` 的取舍：章节正文按「每段一行」存 `paragraphs` 表；大纲正文整条
 * 存 `content_json`（支持 heading / 列表 / 表格块级结构），故此处**不再复用**段落映射工具。
 * 字数展示与章节域同源，走 `docWordLimit.docCharCount` 的编辑器块级缓存，本链路不做逐键统计。
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
 * 返回 `status` / `dirty` / `onUpdate` / `flush` / `swapPhase`（正文更换后的
 * 淡入相位，见 `useContentSwap`），并在切换 `contentId` 与卸载时 flush 挂起的保存。
 */
export function useOutlineDoc({ contentId, editor }: UseOutlineDocOptions): UseOutlineDocResult {
  const autoSaveEnabled = useAutoSaveEnabled()
  const [status, setStatus] = useState<OutlineDocStatus>('loading')
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
  // 编辑器内**实际装载**的内容 id（读链路 setContent 完成后写入）。
  // 与 contentIdRef 区分：后者在加载开始即指向新目标，而编辑器此时仍是旧内容。
  const loadedContentIdRef = useRef<number | null>(null)
  // 保存序号：每次 saveNow 递增，回包只有最新序号可生效（旧回包丢弃）。
  const saveSeqRef = useRef(0)

  // 当前编辑器内容的保存载荷与快照（保存前 / 回包后比对用，口径必须一致）。
  const captureContent = useCallback((): {
    contentJson: string
    text: string
    snapshot: string
  } => {
    if (!editor) return { contentJson: 'null', text: '', snapshot: 'null' }
    const contentJson = JSON.stringify(sanitizeOutlineContent(editor.getJSON()))
    const text = editor.state.doc.textContent
    return { contentJson, text, snapshot: JSON.stringify({ contentJson, text }) }
  }, [editor])

  const saveNow = useCallback(async (): Promise<void> => {
    const itemId = contentIdRef.current
    if (!itemId || !editor || !editor.isInitialized) return
    // 归属守卫：编辑器里实际装载的必须就是当前正文载体；加载窗口内仍是旧内容时跳过，
    // 避免旧内容被写到新目标、覆盖新目标原文。
    if (loadedContentIdRef.current !== itemId) {
      log.warn('跳过大纲保存：编辑器内容不属于当前载体', {
        loadedContentId: loadedContentIdRef.current,
        contentId: itemId
      })
      return
    }

    const { contentJson, text, snapshot } = captureContent()
    if (lastSavedRef.current !== null && snapshot === lastSavedRef.current) {
      dirtyRef.current = false
      setDirty(false)
      return
    }

    // 保存序号：回包只有仍是「最新一次保存」（且归属未变）时才可生效。
    saveSeqRef.current += 1
    const seq = saveSeqRef.current
    const isStale = (): boolean =>
      saveSeqRef.current !== seq || loadedContentIdRef.current !== itemId
    // 成功落库后的收尾：仅最新回包更新快照 / 状态；仅当编辑器当前内容仍等于刚保存的
    // 快照时才清 dirty（保存期间的新输入必须保持脏，等待下一轮保存落库）。
    const acceptSaved = (): void => {
      lastSavedRef.current = snapshot
      setLastSavedAt(new Date().toISOString())
      setStatus('ready')
      if (captureContent().snapshot === snapshot) {
        dirtyRef.current = false
        setDirty(false)
      }
    }

    setStatus('saving')
    try {
      const ok = await window.api.outline.saveContent(itemId, contentJson, text)
      if (ok) {
        if (isStale()) {
          log.info('丢弃过期大纲保存回包', { seq, contentId: itemId })
          return
        }
        acceptSaved()
      } else {
        // 静默重试一次
        const retry = await window.api.outline.saveContent(itemId, contentJson, text)
        if (retry) {
          if (isStale()) {
            log.info('丢弃过期大纲保存回包（重试）', { seq, contentId: itemId })
            return
          }
          acceptSaved()
        } else {
          if (isStale()) return
          log.warn('大纲正文保存失败（含一次重试）')
          setStatus('error')
        }
      }
    } catch (error) {
      if (isStale()) return
      log.warn('大纲正文保存异常', error)
      setStatus('error')
    }
  }, [editor, captureContent])

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
    loadedContentIdRef.current = null
    lastSavedRef.current = null
    dirtyRef.current = false

    if (contentId === null) {
      // 延迟到微任务再读写 state，避免在 effect 内同步 setState（react-hooks/set-state-in-effect）。
      void Promise.resolve().then(() => {
        if (cancelled || !editor.isInitialized) return
        editor.commands.setContent(EMPTY_DOC, { emitUpdate: false })
        setDirty(false)
        setStatus('ready')
        // 排在同批 setState 之后：flushSync 一次性提交（相位 + 状态），仅一次渲染。
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
        // 内容已真正装入编辑器：此刻起才允许把编辑器内容保存到该载体。
        loadedContentIdRef.current = contentId
        lastSavedRef.current = JSON.stringify({ contentJson, text })
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

  // 写链路：doc 变更 → 防抖 800ms 保存（`autoSave` 关闭时只置脏、不排定时器）
  const onUpdate = useCallback((): void => {
    dirtyRef.current = true
    setDirty(true)
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!autoSaveEnabled) return
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void saveNow()
    }, SAVE_DEBOUNCE_MS)
  }, [saveNow, autoSaveEnabled])

  // 运行中关闭自动保存：清掉已排队的防抖任务（改动仍保留 dirty，等手动 / 安全网 flush）。
  useEffect(() => {
    if (autoSaveEnabled || saveTimerRef.current === null) return
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
  }, [autoSaveEnabled])

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

  return { status, dirty, lastSavedAt, onUpdate, flush, swapPhase }
}

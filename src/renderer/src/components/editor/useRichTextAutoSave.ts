import { useCallback, useEffect, useRef, useState } from 'react'
import type { Content, Editor } from '@tiptap/core'
import { createLogger } from '@renderer/lib/log'
import { useAutoSaveEnabled } from '@renderer/shell/settings/useAutoSaveEnabled'
import { useContentSwap, type ContentSwapPhase } from './useContentSwap'

/** 富文本正文自动保存日志（转发至主进程落盘）。 */
const log = createLogger('richTextAutoSave')

/** 保存防抖毫秒数（章节 / 大纲统一）。 */
const SAVE_DEBOUNCE_MS = 800

/** 空正文占位文档（无目标 / 库内无内容时使用）。 */
const EMPTY_DOC: Content = { type: 'doc', content: [{ type: 'paragraph' }] }

/**
 * 富文本正文「加载 + 防抖保存」共享状态机（章节 / 大纲同构）。
 *
 * 两域只在数据形态上不同（章节按段存 `paragraphs` 表；大纲整条存 `content_json`），
 * 加载映射、保存载荷、快照口径经 `load` / `save` / `capture` 注入；其余保护逻辑共用：
 *
 * - 读链路 `cancelled` 守卫：切换目标 / 卸载后到达的读回包不得写编辑器；
 * - **加载窗口禁编辑**：`status === 'loading'` 由调用方映射为只读，因为编辑器此刻仍是
 *   上一个目标的内容（可编辑会把输入写进新目标）；
 * - **保存归属守卫**：`loadedContentIdRef` 记录编辑器**实际装载**的载体 id，与 `contentIdRef`
 *   （加载开始即指向新目标）区分；二者不一致时跳过保存，避免旧内容覆盖新目标原文；
 * - **保存序号**：`saveSeqRef` 每次保存 / 重载递增，旧回包（含重试回包）只丢状态、不改
 *   快照与脏标记；
 * - **dirty 只在回包后重新采集的快照 === 刚成功保存的快照时清除**：保存期间的新输入
 *   必须保持脏，等待下一轮保存；
 * - `flush()`：切目标 / 切模块 / 关窗前强制落库（跳过防抖）；失败静默重试一次。
 *
 * 上述守卫由 `655a66b` 的数据丢失修复引入，任何调整都必须逐条保留。
 */

/** 加载 / 保存状态指示（状态栏 / 脚注展示）。 */
export type SaveStatus = 'loading' | 'ready' | 'saving' | 'error'

/**
 * 一次内容采集：`payload` 为落库载荷，`snapshot` 为比对口径（序列化结果）。
 * 两者必须由同一份编辑内容派生，且 `snapshot` 与 `load` 返回的快照口径一致。
 */
export interface CapturedContent<Payload> {
  payload: Payload
  snapshot: string
}

/** 读链路产物：装入编辑器的 doc + 库内内容的「已保存」快照。 */
export interface LoadedContent {
  content: Content
  /** 库内内容序列化后的快照；载入成功即作为已保存基线。 */
  snapshot: string
}

export interface UseRichTextAutoSaveOptions<Payload> {
  /** 内容载体 id（章节 id / 大纲载体行 id）；null = 无目标（不加载 / 不保存）。 */
  contentId: number | null
  /** Tiptap 编辑器实例（未就绪时为 null）。 */
  editor: Editor | null
  /** 读：按载体 id 取库内内容 → doc + 已保存快照（排序 / 解析等域内映射在调用方）。 */
  load: (id: number, editor: Editor) => Promise<LoadedContent>
  /** 写：整份覆盖落库；false = 失败（由本 hook 静默重试一次）。 */
  save: (id: number, payload: Payload) => Promise<boolean>
  /** 采集编辑器当前内容（保存载荷 + 快照）。 */
  capture: (editor: Editor) => CapturedContent<Payload>
  /** 每次真正落库后的副作用（如广播派生数据失效）；过期回包不触发。 */
  onSaved?: () => void
  /** 日志前缀（区分域，如「章节正文」/「大纲正文」）。 */
  label: string
}

export interface UseRichTextAutoSaveResult {
  status: SaveStatus
  /** 是否存在尚未落盘的改动（状态栏「未保存」显示用，不参与保存机制）。 */
  dirty: boolean
  /** 最近一次成功落盘时间（ISO 字符串）。 */
  lastSavedAt: string | null
  /** 绑定到 `editor.on('update')` 的回调。 */
  onUpdate: () => void
  /** 立即落盘挂起的保存（可 await）。 */
  flush: () => Promise<void>
  /** 丢弃编辑器当前内容、从库重读当前目标并重建 doc（不触发淡入）。 */
  reload: () => Promise<void>
  /** 正文更换后的淡入相位（见 `useContentSwap`）。 */
  swapPhase: ContentSwapPhase | null
}

/**
 * 富文本正文加载与防抖保存。
 *
 * 返回 `status` / `dirty` / `lastSavedAt` / `onUpdate` / `flush` / `reload` / `swapPhase`，
 * 并在切换目标与卸载时 flush 挂起的保存。
 */
export function useRichTextAutoSave<Payload>({
  contentId,
  editor,
  load,
  save,
  capture,
  onSaved,
  label
}: UseRichTextAutoSaveOptions<Payload>): UseRichTextAutoSaveResult {
  const autoSaveEnabled = useAutoSaveEnabled()
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [dirty, setDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const { swapPhase, markContentSwapped } = useContentSwap()

  // 当前目标载体 id（null = 无目标；加载开始时即指向新目标）
  const contentIdRef = useRef<number | null>(null)
  // 挂起的保存定时器
  const saveTimerRef = useRef<number | null>(null)
  // 是否有未落盘变更
  const dirtyRef = useRef(false)
  // 最近一次保存的快照（避免内容未变时重复写库）
  const lastSavedRef = useRef<string | null>(null)
  // 编辑器内**实际装载**的载体 id（读链路 setContent / reload 完成后写入）。
  // 与 contentIdRef 区分：后者在加载开始即指向新目标，而编辑器此时仍是旧内容。
  const loadedContentIdRef = useRef<number | null>(null)
  // 保存序号：每次 saveNow / reload 递增，回包只有最新序号可生效（旧回包丢弃）。
  const saveSeqRef = useRef(0)

  const saveNow = useCallback(async (): Promise<void> => {
    const id = contentIdRef.current
    if (!id || !editor || !editor.isInitialized) return
    // 归属守卫：编辑器里实际装载的必须就是当前目标；加载窗口内仍是旧内容时跳过，
    // 避免旧内容被写到新目标、覆盖新目标原文。
    if (loadedContentIdRef.current !== id) {
      log.warn(`跳过保存：编辑器内容不属于当前目标（${label}）`, {
        loadedContentId: loadedContentIdRef.current,
        contentId: id
      })
      return
    }

    const { payload, snapshot } = capture(editor)
    if (lastSavedRef.current !== null && snapshot === lastSavedRef.current) {
      dirtyRef.current = false
      setDirty(false)
      return
    }

    // 保存序号：回包只有仍是「最新一次保存」（且归属未变）时才可生效。
    saveSeqRef.current += 1
    const seq = saveSeqRef.current
    const isStale = (): boolean => saveSeqRef.current !== seq || loadedContentIdRef.current !== id
    // 成功落库后的收尾：仅最新回包更新快照 / 状态；仅当编辑器当前内容仍等于刚保存的
    // 快照时才清 dirty（保存期间的新输入必须保持脏，等待下一轮保存落库）。
    const acceptSaved = (): void => {
      lastSavedRef.current = snapshot
      setLastSavedAt(new Date().toISOString())
      setStatus('ready')
      if (capture(editor).snapshot === snapshot) {
        dirtyRef.current = false
        setDirty(false)
      }
      onSaved?.()
    }

    setStatus('saving')
    try {
      if (await save(id, payload)) {
        if (isStale()) {
          log.info(`丢弃过期保存回包（${label}）`, { seq, contentId: id })
          return
        }
        acceptSaved()
        return
      }
      // 静默重试一次
      if (await save(id, payload)) {
        if (isStale()) {
          log.info(`丢弃过期保存回包（重试）（${label}）`, { seq, contentId: id })
          return
        }
        acceptSaved()
      } else {
        if (isStale()) return
        log.warn(`${label}保存失败（含一次重试）`)
        setStatus('error')
      }
    } catch (error) {
      if (isStale()) return
      log.warn(`${label}保存异常`, error)
      setStatus('error')
    }
  }, [editor, save, capture, onSaved, label])

  // flush：切换目标前立即落盘（可 await，供替换前的串行化调用）
  const flush = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (dirtyRef.current) await saveNow()
  }, [saveNow])

  // 重载：丢弃编辑器当前内容，从库重读该目标并重建 doc（用于「替换命中当前目标」后同步）。
  // 调用方应先 flush 再 reload；setContent 以 emitUpdate:false 写入，不触发防抖保存。
  // **不触发淡入**：重读是同一内容原地同步，不属于「换到新内容」，淡入会闪。
  const reload = useCallback(async (): Promise<void> => {
    const id = contentIdRef.current
    if (!id || !editor || !editor.isInitialized) return
    try {
      const { content, snapshot } = await load(id, editor)
      // 重载即开启新一轮：更早发起的保存回包一律丢弃（避免旧快照回写 / 误清脏）。
      saveSeqRef.current += 1
      loadedContentIdRef.current = id
      editor.commands.setContent(content, { emitUpdate: false })
      lastSavedRef.current = snapshot
      dirtyRef.current = false
      setDirty(false)
      setStatus('ready')
    } catch (error) {
      log.warn(`${label}重载失败`, error)
      setStatus('error')
    }
  }, [editor, load, label])

  // 读链路：contentId 变化 → 读库 → 建 doc
  useEffect(() => {
    if (!editor || !editor.isInitialized) return undefined
    let cancelled = false

    // 切换目标前 flush 上一个目标的挂起保存（同步段先捕获旧 id，不会被下方重置影响）
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
        const { content, snapshot } = await load(contentId, editor)
        if (cancelled) return
        editor.commands.setContent(content, { emitUpdate: false })
        // 内容已真正装入编辑器：此刻起才允许把编辑器内容保存到该目标。
        loadedContentIdRef.current = contentId
        lastSavedRef.current = snapshot
        setStatus('ready')
        // 内容提交：翻转相位 → 正文区淡入（见 useContentSwap；排在同批 setState 之后）。
        markContentSwapped()
      } catch (error) {
        log.warn(`${label}读取失败`, error)
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
    // load / flush 引用稳定，入依赖仅为满足 exhaustive-deps
  }, [editor, contentId, flush, load, markContentSwapped, label])

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

  return { status, dirty, lastSavedAt, onUpdate, flush, reload, swapPhase }
}

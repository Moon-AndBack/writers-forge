import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import type { Content, Editor, Extensions } from '@tiptap/core'
import { useEditor } from '@tiptap/react'
import { docJsonToBlockText } from '../../../../shared/richTextDoc'
import {
  RICH_TEXT_EDITOR_PROPS,
  isEmptyRichTextValue,
  parseRichTextContent
} from './richTextExtensions'

/**
 * 块级正文编辑器的**归一值**（空正文 → `text: ''` / `json: null`，与主进程 `richText` 同口径）。
 *
 * - `text`：派生纯文本摘要（`docJsonToBlockText`，块级之间用 `\n` 分隔，保留段落边界）；
 * - `json`：整条块级 Tiptap JSON 串（空文档 → `null`）。
 */
export interface RichTextBodyValue {
  /** 派生纯文本摘要（落库摘要列）。 */
  text: string
  /** 整条块级 Tiptap JSON 串（空正文 → `null`）。 */
  json: string | null
}

/** 编辑器当前快照：归一值 + 空态（占位类判定）。 */
export interface RichTextBodySnapshot {
  /** 归一值（空文档已归一为 `text: ''` / `json: null`）。 */
  value: RichTextBodyValue
  /** 是否为空正文（doc 顶层全为空段落 / 无内容）。 */
  empty: boolean
}

/**
 * 读取编辑器当前快照（`update` 事件与手动 `flush` 共用同一口径）。
 *
 * 空态判定走 `isEmptyRichTextValue`（与主进程 `isEmptyRichDoc` 同口径）；非空时同时产出
 * `docJsonToBlockText`（摘要，块级之间用 `\n` 分隔）与 `JSON.stringify(json)`（真源）。
 */
export function readRichTextBody(editor: Editor): RichTextBodySnapshot {
  const json = editor.getJSON()
  const empty = isEmptyRichTextValue(json)
  return {
    empty,
    value: empty
      ? { text: '', json: null }
      : { text: docJsonToBlockText(JSON.stringify(json)), json: JSON.stringify(json) }
  }
}

/** 容器事件（focus-within 语义）：由调用方展开到正文容器 `div` 上。 */
export interface RichTextBodyContainerProps {
  onFocus: () => void
  onBlur: (event: FocusEvent<HTMLDivElement>) => void
}

export interface UseRichTextBodyEditorOptions {
  /**
   * 初始正文（`descriptionJson` / `content_json` 原串；`null` = 空正文）。
   * **仅在挂载时读取一次**——调用方切文档时应按 `key` 重建组件（与既有口径一致）。
   */
  initialJson: string | null
  /**
   * 扩展数组。**必须是模块级常量或 `useMemo` 恒等引用**：`useEditor` 按引用比对选项，
   * 每次渲染新建会把 DOM Selection 搬回 `.ProseMirror`，导致同页其它输入框中文输入法
   * 组合串被丢弃（详见 `RICH_TEXT_EXTENSIONS` 说明）。
   *
   * 通用层**不内置**任何域专有扩展（`EntityHighlight` / `DocWordLimit` 等由调用方拼装）。
   */
  extensions: Extensions
  /** 正文变更：每次 `update` 产出**已归一**的值（空文档 → `text: ''` / `json: null`）。 */
  onChange: (value: RichTextBodyValue) => void
  /** 聚焦态上报（容器内焦点转移不算失焦；卸载兜底归「非编辑中」）。 */
  onEditingChange?: (editing: boolean) => void
  /** 编辑器实例就绪 / 销毁回调（挂载传实例、卸载传 `null`），供上层注册实例共享。 */
  onEditorReady?: (editor: Editor | null) => void
  /**
   * 是否可编辑（默认 `true`）。⚠️ 只读**必须**走本项（内部 `editor.setEditable()`）；
   * `useEditor` 的 `editable` 选项恒为字面量 `true`（恒等性要求，见 `RICH_TEXT_EXTENSIONS`）。
   */
  editable?: boolean
}

export interface UseRichTextBodyEditorResult {
  /** Tiptap 编辑器实例（首帧即就绪，可安全传给工具栏）。 */
  editor: Editor | null
  /** 空态（叠加占位文案类）；随 `update` 同步。 */
  isEmpty: boolean
  /** 正文容器事件（`focus` / `blur`）：调用方展开到容器 `div`（须为**同一**捕获焦点的容器）。 */
  containerProps: RichTextBodyContainerProps
  /** 立即把最后一次已知值再上报一次（`onChange`）；用于外层有防抖 / 合并时的手动兜底。 */
  flush: () => void
}

/**
 * 块级富文本正文编辑器**通用 hook**（剧情场景正文 / 设定库正文共用，§9）。
 *
 * 职责：惰性初始文档 + 建实例 + 空态判定 + 变更上报 + 聚焦态上报 + 卸载兜底。
 * 界面（`EditorContent` / 占位文案 / 域专有扩展）留在调用方的**薄壳**里，本 hook 不感知
 * 任何 `pages/writer` 专有模块（避免 `components → pages` 反向依赖）。
 *
 * 关键约束（同 `RICH_TEXT_EXTENSIONS` 说明）：
 * - `content` / `editorProps` 为恒等引用（惰性 state + 模块级常量）；
 * - `editable` 在 `useEditor` 处为字面量 `true`，只读经 `editor.setEditable()`；
 * - 回调（`onChange` / `onEditingChange` / `onEditorReady`）一律以 ref 持最新值，
 *   订阅类 effect **只依赖 `editor`**，避免因回调身份变化反复重挂 / 重建实例。
 */
export function useRichTextBodyEditor({
  initialJson,
  extensions,
  onChange,
  onEditingChange,
  onEditorReady,
  editable = true
}: UseRichTextBodyEditorOptions): UseRichTextBodyEditorResult {
  // 初始文档：`useEditor` 的 `content` 需恒等引用 → 惰性 state 只算一次、引用稳定。
  const [initialContent] = useState<Content>(() => parseRichTextContent(initialJson))
  // 空态（叠加占位文案）：初始按初始文档判定，之后随 `update` 同步。
  const [isEmpty, setIsEmpty] = useState<boolean>(() => isEmptyRichTextValue(initialContent))

  // 回调 ref：下面各 effect 只依赖 `editor`，回调换了也不重挂监听 / 不重建实例。
  const onChangeRef = useRef(onChange)
  const onEditingChangeRef = useRef(onEditingChange)
  const onEditorReadyRef = useRef(onEditorReady)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    onEditingChangeRef.current = onEditingChange
  }, [onEditingChange])
  useEffect(() => {
    onEditorReadyRef.current = onEditorReady
  }, [onEditorReady])

  // 最后一次已知值：卸载兜底 flush 只需重放它，**不读取可能已被销毁的实例**。
  const latestRef = useRef<RichTextBodyValue | null>(null)

  const editor = useEditor({
    extensions,
    content: initialContent,
    // ⚠️ 恒为字面量 `true`（只读走下方 `setEditable`，理由见 `RICH_TEXT_EXTENSIONS`）。
    editable: true,
    autofocus: false,
    editorProps: RICH_TEXT_EDITOR_PROPS
  })

  // 正文变更 → 归一后上报（空文档 → `null` / `''`），并同步空态占位类。
  useEffect(() => {
    if (!editor) return undefined
    const sync = (): void => {
      const snapshot = readRichTextBody(editor)
      setIsEmpty(snapshot.empty)
      latestRef.current = snapshot.value
      onChangeRef.current(snapshot.value)
    }
    editor.on('update', sync)
    return () => {
      editor.off('update', sync)
    }
  }, [editor])

  // 只读同步（真源在调用方）：默认 `true` 时不触碰实例，避免多余事务。
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (editor.isEditable !== editable) editor.setEditable(editable)
  }, [editor, editable])

  // 实例就绪 / 销毁回调（供上层把实例注册进共享上下文）；卸载置 `null`。
  useEffect(() => {
    onEditorReadyRef.current?.(editor)
    return () => {
      onEditorReadyRef.current?.(null)
    }
  }, [editor])

  // 卸载兜底：重放最后一次已知值（覆盖外层防抖 / 合并丢失），并归「非编辑中」
  // （编辑器随文档切换销毁时浏览器可能不派发 blur）。
  useEffect(() => {
    return () => {
      const value = latestRef.current
      if (value !== null) onChangeRef.current(value)
      onEditingChangeRef.current?.(false)
    }
  }, [])

  const flush = useCallback((): void => {
    const value = latestRef.current
    if (value !== null) onChangeRef.current(value)
  }, [])

  // 容器事件：focus-within 语义——容器内焦点转移（ProseMirror ↔ 行内节点视图）不算失焦。
  const containerProps = useMemo<RichTextBodyContainerProps>(
    () => ({
      onFocus: (): void => {
        onEditingChangeRef.current?.(true)
      },
      onBlur: (event: FocusEvent<HTMLDivElement>): void => {
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        onEditingChangeRef.current?.(false)
      }
    }),
    []
  )

  return { editor, isEmpty, containerProps, flush }
}

export default useRichTextBodyEditor

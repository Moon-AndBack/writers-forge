import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'

/**
 * 富文本正文编辑器**共享上下文**（通用机制，§9 禁止平行实现）。
 *
 * 背景：写作页的「右栏正文编辑器」与「标题栏工具栏」分处两棵子树——编辑器实例在右栏，
 * 动作节点注册在标题栏。二者需一个共同祖先（`Writer.tsx`）中转 `editor` 实例与聚焦态。
 * 机制上提为**按槽位（slot）登记**的通用注册表：同一个 Provider 同时承载章节 / 剧情 /
 * 设定库三个槽位，各域只用自己的 slot 读写，互不串扰。
 *
 * 职责边界：
 * - `editors`：Provider 内部 state。各栏正文编辑器挂载 / 卸载时经 `registerEditor` 写入
 *   （卸载传 `null`），标题栏动作组件 / 右栏 AI 面板只读；
 * - `editing`（聚焦态）：**真源仍在页面层**——剧情取 `usePlotWorkspace().editing`、
 *   设定库取 `Writer.tsx` 的页面 state，经 `slots` 传入本 Provider 透传；
 *   `useRichTextEditor().reportEditing` 把右栏编辑器的聚焦 / 失焦交回页面层，
 *   本 Provider **不另存第二份状态**（避免与状态栏 / 守卫口径打架）；
 * - `bookId`：Provider 级统一传入，供工具栏插图按书隔离入库。
 *
 * 调用关系：`Writer.tsx` 挂 `RichTextEditorProvider`（三栏之外）→ 中栏章节正文编辑器
 * （`ChaptersView`）与右栏编辑器调用 `useRichTextEditor(slot).registerEditor`，剧情 / 设定库
 * 另调用 `reportEditing` → 标题栏动作组件 / 右栏 AI 面板调用 `useRichTextEditor(slot)` 读
 * `editor / editing / bookId`，并按需用 `readEditorSelection` 取选文本。
 */
export type RichTextEditorSlot = 'chapter' | 'plot' | 'dossier'

/** 页面层交给 Provider 的单槽位配置（聚焦态真源 + 上报入口）。 */
export interface RichTextEditorSlotSource {
  /** 本槽位正文编辑器是否处于「编辑中」（聚焦态；供标题栏工具栏按态显隐）。 */
  editing: boolean
  /** 右栏编辑器聚焦 / 失焦上报（写回页面层真源）。 */
  onEditingChange?: (editing: boolean) => void
}

/** 槽位配置表：未提供的槽位按「未编辑 + 无编辑器」处理。 */
export type RichTextEditorSlots = Partial<Record<RichTextEditorSlot, RichTextEditorSlotSource>>

interface RichTextEditorContextValue {
  bookId?: string
  slots: RichTextEditorSlots
  editors: Partial<Record<RichTextEditorSlot, Editor | null>>
  register: (slot: RichTextEditorSlot, editor: Editor | null) => void
}

const RichTextEditorContext = createContext<RichTextEditorContextValue | null>(null)

export interface RichTextEditorProviderProps {
  /** 归属书 id（插图按书隔离入库；空 / undefined → 插图入口禁用）。 */
  bookId?: string
  /** 各槽位的聚焦态与上报入口（应由调用方 `useMemo` 缓存，避免每次渲染换引用）。 */
  slots: RichTextEditorSlots
  children: ReactNode
}

/** 富文本编辑器注册表 Provider：包裹写作页三栏（置于 `Writer.tsx`）。 */
export function RichTextEditorProvider({ bookId, slots, children }: RichTextEditorProviderProps) {
  // 各槽位的编辑器实例：右栏编辑器挂载写实例、卸载写 null。
  const [editors, setEditors] = useState<Partial<Record<RichTextEditorSlot, Editor | null>>>({})

  // 引用稳定：同槽位重复登记同一实例时直接返回原 state，避免无意义重渲染。
  const register = useCallback((slot: RichTextEditorSlot, editor: Editor | null): void => {
    setEditors((prev) => (prev[slot] === editor ? prev : { ...prev, [slot]: editor }))
  }, [])

  const value = useMemo<RichTextEditorContextValue>(
    () => ({ bookId, slots, editors, register }),
    [bookId, slots, editors, register]
  )

  return <RichTextEditorContext.Provider value={value}>{children}</RichTextEditorContext.Provider>
}

/** 单槽位读写视图（供编辑器注册 / 标题栏动作读取）。 */
export interface RichTextEditorSlotValue {
  /** 本槽位正文 Tiptap 编辑器实例（未挂载 / 未选中 / 无 Provider 时为 null）。 */
  editor: Editor | null
  /** 本槽位正文编辑器聚焦态（真源在页面层，经 Provider 透传）。 */
  editing: boolean
  /** 归属书 id（插图入口用）。 */
  bookId?: string
  /** 右栏编辑器挂载 / 卸载时注册实例（卸载传 null；引用稳定）。 */
  registerEditor: (editor: Editor | null) => void
  /** 右栏编辑器聚焦态上报（写回页面层真源；引用稳定）。 */
  reportEditing: (editing: boolean) => void
}

/**
 * 读取指定槽位的编辑器共享态。
 *
 * 无 Provider（如独立测试 / 组件被单独复用）时返回安全空值：`editor: null`、
 * `editing: false`，两个回调为空操作——调用方无需判空分支。
 */
export function useRichTextEditor(slot: RichTextEditorSlot): RichTextEditorSlotValue {
  const context = useContext(RichTextEditorContext)
  const register = context?.register
  const report = context?.slots[slot]?.onEditingChange

  const registerEditor = useCallback(
    (editor: Editor | null): void => {
      register?.(slot, editor)
    },
    [register, slot]
  )

  const reportEditing = useCallback(
    (next: boolean): void => {
      if (report) report(next)
    },
    [report]
  )

  return {
    editor: context?.editors[slot] ?? null,
    editing: context?.slots[slot]?.editing ?? false,
    bookId: context?.bookId,
    registerEditor,
    reportEditing
  }
}

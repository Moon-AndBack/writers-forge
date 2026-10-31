import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { RichTextEditorContext } from './richTextEditorContext'
import type {
  RichTextEditorContextValue,
  RichTextEditorSlot,
  RichTextEditorSlots
} from './richTextEditorContext'

/** 页面层交给 Provider 的单槽位配置（聚焦态真源 + 上报入口）。 */
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

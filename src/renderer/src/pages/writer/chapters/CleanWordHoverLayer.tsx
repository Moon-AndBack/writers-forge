import type { ReactElement } from 'react'
import type { Editor } from '@tiptap/core'
import { MarkHoverTip } from '../../../components/editor/MarkHoverTip'
import { useCleanWordHover } from './useCleanWordHover'

/**
 * 违禁词命中悬停层（`ChaptersView` 只挂一行）。
 *
 * 自包含：内部建悬停 hook 并渲染通用浮层 `MarkHoverTip`，页面层不持有任何状态。
 * 与伏笔浮层共存时由 `useCleanWordHover` 的同锚点优先级裁决（伏笔优先）。
 */
export default function CleanWordHoverLayer({ editor }: { editor: Editor | null }): ReactElement {
  const tip = useCleanWordHover(editor)
  return <MarkHoverTip tip={tip} />
}

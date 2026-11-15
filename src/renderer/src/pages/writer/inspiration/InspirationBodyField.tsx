/**
 * 灵感右栏 · 正文富文本编辑器（域内装配，通用底座在 `components/editor`）。
 *
 * 为什么不用 `ShortRichTextField` 薄壳：那层壳走 `SHORT_TEXT_EXTENSIONS`（短文本口径，
 * 不含标题 / 列表 / 表格，也不带长文排版），且**未透传** `onEditingChange` /
 * `onEditorReady`——灵感正文需要全量扩展、`.doc-body` 长文排版与聚焦态上报，故直接
 * 装配底层通用 hook `useRichTextBodyEditor`（与 `PlotBodyEditor` / `DossierBodyEditor`
 * 同一手法，§9：状态与副作用只在 hook 里，本组件只做「域内装配 + 界面」）。
 *
 * 装配内容：
 * - 扩展：**全量** `RICH_TEXT_EXTENSIONS`（标题 / 列表 / 引用 / 代码块 / 分隔线 / 链接 /
 *   表格 / 高亮 / 字色 / 行内图片）+ `EntityHighlight`（按书匹配，打开即有内容时补一次
 *   全段匹配），与章节 / 剧情 / 设定库正文同一套高亮机制；
 * - 共享槽位：`useRichTextEditor('inspiration')` 做 `registerEditor`（实例给标题栏工具栏）
 *   与 `reportEditing`（聚焦态写回 `useInspirationBundle`，`Writer.tsx` 经槽位表透传）；
 * - 排版：`EditorContent` 挂 `.doc-body`，沿用全局长文口径（字号 / 行高 / 首行缩进），
 *   域内覆写见 `writer-inspiration.css`；
 * - 实体悬停卡：容器事件委托（`useEntityHover`）+ `HoverCard`，与剧情正文同款。
 *
 * 落库口径：每次 `update` 只把归一值（`text` 摘要 + `json` 真源）回传上层草稿，
 * 落库由右栏保存条统一提交（主进程据 JSON 双列同步）。
 */
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { EditorContent } from '@tiptap/react'
import { RICH_TEXT_EXTENSIONS, toCssString } from '../../../components/editor/richTextExtensions'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import {
  useRichTextBodyEditor,
  type RichTextBodyValue
} from '../../../components/editor/useRichTextBodyEditor'
import { EntityHighlight } from '../entities/entityHighlight'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'

export interface InspirationBodyFieldProps {
  /** 归属书 id（实体高亮按书匹配）。 */
  bookId: string
  /** 初始正文（库内 JSON；`null` = 空）。挂载时读取一次，切换条目由外层 `key` 重建。 */
  initialJson: string | null
  /** 归一值变更（空文档 → `text: ''` / `json: null`）。 */
  onChange: (value: RichTextBodyValue) => void
  /** 空态占位文案（调用方经 `t()` 传入）。 */
  placeholder: string
  /** 无障碍标签（富文本区不是原生 labelable 控件，故不走 `htmlFor`）。 */
  ariaLabel?: string
}

export default function InspirationBodyField({
  bookId,
  initialJson,
  onChange,
  placeholder,
  ariaLabel
}: InspirationBodyFieldProps) {
  // 编辑器共享：实例注册进通用注册表，聚焦态上报回页面层（`useInspirationBundle`）。
  const { registerEditor, reportEditing } = useRichTextEditor('inspiration')

  // ⚠️ `getBookId` 闭包必须捕获当前 `bookId`（不得提到模块级常量）；数组经
  // `useMemo([bookId])` 恒等（仅切书重建），满足 `useEditor` 的引用比对要求。
  // `matchOnCreate`：正文经 `content` 直接带入（无载入事务），创建后补一次全段匹配。
  const extensions = useMemo(
    () => [
      ...RICH_TEXT_EXTENSIONS,
      EntityHighlight.configure({
        getBookId: () => bookId,
        matchOnCreate: true
      })
    ],
    [bookId]
  )

  const entityHover = useEntityHover()

  const { editor, isEmpty, containerProps } = useRichTextBodyEditor({
    initialJson,
    extensions,
    onChange,
    onEditingChange: reportEditing,
    onEditorReady: (instance) => {
      registerEditor(instance)
    }
  })

  return (
    <div
      className="inspiration-body"
      role="group"
      aria-label={ariaLabel}
      {...containerProps}
      onMouseOver={entityHover.onMouseOver}
      onMouseLeave={entityHover.onMouseLeave}
    >
      <EditorContent
        editor={editor}
        className={`doc-body${isEmpty ? ' is-empty' : ''}`}
        style={
          {
            '--editor-placeholder': toCssString(placeholder)
          } as CSSProperties
        }
      />
      <HoverCard
        anchor={entityHover.anchor}
        onClose={entityHover.close}
        onPointerEnter={entityHover.cancelHide}
        onPointerLeave={entityHover.onMouseLeave}
      />
    </div>
  )
}

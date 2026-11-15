/**
 * 伏笔描述字段（**右栏专用**，§9）：全量富文本薄壳 + 域内装配。
 * 新建弹窗改用 `EntityShortRichTextField`（多行短文本 + 实体高亮），不再走本组件。
 *
 * 为什么右栏不走 `ShortRichTextField`：那层壳用 `SHORT_TEXT_EXTENSIONS`（短文本口径，
 * 连加粗都没有，更没有标题 / 列表 / 表格），与已富文本化的章节 / 剧情 / 设定库正文
 * 不同源；右栏会打开任意已有描述（含标题 / 列表 / 表格），用短底座保存会把这些节点
 * 抹平。故与 `InspirationBodyField` / `DossierBodyEditor` 同一手法：直接装配
 * `RICH_TEXT_EXTENSIONS` + `useRichTextBodyEditor`，状态与副作用留在通用 hook，
 * 本组件只做「域内装配 + 界面」。
 *
 * 装配内容：
 * - 扩展：**全量** `RICH_TEXT_EXTENSIONS`（标题 / 列表 / 引用 / 代码块 / 分隔线 / 链接 /
 *   表格 / 高亮 / 字色 / 行内图片）+ `EntityHighlight`（按书匹配，`matchOnCreate` 保证
 *   「打开即有内容」时补一次全段匹配）；
 * - 共享槽位：`fill`（右栏主编辑区）时经 `useRichTextEditor('foreshadow')` 做
 *   `registerEditor` 与 `reportEditing`，供标题栏工具栏按聚焦态显隐；
 * - 排版：`EditorContent` 挂 `.doc-body`，沿用全局长文口径，域内覆写见
 *   `writer-foreshadow.css`；
 * - 实体悬停卡：容器事件委托（`useEntityHover`）+ `HoverCard`，`Modal` 内不启用
 *   （弹窗层 `z-index` 高于悬停卡，卡片会被遮罩挡住）。
 *
 * ⚠️ 若将来给新建弹窗加「编辑已有」模式，**必须换回本组件**：短底座
 * （`SHORT_TEXT_EXTENSIONS`）不含 heading / list / table 等块级节点，用它打开已有
 * 富文本再保存会把这些节点抹平，只剩短字段能表达的段落与行内标记。
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

export interface ForeshadowDescriptionFieldProps {
  /** 归属书 id（实体高亮按书匹配）。 */
  bookId: string
  /** 初始富文本描述（库内 JSON；`null` = 空）。挂载时读取一次，切换条目由外层 `key` 重建。 */
  initialJson: string | null
  /** 归一值变更（空文档 → `text: ''` / `json: null`）。 */
  onChange: (value: RichTextBodyValue) => void
  /** 空态占位文案（调用方经 `t()` 传入）。 */
  placeholder: string
  /** 无障碍标签（富文本区不是原生 labelable 控件，故不走 `htmlFor`）。 */
  ariaLabel?: string
  /** 撑满父容器剩余高度（右栏）。 */
  fill?: boolean
  /**
   * 是否启用实体悬停卡（默认 `false`）。
   *
   * 右栏可用；`Modal` 内不启用——弹窗层 `z-index: 1000` 高于悬停卡
   * `--z-hover-card`（970），卡片会被遮罩挡住，故弹窗只保留高亮、不弹卡。
   */
  hoverCard?: boolean
}

export default function ForeshadowDescriptionField({
  bookId,
  initialJson,
  onChange,
  placeholder,
  ariaLabel,
  fill = false,
  hoverCard = false
}: ForeshadowDescriptionFieldProps) {
  // 编辑器共享：`fill`（右栏主编辑区）才登记实例 / 上报聚焦态。
  const { registerEditor, reportEditing } = useRichTextEditor('foreshadow')

  // ⚠️ `getBookId` 闭包必须捕获当前 `bookId`（不得提到模块级常量）；数组经
  // `useMemo([bookId])` 恒等（仅切书重建），满足 `useEditor` 的引用比对要求。
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
    onEditingChange: fill ? reportEditing : undefined,
    onEditorReady: fill
      ? (instance) => {
          registerEditor(instance)
        }
      : undefined
  })

  const hoverHandlers = hoverCard
    ? { onMouseOver: entityHover.onMouseOver, onMouseLeave: entityHover.onMouseLeave }
    : {}

  return (
    <div
      className={`foreshadow-desc-field${fill ? ' foreshadow-desc-field--fill' : ''}`}
      role="group"
      aria-label={ariaLabel}
      {...containerProps}
      {...hoverHandlers}
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
      {hoverCard ? (
        <HoverCard
          anchor={entityHover.anchor}
          onClose={entityHover.close}
          onPointerEnter={entityHover.cancelHide}
          onPointerLeave={entityHover.onMouseLeave}
        />
      ) : null}
    </div>
  )
}

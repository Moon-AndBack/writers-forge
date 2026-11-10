import { useMemo } from 'react'
import type { ReactElement } from 'react'
import ShortRichTextField from '../../../components/editor/ShortRichTextField'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
import { EntityHighlight } from './entityHighlight'
import { HoverCard } from './HoverCard'
import { useEntityHover } from './useEntityHover'
import '../../../styles/components/entity-rich-text.css'

/**
 * 带实体高亮 / 悬停卡的短文本富文本字段（共享组件，§9）。
 *
 * 与 `ShortRichTextField` 的关系：字段外观、占位、高度策略、只读同步完全交给通用薄壳，
 * 本组件只负责**实体域装配**——按 `bookId` 构造 `EntityHighlight`，并按需挂
 * `useEntityHover` 事件委托与唯一 `HoverCard`。初始正文经 `content` 直接建 doc，
 * 故默认 `matchOnCreate: true`；初始空文档（如新建弹窗）可传 `false` 省一次空匹配。
 *
 * - `hoverCard=false` 供右栏面板 / 弹窗使用：右栏面板根容器已统一挂一个 `HoverCard`；
 *   弹窗层 `z-index: 1000` 高于悬停卡 `--z-hover-card`（970），卡片会被遮罩挡住。此时
 *   直接渲染 `ShortRichTextField`，不渲染 `.entity-rich-text-shell` 外壳、不挂事件委托
 *   （少一层纯传递 DOM），高度由父级 `.wf-field__control` 的纵向 flex 直接传递。
 */
export interface EntityShortRichTextFieldProps {
  /** 归属书 id；空串 = 不启用实体高亮（仍正常编辑）。 */
  bookId: string
  /** 初始正文（库内 JSON 串；`null` = 空）。仅在挂载时读取一次，切换目标由调用方按 `key` 重建。 */
  initialJson: string | null
  /** 正文变更：已归一值（空文档 → `text: ''` / `json: null`）。 */
  onChange: (value: RichTextBodyValue) => void
  /** 空态占位文案（调用方经 `t()` 传入）。 */
  placeholder: string
  /** 无障碍标签（容器 `role="group"`）。 */
  ariaLabel?: string
  /** 撑满父容器剩余高度（右栏）；默认按内容高度。 */
  fill?: boolean
  /** 只读（内部走 `editor.setEditable(false)`）。 */
  disabled?: boolean
  /** 是否挂载悬停卡（默认 `true`；右栏面板统一委托 / 弹窗内传 `false`）。 */
  hoverCard?: boolean
  /** 创建后是否补一次整篇匹配（默认 `true`；初始空文档可传 `false`）。 */
  matchOnCreate?: boolean
}

export function EntityShortRichTextField({
  bookId,
  initialJson,
  onChange,
  placeholder,
  ariaLabel,
  fill = false,
  disabled = false,
  hoverCard = true,
  matchOnCreate = true
}: EntityShortRichTextFieldProps): ReactElement {
  const hover = useEntityHover()

  // ⚠️ `getBookId` 闭包必须捕获当前 `bookId`；数组经 `useMemo` 恒等，
  // 满足 `useEditor` 的引用比对要求（仅切书 / 改匹配策略时重建）。
  const extensions = useMemo(
    () =>
      bookId === ''
        ? undefined
        : [
            EntityHighlight.configure({
              getBookId: () => bookId,
              matchOnCreate
            })
          ],
    [bookId, matchOnCreate]
  )

  const hoverHandlers = hoverCard
    ? { onMouseOver: hover.onMouseOver, onMouseLeave: hover.onMouseLeave }
    : {}

  const field = (
    <ShortRichTextField
      initialJson={initialJson}
      onChange={onChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      extensions={extensions}
      fill={fill}
      disabled={disabled}
    />
  )

  // 不挂悬停卡时无需外壳：既无事件委托也无 `HoverCard` 挂载点，直接渲染字段本体，
  // 少一层纯传递 DOM；高度由父级 `.wf-field__control` 的纵向 flex 直接传给字段。
  if (!hoverCard) return field

  return (
    <div className="entity-rich-text-shell" {...hoverHandlers}>
      {field}
      <HoverCard
        anchor={hover.anchor}
        onClose={hover.close}
        onPointerEnter={hover.cancelHide}
        onPointerLeave={hover.onMouseLeave}
      />
    </div>
  )
}

export default EntityShortRichTextField

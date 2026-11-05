import { useMemo } from 'react'
import ShortRichTextField from '../../../components/editor/ShortRichTextField'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
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
  /** 无障碍标签。 */
  ariaLabel?: string
  /** 撑满父容器剩余高度（右栏）；弹窗默认按内容高度。 */
  fill?: boolean
  /**
   * 是否启用实体悬停卡（默认 `false`）。
   *
   * 右栏可用；`Modal` 内不启用——弹窗层 `z-index: 1000` 高于悬停卡
   * `--z-hover-card`（970），卡片会被遮罩挡住，故弹窗只保留高亮、不弹卡。
   */
  hoverCard?: boolean
}

/**
 * 伏笔描述字段（右栏表单 / 新建弹窗**共用**，§9）：通用薄壳 `ShortRichTextField`
 * + 域内装配。
 *
 * 装配内容：
 * - `EntityHighlight.configure({ getBookId, matchOnCreate: true })`——与章节 / 剧情 / 设定库
 *   正文同一套自动高亮机制；`getBookId` 闭包捕获当前书，`matchOnCreate` 保证「打开即有
 *   内容」时也补一次整篇匹配（`useEditor` 的 `content` 建 doc 不产生事务）；
 * - 可选实体悬停卡（`useEntityHover` 事件委托 + `HoverCard`），与章节正文同款。
 *
 * 放在伏笔域而非 `components/editor`：`EntityHighlight` 属于 `pages/writer/entities`，
 * 通用层不得反向依赖页面层（见 `useRichTextBodyEditor` 的分层说明）。
 */
export default function ForeshadowDescriptionField({
  bookId,
  initialJson,
  onChange,
  placeholder,
  ariaLabel,
  fill = false,
  hoverCard = false
}: ForeshadowDescriptionFieldProps) {
  const hover = useEntityHover()

  // ⚠️ `getBookId` 闭包必须捕获当前 `bookId`（不得提到模块级常量）；数组经
  // `useMemo([bookId])` 恒等（仅切书重建），满足 `useEditor` 的引用比对要求。
  const extensions = useMemo(
    () => [
      EntityHighlight.configure({
        getBookId: () => bookId,
        matchOnCreate: true
      })
    ],
    [bookId]
  )

  const hoverHandlers = hoverCard
    ? { onMouseOver: hover.onMouseOver, onMouseLeave: hover.onMouseLeave }
    : {}

  return (
    <div className="foreshadow-desc-field" {...hoverHandlers}>
      <ShortRichTextField
        initialJson={initialJson}
        onChange={onChange}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        extensions={extensions}
        fill={fill}
      />
      {hoverCard ? (
        <HoverCard
          anchor={hover.anchor}
          onClose={hover.close}
          onPointerEnter={hover.cancelHide}
          onPointerLeave={hover.onMouseLeave}
        />
      ) : null}
    </div>
  )
}

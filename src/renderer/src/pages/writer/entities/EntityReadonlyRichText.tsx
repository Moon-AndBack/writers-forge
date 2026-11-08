import { useMemo } from 'react'
import type { ReactElement } from 'react'
import ReadonlyRichText from '../../../components/editor/ReadonlyRichText'
import { EntityHighlight } from './entityHighlight'
import { HoverCard } from './HoverCard'
import { useEntityHover } from './useEntityHover'
import '../../../styles/components/entity-rich-text.css'

/**
 * 带实体高亮 / 悬停卡的只读富文本（共享组件，§9）。
 *
 * 与 `ReadonlyRichText` 的关系：内容、空态、排版完全交给通用只读组件，本组件只负责
 * **实体域装配**——按 `bookId` 构造 `EntityHighlight`（只读内容经 `content` 直接建 doc，
 * 故 `matchOnCreate: true` 补一次整篇匹配），并按需挂 `useEntityHover` 事件委托与唯一
 * `HoverCard`。放在 `pages/writer/entities` 而非 `components/editor`：实体扩展属于页面层，
 * 通用层不得反向依赖（见 `useRichTextBodyEditor` 的分层说明）。
 *
 * - `hoverCard=false` 供右栏面板使用：面板根容器已统一挂一个 `HoverCard`，子字段只保留高亮；
 * - `extensions` 只在实例创建时生效：`ReadonlyRichText` 内部以 `json` 为 key 重建，
 *   `bookId` 变化但内容不变时不会重建（调用方可按 `key={bookId}` 强制重挂）。
 */
export interface EntityReadonlyRichTextProps {
  /** 归属书 id；空串 = 不启用实体高亮（仍正常展示正文）。 */
  bookId: string
  /** 整条块级 Tiptap JSON 串（`null` = 空正文）。 */
  json: string | null
  /** 空正文占位文案（i18n，由调用方取）。 */
  emptyText: string
  /** 追加类名（宽度 / 间距等布局差异由调用方覆写）。 */
  className?: string
  /** 是否启用实体高亮与悬停卡（默认 `true`）。 */
  enabled?: boolean
  /** 是否挂载悬停卡（默认 `true`；右栏面板统一委托时传 `false`）。 */
  hoverCard?: boolean
}

export function EntityReadonlyRichText({
  bookId,
  json,
  emptyText,
  className,
  enabled = true,
  hoverCard = true
}: EntityReadonlyRichTextProps): ReactElement {
  const hover = useEntityHover()

  // ⚠️ `getBookId` 闭包必须捕获当前 `bookId`；数组经 `useMemo` 恒等，
  // 满足 `useEditor` 的引用比对要求（仅切书时重建）。
  const extensions = useMemo(
    () =>
      enabled && bookId !== ''
        ? [
            EntityHighlight.configure({
              getBookId: () => bookId,
              matchOnCreate: true
            })
          ]
        : undefined,
    [bookId, enabled]
  )

  const hoverHandlers =
    enabled && hoverCard ? { onMouseOver: hover.onMouseOver, onMouseLeave: hover.onMouseLeave } : {}

  return (
    <div className="entity-rich-text-shell" {...hoverHandlers}>
      <ReadonlyRichText
        json={json}
        emptyText={emptyText}
        className={className}
        extensions={extensions}
      />
      {enabled && hoverCard ? (
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

export default EntityReadonlyRichText

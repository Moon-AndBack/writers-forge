import type { ReactElement } from 'react'

/**
 * 写作页内联 SVG 图标（18/15px，随 currentColor 着色）。
 * 路径逐条对齐 template/index.html 写作视图内的图标：
 * 加号（新建卷 / 新建章节）、卷展开箭头、图片 / 文档（素材卡）。
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

export function PlusIcon({ width = 13 }: { width?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2.4" width={width} height={width} {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function ChevronIcon({
  width = 9,
  className
}: {
  width?: number
  className?: string
}): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      strokeWidth="3.4"
      width={width}
      height={width}
      {...stroke}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function ImageIcon({ width = 34 }: { width?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.6" width={width} height={width} {...stroke}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

export function DocIcon({ width = 34 }: { width?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.6" width={width} height={width} {...stroke}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  )
}

/** 钢笔（重命名）：卷 hover「重命名」。 */
export function PencilIcon({ width = 15 }: { width?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.9" width={width} height={width} {...stroke}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

/** 替换（双向箭头 + 输入）：搜索浮窗「替换」。 */
export function ReplaceIcon({ width = 14 }: { width?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" strokeWidth="1.9" width={width} height={width} {...stroke}>
      <path d="M4 7h13l-3-3M20 17H7l3 3" />
    </svg>
  )
}

/** 特殊卷（书卷 + 星）：侧栏空态占位图标。 */
export function SpecialVolumeIcon({ width = 15 }: { width?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={width}
      height={width}
      aria-hidden="true"
    >
      <path d="M4 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4z" />
      <path d="M4 9h11M4 15h11" />
      <path d="M18 9.5l1.2 2.4 2.6.4-1.9 1.8.45 2.6L18 15.5l-2.35 1.2.45-2.6-1.9-1.8 2.6-.4z" />
    </svg>
  )
}

/** 特殊章（文档 + 星）：卷行 hover「新建特殊章」，与普通「新建章」区分。 */
export function SpecialChapterIcon({ width = 15 }: { width?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={width}
      height={width}
      aria-hidden="true"
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M12 12.2l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 14.3l2-.3z" />
    </svg>
  )
}

/** 拖拽把手（竖向六点）：章行 hover 显示，pointer 拖拽排序（同 pin 段内）。 */
export function GripVerticalIcon({ width = 13 }: { width?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      width={width}
      height={width}
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

/** 置顶（图钉向上）：特殊章 pin='bottom'/null 时显示「置顶」。 */
export function PinTopIcon({ width = 15 }: { width?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={width}
      height={width}
      aria-hidden="true"
    >
      <path d="M12 17V5" />
      <path d="m7 10 5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  )
}

/** 置底（图钉向下）：特殊章 pin='top' 时显示「置底」。 */
export function PinBottomIcon({ width = 15 }: { width?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={width}
      height={width}
      aria-hidden="true"
    >
      <path d="M12 7v12" />
      <path d="m7 14 5 5 5-5" />
      <path d="M5 3h14" />
    </svg>
  )
}

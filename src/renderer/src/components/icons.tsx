import type { ReactElement } from 'react'

/**
 * 共享标题栏操作图标（保存 / 撤销 / 重做 / 搜索 / 回收站，stroke 1.9，随 currentColor 着色）。
 *
 * 归属渲染层共享层 `components/`：原位于 `pages/writer/icons`，因跨页面复用
 * （章节 / 大纲操作组及多处删除按钮）且 `components/` 反向引用 `pages/` 会造成
 * 分层倒挂，故上移至此处。写作页内联图标（加号 / 卷章箭头等）仍留在
 * `pages/writer/icons`。
 */

/** 保存（软盘）：标题栏「保存」。 */
export function SaveIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  )
}

/** 撤销（逆时针箭头）：标题栏「撤销」。 */
export function UndoIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}

/** 重做（顺时针箭头）：标题栏「重做」。 */
export function RedoIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  )
}

/** 搜索（放大镜）：标题栏「搜索」/ 搜索浮窗。 */
export function SearchIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

/** 回收站（垃圾桶）：标题栏「回收站」/ 删除操作。 */
export function TrashIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

/** 加粗（B 字形）：标题栏富文本操作「加粗」。 */
export function BoldIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4h7a4 4 0 0 1 0 8H7z" />
      <path d="M7 12h8a4 4 0 0 1 0 8H7z" />
      <path d="M7 4v16" />
    </svg>
  )
}

/** 斜体（I 字形）：标题栏富文本操作「斜体」。 */
export function ItalicIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 4h-9M14 20H5M15 4L9 20" />
    </svg>
  )
}

/** 下划线（U 加底线）：标题栏富文本操作「下划线」。 */
export function UnderlineIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <path d="M4 20h16" />
    </svg>
  )
}

/** 删除线（S 加横线）：标题栏富文本操作「删除线」。 */
export function StrikeIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <path d="M4 12h16" />
    </svg>
  )
}

/** 高亮（荧光笔）：标题栏富文本操作「高亮」。 */
export function HighlightIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 11-6 6v3h7l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.83 0l-5.17-5.17a2 2 0 0 1 0-2.83L14 4l8 8z" />
    </svg>
  )
}

/** 文字颜色（A 字形）：标题栏富文本操作「文字颜色」（色值由触发器下方色条指示）。 */
export function TextColorIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 17 11 4l6 13" />
      <path d="M7.4 12.6h7.2" />
    </svg>
  )
}

/** 行内代码（尖括号）：标题栏富文本操作「行内代码」。 */
export function CodeIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m8.5 8.5-4 3.5 4 3.5" />
      <path d="m15.5 8.5 4 3.5-4 3.5" />
    </svg>
  )
}

/** 段落格式（H1 字形）：格式分组触发器「段落格式」。 */
export function BlockFormatIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5v14M12 5v14M4 12h8" />
      <path d="M16.5 9.5 19 8v9" />
    </svg>
  )
}

/** 插入（方框加号）：插入分组触发器「插入」。 */
export function InsertIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

/** 链接（链环）：插入分组「链接」。 */
export function LinkIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.5 13.5a4 4 0 0 0 5.66 0l2.34-2.34a4 4 0 0 0-5.66-5.66l-1.34 1.34" />
      <path d="M13.5 10.5a4 4 0 0 0-5.66 0L5.5 12.84a4 4 0 0 0 5.66 5.66l1.34-1.34" />
    </svg>
  )
}

/** 表格（网格）：表格分组触发器「表格」。 */
export function TableIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M3 15h18M9.5 9.5V20M15 9.5V20" />
    </svg>
  )
}

/** 清除格式（A 带斜杠）：标题栏富文本操作「清除格式」。 */
export function RemoveFormatIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20 15 4h2" />
      <path d="M11 4h6" />
      <path d="m7 12h8" />
      <path d="M9 20l8.5-8.5" />
      <path d="M22 22 2 2" />
    </svg>
  )
}

/* ---------- 标题 / 段落分组触发器（R8-B 面板拆分） ---------- */

/** 标题（H 字形）：标题分组触发器「标题」。 */
export function HeadingIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 5v14M13 5v14M5 12h8" />
    </svg>
  )
}

/** 段落（对齐线段组）：段落分组触发器「段落」。 */
export function ParagraphIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h10M4 18h13" />
    </svg>
  )
}

/* ---------- 插入分组：图片 ---------- */

/** 图片（相框 + 山 + 日）：插入分组「插入图片」。 */
export function ImageIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5 3.5 3.5 3-3L20 17" />
    </svg>
  )
}

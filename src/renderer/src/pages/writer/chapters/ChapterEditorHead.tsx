import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import DocMeta from '../../../components/editor/DocMeta'
import DocTitleRow from './DocTitleRow'
import { STATUS_LABELS, type ChapterStatus } from './chapterTree'
import type { UseChapterNameResult } from './useChapterName'

/** 复制全文（两张叠放纸）：描边口径与标题栏操作图标一致（24 视框 / 1.9 / currentColor）。 */
function CopyIcon(): ReactElement {
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
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M15 5H5a2 2 0 0 0-2 2v10" />
    </svg>
  )
}

export interface ChapterEditorHeadProps {
  /** 当前章节 id（null = 无选中；同时作为标题输入的同步 key 与状态按钮禁用依据）。 */
  chapterId: number | null
  /** 章节名编辑状态（`useChapterName`，前段只读 + 名段单输入）。 */
  name: UseChapterNameResult
  /** 已渲染的「最后编辑」文案（空串不渲染）。 */
  lastEdited: string
  /** 当前章节状态（决定状态按钮两态配色）。 */
  chapterStatus: ChapterStatus
  /** 状态按钮点击（两态切换）。 */
  onToggleStatus: () => void
  /** 「复制全文」点击。 */
  onCopyAll: () => void
  /** 「复制全文」禁用（无章节 / 正文加载中；只读定稿仍可复制）。 */
  copyDisabled: boolean
}

/**
 * 章节编辑头：标题行（`DocTitleRow`）+ 右侧「复制全文」按钮 + 元信息行（`DocMeta`）。
 *
 * 位置：按钮放在**标题行右侧**（`.editor-head-title` 内、标题行之后）。DOM 里
 * `.editor-head` 的唯一子 div 是 `.editor-inner`，标题行 `.doc-title-row` 自身 100% 宽、
 * 名段输入 `flex: 1`，按钮紧随其后即落在编辑头最右侧，与 28px 标题同排居中——
 * 这是头部视觉上唯一「右对齐」且与正文标题同层的动作位。
 *
 * 抽成独立文件的原因（AGENTS §3）：`ChaptersView` 已接近 500 行硬上限，编辑头整块
 * 下移可同时容纳复制入口而不越界。
 */
export default function ChapterEditorHead({
  chapterId,
  name,
  lastEdited,
  chapterStatus,
  onToggleStatus,
  onCopyAll,
  copyDisabled
}: ChapterEditorHeadProps) {
  const { t } = useTranslation('chapters')

  return (
    <div className="editor-head">
      <div className="editor-inner">
        <div className="editor-head-title">
          {/* 章节名（v2：前段只读 + 名段单输入，见 DocTitleRow）：
              · 普通章：固定编号前缀「第X章」（span）+ 空隙（容器 gap）+ 可编辑名（input）；
              · 特殊章：前段（创建时已设置，只读 span）+ 空隙 + 名段输入。
              失焦 / Enter 提交落库，Escape 还原；不做按键逐次写库。 */}
          <DocTitleRow chapterId={chapterId} name={name} />
          <IconButton
            className="editor-head-copy"
            size="sm"
            label={t('editor.copyAll')}
            tooltip={t('editor.copyAll')}
            tooltipPlacement="bottom"
            onClick={onCopyAll}
            disabled={copyDisabled}
          >
            <CopyIcon />
          </IconButton>
        </div>
        <DocMeta
          lastEdited={lastEdited}
          status={{
            value: chapterStatus,
            label: t(STATUS_LABELS[chapterStatus]),
            ariaLabel: t('statusToggleAria', { label: t(STATUS_LABELS[chapterStatus]) }),
            disabled: chapterId === null,
            onClick: onToggleStatus
          }}
        />
      </div>
    </div>
  )
}

import type { ReactElement } from 'react'
import { IconButton } from '../ui'
import { RestoreIcon, TrashIcon } from '../icons'

export interface TrashRowActionsProps {
  /** 写操作进行中：禁用全部按钮。 */
  busy: boolean
  /** 还原按钮文案。 */
  restoreLabel: string
  /** 彻底删除按钮文案。 */
  purgeLabel: string
  /** 禁止单独还原（父卷不可用）；aria-label 仍为 `restoreLabel`，tooltip 解释原因。 */
  restoreDisabled?: boolean
  /** 还原禁用原因（仅 `restoreDisabled` 为 true 时作为 tooltip 文案）。 */
  restoreDisabledTooltip?: string
  onRestore: () => void
  onPurge: () => void
  /**
   * 是否自带 `.trash-row-actions` 外壳：平铺行传 true（缺省）；
   * 树形模式传 false，由共享 `TreeRowItem` 统一包外壳，避免嵌套同名容器。
   */
  wrapped?: boolean
}

/**
 * 回收站行尾操作：还原 + 彻底删除（章节 / 大纲 / 伏笔 / 灵感逐字相同）。
 * 点击与键盘事件在外壳层阻断，不触发行选中；树形模式只渲染按钮，
 * 外壳与冒泡阻断交给 `TreeRowItem`。
 */
export function TrashRowActions({
  busy,
  restoreLabel,
  purgeLabel,
  restoreDisabled = false,
  restoreDisabledTooltip,
  onRestore,
  onPurge,
  wrapped = true
}: TrashRowActionsProps): ReactElement {
  const buttons = (
    <>
      {/* 禁用原因需可 hover / focus 展示：还原禁用走 `aria-disabled`（保留 aria-label
          并挂 tooltip），原生 `disabled` 只用于 busy；两者都不改变按钮布局。 */}
      <IconButton
        size="sm"
        className="row-act"
        label={restoreLabel}
        tooltip={restoreDisabled ? restoreDisabledTooltip : undefined}
        tooltipPlacement="top"
        aria-disabled={restoreDisabled || undefined}
        disabled={busy}
        onClick={restoreDisabled ? undefined : onRestore}
      >
        <RestoreIcon />
      </IconButton>
      <IconButton
        size="sm"
        className="row-act"
        tone="danger"
        label={purgeLabel}
        tooltipPlacement="top"
        disabled={busy}
        onClick={onPurge}
      >
        <TrashIcon />
      </IconButton>
    </>
  )

  if (!wrapped) return buttons

  return (
    <span
      className="trash-row-actions"
      // 行本身可点击 / 可按 Enter 选中；操作按钮的点击与键盘事件不得冒泡触发行选中。
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {buttons}
    </span>
  )
}

export default TrashRowActions

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
  onRestore,
  onPurge,
  wrapped = true
}: TrashRowActionsProps): ReactElement {
  const buttons = (
    <>
      <IconButton
        size="sm"
        className="row-act"
        label={restoreLabel}
        tooltipPlacement="top"
        disabled={busy}
        onClick={onRestore}
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

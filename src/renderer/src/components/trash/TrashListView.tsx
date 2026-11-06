/**
 * 回收站列表（章节 / 大纲共用，§9 唯一实现）。
 *
 * 纯展示：不依赖 i18n，文案由调用方经 `t()` 取用后传入（对齐 `EmptyState` 约定）。
 * DOM 结构与 `.trash-*` 类名与改造前的两套视图逐字一致，样式直接复用
 * `styles/writer-trash.css`，无需新增 CSS。
 */
import type { ReactElement, ReactNode } from 'react'
import { Button, IconButton } from '../ui'
import { TrashIcon } from '../icons'
import { RestoreIcon } from '../../pages/writer/icons'

/** 回收站行：`name` 为主名，`sub` 为次要行（如原归属卷名）。 */
export interface TrashRow {
  id: number
  name: string
  sub?: string
}

/** 展示文案（全部由调用方传入已翻译字符串）。 */
export interface TrashListViewMessages {
  title: string
  count: (total: number) => string
  purgeAll: string
  empty: string
  groupVolumes: string
  groupItems: string
  restoreVolume: string
  purgeVolume: string
  restoreItem: string
  purgeItem: string
}

export interface TrashListViewProps {
  /** 软删的卷行（单行展示，无次要行）。 */
  volumes: TrashRow[]
  /** 软删的条目行（主名 + 原归属卷名两行展示）。 */
  items: TrashRow[]
  /** 首帧加载中：抑制空态闪现（等价原 `!loading && total === 0` 口径）。 */
  loading?: boolean
  /** 写操作进行中：禁用全部操作按钮。 */
  busy: boolean
  messages: TrashListViewMessages
  onRestoreVolume(id: number): void
  onPurgeVolume(id: number): void
  onRestoreItem(id: number): void
  onPurgeItem(id: number): void
  onPurgeAll(): void
  /** 附加节点（确认弹窗等），挂在视图末尾。 */
  footer?: ReactNode
}

/** 行尾操作区：还原 + 彻底删除（两套回收站逐字相同）。 */
function RowActions({
  busy,
  restoreLabel,
  purgeLabel,
  onRestore,
  onPurge
}: {
  busy: boolean
  restoreLabel: string
  purgeLabel: string
  onRestore: () => void
  onPurge: () => void
}): ReactElement {
  return (
    <span className="trash-row-actions">
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
    </span>
  )
}

export function TrashListView({
  volumes,
  items,
  loading = false,
  busy,
  messages,
  onRestoreVolume,
  onPurgeVolume,
  onRestoreItem,
  onPurgeItem,
  onPurgeAll,
  footer
}: TrashListViewProps): ReactElement {
  const total = volumes.length + items.length
  const isEmpty = !loading && total === 0

  return (
    <div className="trash-view">
      <div className="trash-head">
        <span className="trash-title">{messages.title}</span>
        <span className="trash-count">{total > 0 ? messages.count(total) : ''}</span>
        <span className="spacer" />
        {total > 0 ? (
          <Button variant="ghost" size="sm" onClick={onPurgeAll} disabled={busy}>
            {messages.purgeAll}
          </Button>
        ) : null}
      </div>

      <div className="trash-scroll">
        <div className="trash-inner">
          {isEmpty ? (
            <div className="trash-empty">{messages.empty}</div>
          ) : (
            <>
              {volumes.length > 0 ? (
                <section className="trash-group">
                  <div className="trash-group-title">{messages.groupVolumes}</div>
                  {volumes.map((volume) => (
                    <div className="trash-row" key={`v-${volume.id}`}>
                      <span className="trash-row-name">{volume.name}</span>
                      <RowActions
                        busy={busy}
                        restoreLabel={messages.restoreVolume}
                        purgeLabel={messages.purgeVolume}
                        onRestore={() => onRestoreVolume(volume.id)}
                        onPurge={() => onPurgeVolume(volume.id)}
                      />
                    </div>
                  ))}
                </section>
              ) : null}

              {items.length > 0 ? (
                <section className="trash-group">
                  <div className="trash-group-title">{messages.groupItems}</div>
                  {items.map((item) => (
                    <div className="trash-row" key={`c-${item.id}`}>
                      <span className="trash-row-main">
                        <span className="trash-row-name">{item.name}</span>
                        <span className="trash-row-sub">{item.sub}</span>
                      </span>
                      <RowActions
                        busy={busy}
                        restoreLabel={messages.restoreItem}
                        purgeLabel={messages.purgeItem}
                        onRestore={() => onRestoreItem(item.id)}
                        onPurge={() => onPurgeItem(item.id)}
                      />
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
      {footer}
    </div>
  )
}

export default TrashListView

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton, useToast } from '../../../components/ui'
import { TrashIcon } from '../../../components/icons'
import { PencilIcon } from '../icons'
import { useConfirm } from '../chapters/useConfirm'
import type { TimelineEntry } from './timelineOrigin'

export interface TimelinePanelProps {
  /** 时间线列表。 */
  timelines: TimelineEntry[]
  /** 当前选中时间线 id。 */
  activeId: string | null
  /** 选中回调。 */
  onSelect: (id: string) => void
  /** 重命名（空名回退默认名；返回是否落库成功）。 */
  onRename: (id: string, name: string) => Promise<boolean>
  /** 删除（至少保留一条；返回是否落库成功）。 */
  onDelete: (id: string) => Promise<boolean>
}

export default function TimelinePanel({
  timelines,
  activeId,
  onSelect,
  onRename,
  onDelete
}: TimelinePanelProps) {
  const { t } = useTranslation('timeline')
  // 行内重命名态：正在改名的条目 id + 草稿名（与章节卷改名同款交互）。
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  // 已结算标记：Enter / Escape 已提交或取消后，避免随后的 blur 再次提交（双写）。
  const renameSettled = useRef(false)
  const confirm = useConfirm()
  const { show: showToast, node: toastNode } = useToast()

  const beginRename = (entry: TimelineEntry): void => {
    setRenamingId(entry.id)
    setDraftName(entry.name)
    renameSettled.current = false
  }

  // 结算重命名：Enter / 失焦提交，Escape 取消；空名由 workspace 回退默认名。
  const settleRename = (entry: TimelineEntry, commit: boolean): void => {
    if (renameSettled.current) return
    renameSettled.current = true
    setRenamingId(null)
    if (!commit) return
    const next = draftName.trim()
    if (next === entry.name) return
    void onRename(entry.id, next).then((ok) => {
      if (!ok) showToast(t('renameFailed'))
    })
  }

  const requestDelete = (entry: TimelineEntry): void => {
    const name = entry.name.trim() !== '' ? entry.name : t('defaultName')
    confirm.request(
      {
        title: t('dialog.delete.title'),
        message: t('dialog.delete.message', { name }),
        confirmText: t('dialog.delete.confirm')
      },
      async () => {
        const ok = await onDelete(entry.id)
        if (!ok) showToast(t('deleteFailed'))
      }
    )
  }

  return (
    <div className="pane-body">
      <div className="pane-scroll">
        {timelines.length === 0 ? (
          <div className="placeholder-view is-compact" role="note">
            <div className="placeholder-title">{t('emptyTitle')}</div>
            <div className="placeholder-desc">{t('emptyDesc')}</div>
          </div>
        ) : (
          <div className="timeline-list pane-region">
            {timelines.map((entry) => {
              const active = entry.id === activeId
              const renaming = renamingId === entry.id
              // 至少保留一条：最后一条的删除按钮禁用（workspace 同规则兜底）。
              const deleteDisabled = timelines.length <= 1
              return (
                <div
                  key={entry.id}
                  className={`timeline-item${active ? ' is-active' : ''}`}
                  onClick={() => {
                    if (renaming) return
                    onSelect(entry.id)
                  }}
                >
                  {renaming ? (
                    <input
                      className="timeline-rename"
                      type="text"
                      value={draftName}
                      autoFocus
                      spellCheck={false}
                      aria-label={t('rename')}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={() => settleRename(entry, true)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          settleRename(entry, true)
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          settleRename(entry, false)
                        }
                      }}
                    />
                  ) : (
                    <span className="timeline-item-name">
                      {entry.name.trim() !== '' ? entry.name : t('defaultName')}
                    </span>
                  )}

                  {/* 行内 hover 操作：重命名（内联编辑）+ 删除（二次确认）。 */}
                  <span
                    className="timeline-item-actions"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <IconButton
                      size="sm"
                      className="row-act"
                      label={t('rename')}
                      tooltipPlacement="top"
                      onClick={() => beginRename(entry)}
                    >
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      size="sm"
                      className="row-act"
                      tone="danger"
                      label={deleteDisabled ? t('deleteLastDisabled') : t('delete')}
                      tooltipPlacement="top"
                      disabled={deleteDisabled}
                      onClick={() => requestDelete(entry)}
                    >
                      <TrashIcon />
                    </IconButton>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {confirm.node}
      {toastNode}
    </div>
  )
}

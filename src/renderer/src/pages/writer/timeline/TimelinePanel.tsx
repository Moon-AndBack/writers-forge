import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/EmptyState'
import { LoadErrorState } from '../../../components/LoadErrorState'
import { IconButton, useToast } from '../../../components/ui'
import { TrashIcon } from '../../../components/icons'
import { PencilIcon } from '../icons'
import { useConfirm } from '@renderer/components/ui/useConfirm'
import type { TimelineEntry } from './timelineOrigin'

export interface TimelinePanelProps {
  /** 时间线列表。 */
  timelines: TimelineEntry[]
  /** 是否仍在首次读取（三态顺序：loading → error → empty）。 */
  loading: boolean
  /** 时间线读取失败（仅在无任何时间线时展示错误态）。 */
  loadError: unknown | null
  /** 重试读取时间线列表。 */
  onRetry: () => void
  /** 当前选中时间线 id。 */
  activeId: string | null
  /** 选中回调。 */
  onSelect: (id: string) => void
  /** 重命名（空名回退默认名；返回是否落库成功）。 */
  onRename: (id: string, name: string) => Promise<boolean>
  /** 删除（至少保留一条且该时间线下无剧情线；返回是否落库成功）。 */
  onDelete: (id: string) => Promise<boolean>
  /** 每条时间线的剧情线条数（`timelineId → count`，无记录视为 0）。 */
  plotLineCounts: ReadonlyMap<string, number>
}

export default function TimelinePanel({
  timelines,
  loading,
  loadError,
  onRetry,
  activeId,
  onSelect,
  onRename,
  onDelete,
  plotLineCounts
}: TimelinePanelProps) {
  const { t } = useTranslation('timeline')
  const { t: tCommon } = useTranslation('common')
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
        {loading ? (
          /* 首读：先于错误 / 空态判定，避免数据未回来时先闪「暂无时间线」。 */
          <div className="rp-list-empty">{tCommon('loading')}</div>
        ) : loadError !== null && timelines.length === 0 ? (
          /* 读取失败且无任何时间线：与真空态区分，给出重试入口。 */
          <LoadErrorState compact onRetry={onRetry} />
        ) : timelines.length === 0 ? (
          <EmptyState compact title={t('emptyTitle')} description={t('emptyDesc')} />
        ) : (
          <div className="timeline-list pane-region">
            {timelines.map((entry) => {
              const active = entry.id === activeId
              const renaming = renamingId === entry.id
              // 删除禁用两式：至少保留一条；该时间线下仍有剧情线（需先删除或迁移，
              // 否则剧情线会因时间线消失而「凭空不见」）。workspace 同规则兜底。
              const plotLineCount = plotLineCounts.get(entry.id) ?? 0
              const deleteDisabled = timelines.length <= 1 || plotLineCount > 0
              let deleteLabel = t('delete')
              if (plotLineCount > 0) {
                deleteLabel = t('deleteBlocked', { count: plotLineCount })
              } else if (deleteDisabled) {
                deleteLabel = t('deleteLastDisabled')
              }
              return (
                <div
                  key={entry.id}
                  className={`timeline-item${active ? ' is-active' : ''}`}
                  role="button"
                  // 重命名时行内有输入框：焦点交给输入框，行本身退出 Tab 序列。
                  tabIndex={renaming ? -1 : 0}
                  aria-pressed={active}
                  aria-label={entry.name.trim() !== '' ? entry.name : t('defaultName')}
                  onClick={() => {
                    if (renaming) return
                    onSelect(entry.id)
                  }}
                  onKeyDown={(event) => {
                    // 只响应行自身聚焦：重命名输入框的空格 / Enter 与行内按钮不触发选中。
                    if (renaming || event.target !== event.currentTarget) return
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
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
                      label={deleteLabel}
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

import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Modal, useToast } from '../../../../components/ui'
import { useConfirm } from '../../chapters/useConfirm'
import type { AiChatSessionRow } from '../../../../../../preload/types/ai'

export interface AiSessionMenuProps {
  /** 当前章的全部会话（最近活跃倒序）。 */
  sessions: AiChatSessionRow[]
  /** 当前选中的会话；null = 新对话草稿。 */
  activeSessionId: number | null
  /** 生成中：禁止切换 / 新建 / 重命名 / 删除，避免打断在途回复。 */
  busy: boolean
  onSelect: (id: number | null) => void
  /** 新建会话：清空当前对话，首次发送时才落库。 */
  onCreate: () => void
  /** 打开会话列表前刷新一次（同步最近活跃排序与新建会话标题）。 */
  onOpen: () => void
  onRename: (id: number, title: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
}

/**
 * AI 面板头部「会话」入口 + 会话管理弹窗。
 *
 * 面板很窄，列表放不进侧栏：头部只保留「当前会话标题 + 新建 + 会话(N)」一行，
 * 点「会话」在 Modal 里列出该章全部会话（切换 / 重命名 / 删除 / 新建）。
 * 删除走通用 `useConfirm` 二次确认；生成中禁止所有会话操作（先停止再切换）。
 */
export function AiSessionMenu({
  sessions,
  activeSessionId,
  busy,
  onSelect,
  onCreate,
  onOpen,
  onRename,
  onDelete
}: AiSessionMenuProps) {
  const { t } = useTranslation('ai')
  const { show: showToast, node: toastNode } = useToast()
  const { request: requestConfirm, node: confirmNode } = useConfirm()

  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState<AiChatSessionRow | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameFailed, setRenameFailed] = useState(false)

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null
  const titleOf = (session: AiChatSessionRow): string =>
    session.title.trim() !== '' ? session.title : t('panel.sessions.untitled', { id: session.id })
  const currentTitle = activeSession !== null ? titleOf(activeSession) : t('panel.sessions.draft')

  const handleSelect = (id: number): void => {
    setOpen(false)
    onSelect(id)
  }

  const handleCreate = (): void => {
    setOpen(false)
    onCreate()
  }

  const beginRename = (session: AiChatSessionRow): void => {
    setRenameValue(session.title)
    setRenameFailed(false)
    setRenaming(session)
  }

  const closeRename = (): void => {
    if (!renameBusy) setRenaming(null)
  }

  const submitRename = async (): Promise<void> => {
    if (renaming === null || renameBusy) return
    const title = renameValue.trim()
    if (title === '') return

    setRenameBusy(true)
    setRenameFailed(false)
    try {
      const ok = await onRename(renaming.id, title)
      if (ok) setRenaming(null)
      else setRenameFailed(true)
    } finally {
      setRenameBusy(false)
    }
  }

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submitRename()
  }

  const askDelete = (session: AiChatSessionRow): void => {
    requestConfirm(
      {
        title: t('panel.sessions.deleteTitle'),
        message: t('panel.sessions.deleteConfirm', { title: titleOf(session) }),
        confirmText: t('panel.sessions.delete')
      },
      async () => {
        const ok = await onDelete(session.id)
        if (!ok) showToast(t('panel.sessions.deleteFailed'))
        else if (renaming?.id === session.id) setRenaming(null)
      }
    )
  }

  return (
    <>
      <div className="ai-panel__sessionbar">
        <div className="ai-panel__session-now" title={currentTitle}>
          <span className="ai-panel__session-label">{t('panel.sessions.current')}</span>
          <span className="ai-panel__session-name">{currentTitle}</span>
        </div>
        <div className="ai-panel__session-actions">
          <Button size="sm" variant="ghost" disabled={busy} onClick={handleCreate}>
            {t('panel.sessions.new')}
          </Button>
          <Button
            size="sm"
            aria-haspopup="dialog"
            onClick={() => {
              setOpen(true)
              onOpen()
            }}
          >
            {t('panel.sessions.openCount', { count: sessions.length })}
          </Button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('panel.sessions.title')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('panel.sessions.close')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={handleCreate}>
              {t('panel.sessions.new')}
            </Button>
          </>
        }
      >
        {sessions.length === 0 ? (
          <div className="rp-list-empty">{t('panel.sessions.empty')}</div>
        ) : (
          <div className="ai-sessions">
            {sessions.map((session) => {
              const active = session.id === activeSessionId
              return (
                <div
                  key={session.id}
                  className={active ? 'ai-sessions__row is-active' : 'ai-sessions__row'}
                >
                  <button
                    type="button"
                    className="ai-sessions__main"
                    disabled={busy}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => handleSelect(session.id)}
                  >
                    <span className="ai-sessions__name">{titleOf(session)}</span>
                    <span className="ai-sessions__time">
                      {formatSessionTime(session.updatedAt)}
                    </span>
                  </button>
                  <div className="ai-sessions__row-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => beginRename(session)}
                    >
                      {t('panel.sessions.rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => askDelete(session)}
                    >
                      {t('panel.sessions.delete')}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {busy ? <div className="ai-panel__hint">{t('panel.sessions.busyHint')}</div> : null}
      </Modal>

      <Modal
        open={renaming !== null}
        onClose={closeRename}
        title={t('panel.sessions.renameTitle')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={renameBusy} onClick={closeRename}>
              {t('panel.sessions.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={renameBusy}
              disabled={renameValue.trim() === ''}
              onClick={() => void submitRename()}
            >
              {t('panel.sessions.save')}
            </Button>
          </>
        }
      >
        <label className="ai-sessions__rename">
          <span>{t('panel.sessions.renameLabel')}</span>
          <Input
            size="sm"
            value={renameValue}
            maxLength={200}
            autoFocus
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={handleRenameKeyDown}
          />
        </label>
        {renameFailed ? (
          <div className="ai-panel__error" role="alert">
            {t('panel.sessions.renameFailed')}
          </div>
        ) : null}
      </Modal>

      {confirmNode}
      {toastNode}
    </>
  )
}

/** 会话更新时间：本地时区 MM-DD HH:mm（与界面语言无关的紧凑格式）。 */
function formatSessionTime(value: string): string {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default AiSessionMenu

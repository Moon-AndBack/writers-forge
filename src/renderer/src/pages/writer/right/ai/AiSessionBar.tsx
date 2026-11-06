import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dropdown,
  IconButton,
  Input,
  Modal,
  Select,
  useToast
} from '../../../../components/ui'
import type { DropdownItem } from '../../../../components/ui'
import { useConfirm } from '../../chapters/useConfirm'
import type { AiChatSessionRow } from '../../../../../../preload/types/ai'

export interface AiSessionBarProps {
  /** 当前书的全部会话（最近活跃倒序）。 */
  sessions: AiChatSessionRow[]
  /** 当前选中的会话；null = 新对话草稿。 */
  activeSessionId: number | null
  /** 生成中：禁止切换 / 新建 / 重命名 / 删除，避免打断在途回复。 */
  busy: boolean
  onSelect: (id: number | null) => void
  /** 新建会话：清空当前对话，首次发送时才落库。 */
  onCreate: () => void
  onRename: (id: number, title: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
}

/** `Select` 里代表「未落库草稿」的哨兵值（真实会话 id 均为正整数）。 */
const DRAFT_VALUE = 'draft'

/**
 * AI 面板头部会话栏：一行承载三个控件。
 *
 * `[ Select 当前会话 ▼ ] [ ⋯ 操作 ] [ + 新建 ]`
 * - `Select`：直接下拉切换会话，标签只显示会话名（空标题回落「会话 N」，不加时间后缀）；
 * - `⋯`：重命名 / 删除当前会话（草稿态或生成中禁用）；
 * - `+`：进入新对话草稿，首次发送时才落库。
 *
 * 整行铺 `--soft-solid` 软底 + `--line` 内描边，并挂 `.on-soft` 让 `Select`
 * 触发器换用 `--control-on-soft`（与软底分层）。会话列表只在面板激活 / 新建 /
 * 改名 / 删除 / 自动命名后刷新——`Select` 无 `onOpen` 回调，不做 pointerdown hack。
 * 删除仍走通用 `useConfirm` 二次确认；生成中所有会话操作禁用（先停止再切换）。
 */
export function AiSessionBar({
  sessions,
  activeSessionId,
  busy,
  onSelect,
  onCreate,
  onRename,
  onDelete
}: AiSessionBarProps) {
  const { t } = useTranslation('ai')
  const { show: showToast, node: toastNode } = useToast()
  const { request: requestConfirm, node: confirmNode } = useConfirm()

  const [renaming, setRenaming] = useState<AiChatSessionRow | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameFailed, setRenameFailed] = useState(false)

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null
  const titleOf = (session: AiChatSessionRow): string =>
    session.title.trim() !== '' ? session.title : t('panel.sessions.untitled', { id: session.id })
  const currentTitle =
    activeSession !== null
      ? titleOf(activeSession)
      : activeSessionId === null
        ? t('panel.sessions.draft')
        : t('panel.sessions.untitled', { id: activeSessionId })

  /** Select 值：草稿态用哨兵值，其余用会话 id 字符串。 */
  const selectValue = activeSessionId === null ? DRAFT_VALUE : String(activeSessionId)
  const selectOptions = [
    ...(activeSessionId === null ? [{ value: DRAFT_VALUE, label: t('panel.sessions.draft') }] : []),
    ...sessions.map((session) => ({ value: String(session.id), label: titleOf(session) }))
  ]

  const handleSelectChange = (next: string): void => {
    if (next === DRAFT_VALUE) {
      onSelect(null)
      return
    }
    const id = Number(next)
    if (Number.isSafeInteger(id) && id > 0) onSelect(id)
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

  // 草稿态没有「当前会话」可操作；生成中一律禁用（先停止再管理）。
  const menuDisabled = busy || activeSession === null
  const menuItems: DropdownItem[] = [
    {
      key: 'rename',
      label: t('panel.sessions.rename'),
      disabled: menuDisabled,
      onSelect: () => {
        if (activeSession !== null) beginRename(activeSession)
      }
    },
    {
      key: 'delete',
      label: t('panel.sessions.delete'),
      disabled: menuDisabled,
      onSelect: () => {
        if (activeSession !== null) askDelete(activeSession)
      }
    }
  ]

  return (
    <>
      <div className="ai-panel__sessionbar on-soft">
        <Select
          className="ai-panel__session-select"
          size="sm"
          value={selectValue}
          options={selectOptions}
          placeholder={currentTitle}
          ariaLabel={t('panel.sessions.selectAria')}
          disabled={busy}
          onChange={handleSelectChange}
        />

        <Dropdown
          align="end"
          items={menuItems}
          disabled={menuDisabled}
          trigger={
            <IconButton size="sm" label={t('panel.sessions.actions')} disabled={menuDisabled}>
              <MoreIcon />
            </IconButton>
          }
        />

        <Button
          className="ai-panel__session-new"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onCreate}
        >
          <PlusIcon />
          {t('panel.sessions.new')}
        </Button>
      </div>

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
        <label className="ai-panel__session-rename">
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

/** 会话操作入口图标（横三点）。 */
function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 新建会话图标（加号）。 */
function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export default AiSessionBar

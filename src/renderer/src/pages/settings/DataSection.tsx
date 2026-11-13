import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, IconButton, Tag } from '../../components/ui'
import { EmptyState } from '../../components/EmptyState'
import { LoadErrorState } from '../../components/LoadErrorState'
import { PencilIcon, RestoreIcon, TrashIcon } from '../../components/icons'
import { formatBytes } from '../../lib/formatBytes'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'
import { BACKUP_ERROR_KEYS, useLocalBackup } from './useLocalBackup'
import '../../styles/components/local-backup.css'

/**
 * 通用设置 · 数据与备份。
 *
 * 自上而下：立即备份 → 备份列表（三态：loading → error → empty → content）
 * → 导出整库 `.db` → 数据目录（打开备份文件夹）。列表行显示名称（未命名时
 * 回退格式化时间）/ 时间 / 大小 / 类型，并提供铅笔重命名、恢复、删除三个
 * 行内操作。恢复成功后由主进程自动重启，界面保持禁用并提示。
 */
export default function DataSection() {
  const { t, i18n } = useTranslation('settings')
  const backup = useLocalBackup()

  // 行内重命名态：正在改名的备份文件夹 + 草稿名。
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  // Enter / Escape 已结算后，避免随后的 blur 再次提交（双写）。
  const renameSettled = useRef(true)

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    [i18n.language]
  )

  const busy = backup.busy !== 'none'

  const beginRename = (folder: string, name: string): void => {
    renameSettled.current = false
    setRenamingFolder(folder)
    setDraftName(name)
  }

  const settleRename = (folder: string, originalName: string, commit: boolean): void => {
    if (renameSettled.current) return
    renameSettled.current = true
    setRenamingFolder(null)
    if (!commit) return

    const next = draftName.trim()
    if (next === originalName) return
    void backup.actions.rename(folder, next)
  }

  return (
    <SectionCard title={t('data.title')} description={t('data.description')}>
      <SettingRow label={t('data.create.label')} description={t('data.create.description')}>
        <Button
          variant="primary"
          loading={backup.busy === 'creating'}
          disabled={busy}
          onClick={backup.actions.create}
        >
          {t('data.create.action')}
        </Button>
      </SettingRow>

      <div className="settings-backup" aria-busy={busy}>
        <div className="settings-backup__head">
          <span className="settings-backup__title">{t('data.backups.title')}</span>
          {backup.status === 'ready' && backup.items.length > 0 ? (
            <span className="settings-backup__count">
              {t('data.backups.count', { count: backup.items.length })}
            </span>
          ) : null}
        </div>

        {backup.status === 'loading' ? (
          <p className="settings-backup__status" role="status">
            {t('data.backups.loading')}
          </p>
        ) : null}

        {backup.status === 'error' ? (
          <LoadErrorState compact onRetry={backup.actions.refresh} />
        ) : null}

        {backup.status === 'ready' && backup.items.length === 0 ? (
          <EmptyState compact title={t('data.backups.empty')} />
        ) : null}

        {backup.status === 'ready' && backup.items.length > 0 ? (
          <ul className="settings-backup__list">
            {backup.items.map((item) => {
              const date = new Date(item.createdAt)
              const timestamp = Number.isNaN(date.getTime())
                ? item.folder
                : dateFormatter.format(date)
              const label = item.name.trim() !== '' ? item.name : timestamp
              const renaming = renamingFolder === item.folder
              const kindLabel =
                item.kind === 'pre-restore'
                  ? t('data.backups.kindPreRestore')
                  : t('data.backups.kindManual')

              return (
                <li className="settings-backup__row" key={item.folder}>
                  <div
                    className={
                      renaming
                        ? 'settings-backup__main settings-backup__main--renaming'
                        : 'settings-backup__main'
                    }
                  >
                    {renaming ? (
                      <input
                        className="settings-backup__rename"
                        type="text"
                        value={draftName}
                        autoFocus
                        spellCheck={false}
                        placeholder={t('data.backups.renamePlaceholder')}
                        aria-label={t('data.backups.renamePlaceholder')}
                        onChange={(event) => setDraftName(event.target.value)}
                        onBlur={() => settleRename(item.folder, item.name, true)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            if (event.nativeEvent.isComposing) return
                            event.preventDefault()
                            settleRename(item.folder, item.name, true)
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            settleRename(item.folder, item.name, false)
                          }
                        }}
                      />
                    ) : (
                      <span className="settings-backup__name" title={label}>
                        {label}
                      </span>
                    )}
                    <span className="settings-backup__meta">
                      {item.name.trim() !== '' ? (
                        <>
                          <span className="settings-backup__time">{timestamp}</span>
                          <span className="settings-backup__sep" aria-hidden="true">
                            ·
                          </span>
                        </>
                      ) : null}
                      <span className="settings-backup__size">{formatBytes(item.size)}</span>
                      <span className="settings-backup__sep" aria-hidden="true">
                        ·
                      </span>
                      <Tag tone={item.kind === 'pre-restore' ? 'warn' : 'neutral'}>{kindLabel}</Tag>
                    </span>
                  </div>
                  {renaming ? null : (
                    <div className="settings-backup__actions">
                      <IconButton
                        className="settings-backup__action row-act"
                        label={t('data.backups.renameAria', { name: label })}
                        disabled={busy}
                        onClick={() => beginRename(item.folder, item.name)}
                      >
                        <PencilIcon width={14} />
                      </IconButton>
                      <IconButton
                        className="settings-backup__action row-act"
                        tone="danger"
                        label={t('data.backups.restoreAria', { name: label })}
                        disabled={busy}
                        onClick={() => backup.actions.restore(item.folder, label)}
                      >
                        <RestoreIcon />
                      </IconButton>
                      <IconButton
                        className="settings-backup__action row-act"
                        tone="danger"
                        label={t('data.backups.deleteAria', { name: label })}
                        disabled={busy}
                        onClick={() => backup.actions.remove(item.folder, label)}
                      >
                        <TrashIcon />
                      </IconButton>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="settings-backup__footer">
          <Button variant="ghost" size="sm" disabled={busy} onClick={backup.actions.restoreFile}>
            {t('data.backups.restoreFile')}
          </Button>
          <span className="settings-backup__hint">{t('data.backups.restoreFileHint')}</span>
        </div>

        {backup.restarting ? (
          <p className="settings-backup__restarting" role="status" aria-live="assertive">
            {t('data.restore.restarting')}
          </p>
        ) : null}

        {backup.errorCode !== null && backup.status === 'ready' ? (
          <p className="settings-backup__error" role="alert">
            {t(BACKUP_ERROR_KEYS[backup.errorCode])}
          </p>
        ) : null}
      </div>

      <SettingRow label={t('data.export.label')} description={t('data.export.description')}>
        <Button
          variant="secondary"
          className="wf-btn--on-soft"
          loading={backup.busy === 'exporting'}
          disabled={busy}
          onClick={backup.actions.exportDb}
        >
          {t('data.export.action')}
        </Button>
      </SettingRow>

      <SettingRow label={t('data.location.label')} description={t('data.location.description')}>
        <Button
          variant="secondary"
          className="wf-btn--on-soft"
          disabled={busy}
          onClick={backup.actions.openFolder}
        >
          {t('data.location.action')}
        </Button>
      </SettingRow>

      {backup.confirmNode}
      {backup.toastNode}
    </SectionCard>
  )
}

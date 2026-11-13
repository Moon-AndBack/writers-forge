/**
 * 设置页 · OneDrive「云端备份」区块。
 *
 * 只负责渲染与事件绑定，状态全部来自 `useOneDriveBackup`：
 * - 三态顺序严格为 loading → error → empty → content；
 * - 列表行显示文件名 / 修改时间 / 大小，行操作 22×22 悬浮浮现；
 * - 恢复中显示进度与取消，成功后显示「正在恢复并重启…」并保持禁用。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, IconButton, Progress } from '../../components/ui'
import { EmptyState } from '../../components/EmptyState'
import { LoadErrorState } from '../../components/LoadErrorState'
import { RestoreIcon } from '../../components/icons'
import { formatBytes } from '../../lib/formatBytes'
import { ERROR_KEYS } from './onedriveSectionSupport'
import type { OneDriveBackupController } from './useOneDriveBackup'
import { BACKUP_ERROR_KEYS } from './useLocalBackup'

export interface OneDriveRemoteBackupsProps {
  od: OneDriveBackupController
}

export default function OneDriveRemoteBackups({ od }: OneDriveRemoteBackupsProps) {
  const { t, i18n } = useTranslation('onedrive')
  const { t: tSettings } = useTranslation('settings')

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
    [i18n.language]
  )

  const busy = od.restoreRunning || od.backupRunning
  const loading = od.remoteStatus === 'idle' || od.remoteStatus === 'loading'

  return (
    <div className="od-remote" aria-busy={busy}>
      <div className="od-remote__head">
        <span className="od-remote__title">{t('remote.title')}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={od.restoreRunning || od.remoteStatus === 'loading'}
          onClick={od.actions.refreshRemote}
        >
          {t('remote.refresh')}
        </Button>
      </div>

      {loading ? (
        <p className="od-remote__status" role="status">
          {t('remote.loading')}
        </p>
      ) : null}

      {od.remoteStatus === 'error' ? (
        <>
          <LoadErrorState compact onRetry={od.actions.refreshRemote} />
          {od.remoteErrorCode !== null ? (
            <p className="od-alert od-alert--error" role="alert">
              {t(ERROR_KEYS[od.remoteErrorCode])}
            </p>
          ) : null}
        </>
      ) : null}

      {od.remoteStatus === 'ready' && od.remoteItems.length === 0 ? (
        <EmptyState compact title={t('remote.empty')} />
      ) : null}

      {od.remoteStatus === 'ready' && od.remoteItems.length > 0 ? (
        <ul className="od-remote__list">
          {od.remoteItems.map((item) => {
            const date = new Date(item.modifiedAt)
            const timestamp = Number.isNaN(date.getTime()) ? item.name : dateFormatter.format(date)

            return (
              <li className="od-remote__row" key={item.itemId}>
                <div className="od-remote__main">
                  <span className="od-remote__name" title={item.name}>
                    {item.name}
                  </span>
                  <span className="od-remote__meta">
                    <span className="od-remote__time">{timestamp}</span>
                    <span className="od-remote__sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="od-remote__size">{formatBytes(item.sizeBytes)}</span>
                  </span>
                </div>
                <div className="od-remote__actions">
                  <IconButton
                    className="row-act"
                    label={t('remote.restoreAria', { name: item.name })}
                    disabled={busy}
                    onClick={() => od.actions.restoreRemote(item.itemId)}
                  >
                    <RestoreIcon />
                  </IconButton>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {od.remoteStatus === 'ready' && od.remoteErrorCode !== null ? (
        <p className="od-alert od-alert--error" role="alert">
          {t(ERROR_KEYS[od.remoteErrorCode])}
        </p>
      ) : null}

      {od.restoreProgress !== null ? (
        <div className="od-progress" aria-live="polite">
          <div className="od-progress__head">
            <span className="od-progress__phase">
              {od.restoreProgress.phase === 'done'
                ? t('remote.restarting')
                : od.restoreProgress.phase === 'restore'
                  ? t('remote.phase.restore', { percent: od.restoreProgress.percent })
                  : t('remote.phase.download', { percent: od.restoreProgress.percent })}
            </span>
            {od.restoreProgress.phase !== 'done' ? (
              <span className="od-progress__bytes">
                {t('backup.bytes', {
                  sent: formatBytes(od.restoreProgress.bytesReceived),
                  total: formatBytes(od.restoreProgress.totalBytes)
                })}
              </span>
            ) : null}
          </div>
          <Progress
            value={od.restoreProgress.percent}
            tone={od.restoreProgress.phase === 'done' ? 'ok' : 'brand'}
            label={t('remote.progressLabel')}
          />
          {od.restoreProgress.phase !== 'done' ? (
            <div className="od-remote__progress-actions">
              <Button variant="danger" onClick={od.actions.cancelRestore}>
                {t('remote.cancel')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {od.restoreFailure !== null ? (
        <p className="od-alert od-alert--error" role="alert">
          {od.restoreFailure.source === 'onedrive'
            ? t(ERROR_KEYS[od.restoreFailure.code])
            : od.restoreFailure.source === 'backup'
              ? tSettings(BACKUP_ERROR_KEYS[od.restoreFailure.code])
              : t('remote.failed')}
        </p>
      ) : null}

      {od.restoreCancelled ? (
        <p className="od-alert" role="status">
          {t('remote.cancelled')}
        </p>
      ) : null}
    </div>
  )
}

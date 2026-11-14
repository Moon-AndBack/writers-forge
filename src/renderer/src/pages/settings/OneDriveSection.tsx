/**
 * 设置页 · OneDrive 云备份分区。
 *
 * 交互：
 * - 账号状态：未登录 / 已登录（显示名称或邮箱）/ 安全存储不可用时禁用登录并说明；
 * - 登录：`signIn` 等待中展示「取消登录」（`cancelSignIn`）；
 * - 退出登录：`useConfirm` 二次确认后 `signOut`；
 * - 手动备份：`backup`，进行中展示 `Progress` + 阶段文案 + 「取消备份」；
 * - 结果：成功 toast（文件名 + 大小），失败按 `code` 映射行内中文文案。
 *
 * 状态与 IPC 调用集中在 `useOneDriveBackup`，本文件只负责渲染与事件绑定。
 */
import { useId } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Progress, Select } from '../../components/ui'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'
import { settingRowDescriptionId } from './settingRowIds'
import {
  CLOUD_BACKUP_PROVIDER_DEFAULT,
  CLOUD_BACKUP_PROVIDER_SETTING_KEY,
  decodeCloudBackupProvider,
  type CloudBackupProviderId
} from './cloudBackupProvider'
import { useSettingsValue } from './useSettingsValue'
import { ERROR_KEYS, NOTICE_KEYS, PHASE_KEYS, formatBytes } from './onedriveSectionSupport'
import { useOneDriveBackup } from './useOneDriveBackup'
import OneDriveRemoteBackups from './OneDriveRemoteBackups'
import '../../styles/components/onedrive-backup.css'

export default function OneDriveSection() {
  const { t } = useTranslation('onedrive')
  const od = useOneDriveBackup()
  const provider = useSettingsValue(
    CLOUD_BACKUP_PROVIDER_SETTING_KEY,
    CLOUD_BACKUP_PROVIDER_DEFAULT,
    decodeCloudBackupProvider
  )
  const providerId = useId()

  const signedIn = od.status?.signedIn === true
  const encryptionBlocked = od.status !== null && !od.status.encryptionAvailable
  const account = od.status?.account ?? null
  const accountName = account === null ? '' : account.displayName || account.email
  const hasDisplayName = account?.displayName !== undefined && account.displayName !== ''

  return (
    <SectionCard>
      <SettingRow
        controlId={providerId}
        label={t('provider.label')}
        description={t('provider.description')}
      >
        <Select
          id={providerId}
          ariaDescribedBy={settingRowDescriptionId(providerId)}
          className="settings-control settings-control--select"
          value={provider.value}
          options={[
            {
              value: CLOUD_BACKUP_PROVIDER_DEFAULT,
              label: t('provider.oneDrive')
            }
          ]}
          ariaLabel={t('provider.label')}
          onChange={(value) => provider.setValue(decodeCloudBackupProvider(value))}
        />
      </SettingRow>

      {renderProviderContent(provider.value, () => (
        <>
          <SettingRow
            label={t('account.label')}
            description={
              <>
                {od.loading ? <span className="od-account">{t('account.loading')}</span> : null}
                {!od.loading && signedIn ? (
                  <span className="od-account">
                    <span className="od-dot od-dot--ok" aria-hidden="true" />
                    {t('account.signedInAs', { name: accountName || t('account.unknownName') })}
                  </span>
                ) : null}
                {!od.loading && !signedIn ? (
                  <span className="od-account">
                    <span className="od-dot" aria-hidden="true" />
                    {t('account.signedOut')}
                  </span>
                ) : null}
                {signedIn && hasDisplayName && account !== null ? (
                  <span className="od-account__email">{account.email}</span>
                ) : null}
                {od.signingIn ? <span className="od-note">{t('account.signingIn')}</span> : null}
                {encryptionBlocked ? (
                  <span className="od-note od-note--warn" role="alert">
                    {t('account.encryptionUnavailable')}
                  </span>
                ) : null}
              </>
            }
          >
            <div className="od-actions">
              {signedIn ? (
                <Button
                  variant="secondary"
                  className="wf-btn--on-soft"
                  disabled={od.restoreRunning}
                  onClick={od.handleSignOut}
                >
                  {t('account.signOut')}
                </Button>
              ) : od.signingIn ? (
                <>
                  <Button variant="primary" loading>
                    {t('account.signIn')}
                  </Button>
                  <Button variant="ghost" onClick={od.handleCancelSignIn}>
                    {t('account.cancelSignIn')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  disabled={encryptionBlocked || od.loading || od.unsupported || od.status === null}
                  onClick={od.handleSignIn}
                >
                  {t('account.signIn')}
                </Button>
              )}
            </div>
          </SettingRow>

          <SettingRow label={t('backup.label')} description={t('backup.description')}>
            <div className="od-actions">
              {od.backupRunning ? (
                <Button variant="danger" onClick={od.handleCancelBackup}>
                  {t('backup.cancel')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={
                    !signedIn ||
                    encryptionBlocked ||
                    od.signingIn ||
                    od.loading ||
                    od.restoreRunning
                  }
                  onClick={od.handleBackup}
                >
                  {t('backup.action')}
                </Button>
              )}
            </div>
          </SettingRow>

          {od.progress !== null ? (
            <div className="od-progress" aria-live="polite">
              <div className="od-progress__head">
                <span className="od-progress__phase">
                  {t(PHASE_KEYS[od.progress.phase], { percent: od.progress.percent })}
                </span>
                {od.progress.totalBytes > 0 ? (
                  <span className="od-progress__bytes">
                    {t('backup.bytes', {
                      sent: formatBytes(od.progress.bytesSent),
                      total: formatBytes(od.progress.totalBytes)
                    })}
                  </span>
                ) : null}
              </div>
              <Progress
                value={od.progress.percent}
                tone={od.progress.phase === 'done' ? 'ok' : 'brand'}
                label={t('backup.progressLabel')}
              />
            </div>
          ) : null}

          {od.errorCode !== null ? (
            <p className="od-alert od-alert--error" role="alert">
              {t(ERROR_KEYS[od.errorCode])}
            </p>
          ) : null}
          {od.notice !== null ? (
            <p className="od-alert" role="status">
              {t(NOTICE_KEYS[od.notice])}
            </p>
          ) : null}
          {od.unsupported ? (
            <p className="od-alert od-alert--error" role="alert">
              {t('unsupported')}
            </p>
          ) : null}

          {signedIn ? <OneDriveRemoteBackups od={od} /> : null}

          {od.confirmNode}
          {od.toastNode}
        </>
      ))}
    </SectionCard>
  )
}

/** 选择值驱动服务商内容分支；当前注册表只有真实接入的 OneDrive。 */
function renderProviderContent(
  provider: CloudBackupProviderId,
  renderOneDrive: () => ReactNode
): ReactNode {
  switch (provider) {
    case 'onedrive':
      return renderOneDrive()
  }
}

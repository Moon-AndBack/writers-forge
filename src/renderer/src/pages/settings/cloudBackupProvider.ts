/** 当前已接入的云备份服务商；新 id 只有在真实链路接入后才能加入。 */
export type CloudBackupProviderId = 'onedrive'

export const CLOUD_BACKUP_PROVIDER_SETTING_KEY = 'cloudBackupProvider'
export const CLOUD_BACKUP_PROVIDER_DEFAULT: CloudBackupProviderId = 'onedrive'

/** 未知、空或缺省值安全回落到当前唯一可用服务商。 */
export function decodeCloudBackupProvider(raw: string | null): CloudBackupProviderId {
  return raw === 'onedrive' ? raw : CLOUD_BACKUP_PROVIDER_DEFAULT
}

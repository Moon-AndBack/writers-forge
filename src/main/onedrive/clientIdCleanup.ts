import { deleteSetting, getSetting, setSetting } from '../database/settings'
import { logger } from '../logger'
import { clearStoredCredentials } from './credentials'
import { safeError } from './logSafe'

/**
 * 一次性清理旧版「自定义 clientId」配置。
 *
 * 自定义应用 ID 功能已下线，所有用户统一使用内置应用注册。旧配置若继续存在，
 * 其 refresh token 与内置 clientId 不匹配，首次刷新会 `invalid_grant`；同时自定义
 * Azure 应用未必登记回环回调，重新登录会报 `redirect_uri` 不匹配。因此在启动时：
 *
 * 1. 读 `onedrive:clientId`；存在非空值 → `clearStoredCredentials()`；
 * 2. 删除该键；
 * 3. 写守卫键 `onedrive:clientIdCleanup:v1`，后续启动直接跳过。
 *
 * 失败只记日志、不阻断启动；守卫键放在成功路径末尾，中途崩溃会在下次启动重试。
 * 注意：本模块只依赖 `database/settings` 且被 `main/index.ts` 在 `getDb()` 之后调用，
 * 不与 `database/index.ts` 形成循环依赖。
 */

/** 已下线的自定义 clientId settings 键（仅用于清理历史数据）。 */
const LEGACY_CLIENT_ID_KEY = 'onedrive:clientId'

/** 清理完成标记。 */
const CLEANUP_GUARD_KEY = 'onedrive:clientIdCleanup:v1'

const log = logger.scope('onedrive:cleanup')

/** 执行一次性清理（幂等）。 */
export function cleanupLegacyOneDriveClientId(): void {
  try {
    if (getSetting(CLEANUP_GUARD_KEY) !== null) return

    const legacyClientId = getSetting(LEGACY_CLIENT_ID_KEY)
    const hadCustomClientId = legacyClientId !== null && legacyClientId.trim() !== ''
    if (legacyClientId !== null) {
      if (hadCustomClientId) {
        clearStoredCredentials()
        log.info('检测到旧自定义 clientId，已清除凭据（需用内置应用重新登录）')
      }
      deleteSetting(LEGACY_CLIENT_ID_KEY)
    }

    setSetting(CLEANUP_GUARD_KEY, '1')
    log.info('旧 OneDrive clientId 清理完成', { hadCustomClientId })
  } catch (error) {
    log.warn('旧 OneDrive clientId 清理失败（不阻断启动）', { error: safeError(error) })
  }
}

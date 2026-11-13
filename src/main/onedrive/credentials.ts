import { app, safeStorage } from 'electron'
import { deleteSetting, getSetting, setSetting } from '../database/settings'
import { logger } from '../logger'
import { isRecord, readNumber, readString } from './http'
import { maskEmail } from './logSafe'
import { OneDriveError } from './types'
import type { OneDriveAccount, OneDriveAuthStatus, OneDriveCredentials } from './types'

/**
 * OneDrive 凭据读写与加密存储。
 *
 * settings 键约定：
 * - `onedrive:credentials:v1` safeStorage 加密后的 base64 密文（含 token / 过期时间 / 账户）；
 * - `onedrive:account`        明文邮箱，仅用于界面展示（避免每次解密）。
 *
 * 安全边界：`safeStorage` 不可用时**拒绝写入**、读取时报
 * `encryption_unavailable`，绝不降级为明文落盘。
 */

const log = logger.scope('onedrive:credentials')

/** OneDrive 相关 settings 键（集中定义便于后续迁移）。 */
export const ONEDRIVE_SETTING_KEYS = {
  credentials: 'onedrive:credentials:v1',
  account: 'onedrive:account'
} as const

/**
 * 内置 clientId（Azure 应用注册「应用程序(client) ID」）。
 *
 * 为公共客户端，非密钥，可随安装包分发；所有用户统一使用该应用注册。
 */
export const DEFAULT_ONEDRIVE_CLIENT_ID = '7f05c33b-794a-4b69-b641-de33e14b7cb0'

/**
 * 当前环境是否支持 `safeStorage` 加密。
 *
 * 时序约束：`safeStorage` 只能在 `app.whenReady()` 之后使用，因此每次调用都
 * 延迟判断（模块顶层不触碰 `safeStorage`），并显式检查 `app.isReady()`。
 *
 * Linux 例外：`safeStorage` 可能退化为 `basic_text` 后端（仅 base64 混淆，
 * 等同明文），此时 `isEncryptionAvailable()` 仍返回 true。必须显式识别并
 * 按「不可用」处理，否则凭据会以可逆伪密文落盘。其它平台不受影响。
 */
export function isCredentialEncryptionAvailable(): boolean {
  if (!app.isReady()) return false
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    return !isInsecureStorageBackend()
  } catch {
    // 个别平台在初始化未完成时会抛错，按「不可用」处理。
    return false
  }
}

/**
 * 是否处于 Linux 的弱加密后端（`basic_text`）。
 *
 * `getSelectedStorageBackend()` 仅 Linux 有效且属较新 API：非 Linux 平台直接
 * 返回 false（保持 Windows / macOS 既有行为），调用前再做存在性守卫，
 * 兼容旧版 Electron 运行时。
 */
function isInsecureStorageBackend(): boolean {
  if (process.platform !== 'linux') return false
  try {
    if (!('getSelectedStorageBackend' in safeStorage)) return false
    return safeStorage.getSelectedStorageBackend() === 'basic_text'
  } catch {
    // 初始化未完成 / 运行时缺失时按既有逻辑（已可加密）处理，避免误伤。
    return false
  }
}

/** 解析密文里的账户信息。 */
function parseAccount(value: unknown): OneDriveAccount | null {
  if (!isRecord(value)) return null
  const email = readString(value, 'email')
  if (!email) return null
  const displayName = readString(value, 'displayName')
  return displayName ? { email, displayName } : { email }
}

/** 解析解密后的 JSON 载荷（结构不符返回 null）。 */
function parseCredentials(value: unknown): OneDriveCredentials | null {
  if (!isRecord(value)) return null
  const accessToken = readString(value, 'accessToken')
  const refreshToken = readString(value, 'refreshToken')
  const expiresAt = readNumber(value, 'expiresAt')
  if (!accessToken || !refreshToken || expiresAt === null) return null

  const account = parseAccount(value.account)
  return account
    ? { accessToken, refreshToken, expiresAt, account }
    : { accessToken, refreshToken, expiresAt }
}

/**
 * 读取并解密凭据。
 *
 * - 未保存 → null；
 * - 环境不支持加密 → 抛 `encryption_unavailable`；
 * - 密文损坏 / 系统凭据变更 → 抛 `credentials_corrupt`。
 */
export function readStoredCredentials(): OneDriveCredentials | null {
  const stored = getSetting(ONEDRIVE_SETTING_KEYS.credentials)
  if (!stored) return null

  if (!isCredentialEncryptionAvailable()) {
    throw new OneDriveError('encryption_unavailable', {
      message: 'Secure storage is unavailable; cannot decrypt OneDrive credentials'
    })
  }

  let plaintext: string
  try {
    plaintext = safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch (error) {
    log.warn('OneDrive 凭据解密失败（可能系统凭据已变更）')
    throw new OneDriveError('credentials_corrupt', {
      message: 'Failed to decrypt OneDrive credentials',
      cause: error
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(plaintext) as unknown
  } catch (error) {
    throw new OneDriveError('credentials_corrupt', {
      message: 'Stored OneDrive credentials are not valid JSON',
      cause: error
    })
  }

  const credentials = parseCredentials(parsed)
  if (!credentials) {
    throw new OneDriveError('credentials_corrupt', {
      message: 'Stored OneDrive credentials have an unexpected shape'
    })
  }
  return credentials
}

/**
 * 加密写入凭据，并同步明文账户邮箱。
 *
 * 环境不支持加密时抛 `encryption_unavailable`，**不落任何明文**。
 */
export function writeStoredCredentials(credentials: OneDriveCredentials): void {
  if (!isCredentialEncryptionAvailable()) {
    throw new OneDriveError('encryption_unavailable', {
      message: 'Secure storage is unavailable; refusing to store OneDrive credentials'
    })
  }

  let encrypted: Buffer
  try {
    encrypted = safeStorage.encryptString(JSON.stringify(credentials))
  } catch (error) {
    throw new OneDriveError('encryption_unavailable', {
      message: 'Failed to encrypt OneDrive credentials',
      cause: error
    })
  }

  setSetting(ONEDRIVE_SETTING_KEYS.credentials, encrypted.toString('base64'))
  if (credentials.account?.email) {
    setSetting(ONEDRIVE_SETTING_KEYS.account, credentials.account.email)
  } else {
    deleteSetting(ONEDRIVE_SETTING_KEYS.account)
  }
  log.info('OneDrive 凭据已保存', {
    account: maskEmail(credentials.account?.email),
    expiresAt: credentials.expiresAt
  })
}

/** 清除密文凭据与明文账户邮箱（登出 / 刷新令牌失效时调用）。 */
export function clearStoredCredentials(): void {
  deleteSetting(ONEDRIVE_SETTING_KEYS.credentials)
  deleteSetting(ONEDRIVE_SETTING_KEYS.account)
  log.info('OneDrive 凭据已清除')
}

/** 读取明文账户邮箱（仅展示用）。 */
export function getStoredAccount(): OneDriveAccount | null {
  const email = (getSetting(ONEDRIVE_SETTING_KEYS.account) ?? '').trim()
  return email ? { email } : null
}

/**
 * 汇总授权状态（不抛异常，供设置页展示）。
 *
 * `signedIn` 要求「有密文 + 当前环境可解密」；解密失败视为未登录。
 */
export function getOneDriveAuthStatus(): OneDriveAuthStatus {
  const encryptionAvailable = isCredentialEncryptionAvailable()
  const hasStored = (getSetting(ONEDRIVE_SETTING_KEYS.credentials) ?? '') !== ''
  const fallbackAccount = getStoredAccount()

  if (!hasStored || !encryptionAvailable) {
    return { signedIn: false, account: fallbackAccount, encryptionAvailable }
  }

  try {
    const credentials = readStoredCredentials()
    return {
      signedIn: credentials !== null,
      account: credentials?.account ?? fallbackAccount,
      encryptionAvailable
    }
  } catch (error) {
    const normalized = error instanceof OneDriveError ? error : null
    log.warn('读取 OneDrive 授权状态失败', { code: normalized?.code ?? 'unknown' })
    return { signedIn: false, account: fallbackAccount, encryptionAvailable }
  }
}

import { app, safeStorage } from 'electron'
import { deleteSetting, getSetting, setSetting } from '../database/settings'
import { logger } from '../logger'
import { isAiProviderId } from './types'
import type {
  AiConfigPatch,
  AiConfigUpdateResult,
  AiConfigView,
  AiKeyWriteError,
  AiProviderId
} from './types'

/**
 * AI 配置读写与密钥加解密。
 *
 * 安全边界：
 * - 密文以 base64 存于 `settings` 表；明文只在主进程内存里短暂存在；
 * - `getAiConfig()` 只输出掩码，`getApiKey()` 仅供主进程内部调用；
 * - 日志只允许 `{ provider, model, keyLength }`，绝不含密钥或用户正文。
 */

const log = logger.scope('ai:config')

/**
 * settings 键名集中定义（便于后续改名 / 迁移）。
 *
 * `opencodeToken` 与 `deepseekApiKey` 同为 `safeStorage` 密文，语义一致。
 */
const AI_KEYS = {
  provider: 'ai:provider',
  deepseekBaseUrl: 'ai:deepseek:baseUrl',
  deepseekModel: 'ai:deepseek:model',
  deepseekApiKey: 'ai:deepseek:apiKey',
  opencodeBaseUrl: 'ai:opencode:baseUrl',
  opencodeModel: 'ai:opencode:model',
  opencodeToken: 'ai:opencode:token'
} as const

/** 默认服务商。 */
const DEFAULT_PROVIDER: AiProviderId = 'deepseek'

/** DeepSeek 官方 API 的默认 Base URL（OpenAI 兼容，保留 `/v1` 前缀）。 */
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

/**
 * opencode Go 的默认 Base URL。
 *
 * 注意：该值**不含** `/openai/v1` 前缀——模型列表位于 `{base}/v1/models`，
 * 对话位于 `{base}/openai/v1/chat/completions`，两套前缀不同，由适配器分别拼接。
 */
export const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/inference/go'

/** 服务商对应的 settings 键集合。 */
interface ProviderKeys {
  baseUrl: string
  model: string
  secret: string
}

function keysFor(provider: AiProviderId): ProviderKeys {
  if (provider === 'opencode') {
    return {
      baseUrl: AI_KEYS.opencodeBaseUrl,
      model: AI_KEYS.opencodeModel,
      secret: AI_KEYS.opencodeToken
    }
  }
  return {
    baseUrl: AI_KEYS.deepseekBaseUrl,
    model: AI_KEYS.deepseekModel,
    secret: AI_KEYS.deepseekApiKey
  }
}

/**
 * 当前环境是否支持 `safeStorage` 加密。
 *
 * 时序约束：`safeStorage` 只能在 `app.whenReady()` 之后使用，因此这里**每次调用**
 * 都延迟判断（模块顶层不触碰 `safeStorage`），并显式检查 `app.isReady()`。
 */
function isEncryptionAvailable(): boolean {
  if (!app.isReady()) return false
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    // 个别平台在未完成初始化时会抛错，按「不可用」处理，绝不降级为明文。
    return false
  }
}

/** 读取已配置的服务商（非法值回退默认）。 */
function readProvider(): AiProviderId {
  const stored = getSetting(AI_KEYS.provider)
  if (stored === 'deepseek' || stored === 'opencode') return stored
  if (stored !== null) {
    log.warn('未知的 AI 服务商配置，回退默认值', { provider: DEFAULT_PROVIDER })
  }
  return DEFAULT_PROVIDER
}

/** 读取 Base URL（去空白、去尾部斜杠；空则回退该服务商默认值）。 */
function readBaseUrl(provider: AiProviderId): string {
  const raw = (getSetting(keysFor(provider).baseUrl) ?? '').trim()
  const normalized = raw.replace(/\/+$/, '')
  if (normalized) return normalized
  return provider === 'deepseek' ? DEFAULT_DEEPSEEK_BASE_URL : DEFAULT_OPENCODE_BASE_URL
}

/** 读取模型 ID（完全由用户配置 / 动态列表决定，代码内不硬编码任何模型名）。 */
function readModel(provider: AiProviderId): string {
  return (getSetting(keysFor(provider).model) ?? '').trim()
}

/** 掩码规则：保留前 3 位 + `****` + 后 4 位；长度不足 8 时全掩码。 */
export function maskSecret(secret: string): string {
  if (secret.length < 8) return '****'
  return `${secret.slice(0, 3)}****${secret.slice(-4)}`
}

/**
 * 解密指定服务商的密钥（仅主进程内部使用）。
 *
 * 解密失败 / 当前环境不可用 / 无密钥时返回 null；绝不抛出、绝不打日志明文。
 */
export function getApiKey(provider: AiProviderId): string | null {
  const stored = getSetting(keysFor(provider).secret)
  if (!stored) return null
  if (!isEncryptionAvailable()) {
    log.warn('当前环境不支持安全存储，无法读取 AI 密钥', { provider })
    return null
  }
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    log.warn('AI 密钥解密失败（可能系统凭据已变更）', { provider })
    return null
  }
}

/** 主进程内部使用的连接配置（含明文密钥，禁止透传渲染层）。 */
export interface AiProviderConnection {
  provider: AiProviderId
  baseUrl: string
  model: string
  apiKey: string | null
}

/** 读取指定服务商当前生效的 Base URL（已去尾部斜杠 / 空值回退默认）。 */
export function getProviderBaseUrl(provider: AiProviderId): string {
  return readBaseUrl(provider)
}

/** 按服务商解析出可用连接参数（各服务商均读取解密后的密钥）。 */
export function getProviderConnection(provider: AiProviderId): AiProviderConnection {
  return {
    provider,
    baseUrl: readBaseUrl(provider),
    model: readModel(provider),
    apiKey: getApiKey(provider)
  }
}

/** 读取非敏感配置视图。 */
export function getAiConfig(): AiConfigView {
  const provider = readProvider()
  const stored = getSetting(keysFor(provider).secret)
  const plaintext = getApiKey(provider)
  return {
    provider,
    baseUrl: readBaseUrl(provider),
    model: readModel(provider),
    hasKey: stored !== null && stored !== '',
    keyMasked: plaintext ? maskSecret(plaintext) : '',
    encryptionAvailable: isEncryptionAvailable()
  }
}

/**
 * 写入配置。
 *
 * - `baseUrl` / `model` 传空串等价于清除该项（回到默认值）；
 * - `apiKey` 传空串等价于清除密钥；
 * - 加密不可用时**拒绝保存密钥**并通过 `apiKeyError` 标记，绝不落明文。
 */
export function setAiConfig(patch: AiConfigPatch): AiConfigUpdateResult {
  // 运行时兜底：未来 IPC 透传非法 provider 时不应污染 settings。
  if (patch.provider !== undefined && !isAiProviderId(patch.provider)) {
    throw new TypeError('未知的 AI 服务商')
  }

  const provider = patch.provider ?? readProvider()
  const keys = keysFor(provider)

  if (patch.provider !== undefined) {
    setSetting(AI_KEYS.provider, provider)
  }

  if (patch.baseUrl !== undefined) {
    const value = patch.baseUrl.trim().replace(/\/+$/, '')
    if (value) setSetting(keys.baseUrl, value)
    else deleteSetting(keys.baseUrl)
  }

  if (patch.model !== undefined) {
    const value = patch.model.trim()
    if (value) setSetting(keys.model, value)
    else deleteSetting(keys.model)
  }

  let apiKeyStored = false
  let apiKeyError: AiKeyWriteError | undefined
  let keyLength: number | undefined

  if (patch.apiKey !== undefined) {
    const plaintext = patch.apiKey.trim()
    if (!plaintext) {
      deleteSetting(keys.secret)
      log.info('AI 密钥已清除', { provider, model: readModel(provider) })
    } else if (!isEncryptionAvailable()) {
      apiKeyError = 'encryption_unavailable'
      log.warn('当前环境不支持安全存储，拒绝保存 AI 密钥', {
        provider,
        model: readModel(provider)
      })
    } else {
      try {
        const encrypted = safeStorage.encryptString(plaintext)
        setSetting(keys.secret, encrypted.toString('base64'))
        apiKeyStored = true
        keyLength = plaintext.length
      } catch {
        apiKeyError = 'encryption_unavailable'
        log.error('AI 密钥加密失败，未保存', { provider, model: readModel(provider) })
      }
    }
  }

  log.info('AI 配置已更新', {
    provider,
    model: readModel(provider),
    ...(keyLength !== undefined ? { keyLength } : {})
  })

  return {
    config: getAiConfig(),
    apiKeyStored,
    ...(apiKeyError !== undefined ? { apiKeyError } : {})
  }
}

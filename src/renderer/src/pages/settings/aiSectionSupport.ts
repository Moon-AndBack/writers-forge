/**
 * 设置页 · AI 分区的共享常量、类型与落库工具。
 *
 * 只承载无状态定义与纯函数；`draft` / `config` 等 state 一律留在
 * `useAiSettingsConfig`。
 */
import type {
  AiConfigPatch,
  AiConfigView,
  AiError,
  AiProviderId
} from '../../../../preload/types/ai'
import { notifyAiConfigChanged } from '../writer/right/ai/aiConfigSync'

type AiErrorCode = AiError['code']

/**
 * 错误码 → 文案 key 的静态映射：`satisfies` 强制覆盖 `AiErrorCode` 全部 14 个值，
 * 新增错误码时类型检查会失败，避免漏译。
 */
export const ERROR_KEYS = {
  network: 'error.network',
  timeout: 'error.timeout',
  auth: 'error.auth',
  rate_limit: 'error.rate_limit',
  invalid_request: 'error.invalid_request',
  upstream: 'error.upstream',
  aborted: 'error.aborted',
  unknown: 'error.unknown',
  plan_restricted: 'error.plan_restricted',
  session_missing: 'error.session_missing',
  auth_missing: 'error.auth_missing',
  auth_invalid: 'error.auth_invalid',
  forbidden: 'error.forbidden',
  insufficient_quota: 'error.insufficient_quota'
} as const satisfies Record<AiErrorCode, string>

/**
 * 连接字段草稿：`provider` / `baseUrl` / `model` 共用同一份 state，
 * 由 `useAiSettingsConfig` 单点持有（禁止拆分）。
 */
export interface ConnectionDraft {
  provider: AiProviderId
  baseUrl: string
  model: string
}

export type TestState =
  | { status: 'idle' | 'testing' }
  | { status: 'ok'; latencyMs: number }
  | { status: 'fail'; error: AiError }

export const INITIAL_DRAFT: ConnectionDraft = { provider: 'deepseek', baseUrl: '', model: '' }
export const UNKNOWN_ERROR: AiError = { code: 'unknown', message: '' }

/** 落库连接配置：成功返回最新掩码视图，失败提示并返回 null。 */
export type PersistConfig = (patch: AiConfigPatch) => Promise<AiConfigView | null>

/** 构造 `persistConfig`：供 `useAiSettingsConfig` 的 `flushConnection` 使用。 */
export function createPersistConfig(deps: {
  setConfig: (view: AiConfigView) => void
  onError: () => void
}): PersistConfig {
  return async (patch) => {
    const api = window.api?.ai
    if (!api) return null
    try {
      const result = await api.config.set(patch)
      deps.setConfig(result.config)
      // 落库成功：广播给已挂载的 AI 面板，令其重读服务商 / 当前模型。
      notifyAiConfigChanged()
      return result.config
    } catch {
      deps.onError()
      return null
    }
  }
}

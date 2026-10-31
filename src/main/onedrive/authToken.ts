import {
  createRequestSignal,
  isRecord,
  normalizeError,
  parseJson,
  readNumber,
  readString,
  trimSnippet
} from './http'
import { OneDriveError } from './types'

/**
 * OAuth 2.0 令牌端点（公共客户端，无客户端密码）。
 *
 * 仅负责 HTTP 交互与响应归一化；刷新策略 / 持久化在 `auth.ts`。
 */

/** 令牌端点（common 租户，支持个人 / 工作账户）。 */
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
/** 令牌端点超时。 */
const TOKEN_TIMEOUT_MS = 30_000

/** 令牌端点返回的归一化结果。 */
export interface TokenPayload {
  accessToken: string
  /** 上游未返回新 refresh token 时为 null（调用方沿用旧值）。 */
  refreshToken: string | null
  /** 毫秒时间戳。 */
  expiresAt: number
}

/** 把 OAuth 错误体映射为结构化错误。 */
function tokenError(status: number, payload: unknown): OneDriveError {
  const oauthError = isRecord(payload) ? readString(payload, 'error') : null
  const description = isRecord(payload) ? readString(payload, 'error_description') : null
  const detail = description ? `${oauthError ?? 'token_error'}: ${trimSnippet(description)}` : null
  const message = detail ?? `Token request failed (HTTP ${status})`

  if (oauthError === 'invalid_grant' || oauthError === 'interaction_required') {
    return new OneDriveError('reauth_required', { status, message })
  }
  if (status === 429) return new OneDriveError('rate_limited', { status, message })
  if (status >= 500) return new OneDriveError('upstream', { status, message })
  return new OneDriveError('auth_failed', { status, message })
}

/**
 * 调用令牌端点（`application/x-www-form-urlencoded`）。
 *
 * 失败抛 `OneDriveError`：`invalid_grant` / `interaction_required` → `reauth_required`，
 * 429 → `rate_limited`，5xx → `upstream`，其余 → `auth_failed`。
 */
export async function requestToken(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<TokenPayload> {
  const request = createRequestSignal(signal, TOKEN_TIMEOUT_MS)
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams(params).toString(),
      signal: request.signal
    })

    const text = await response.text()
    const payload = parseJson(text)
    if (!response.ok) throw tokenError(response.status, payload)

    const accessToken = isRecord(payload) ? readString(payload, 'access_token') : null
    if (!accessToken) {
      throw new OneDriveError('auth_failed', {
        status: response.status,
        message: 'Token response is missing access_token'
      })
    }

    const expiresIn = isRecord(payload) ? readNumber(payload, 'expires_in') : null
    const refreshToken = isRecord(payload) ? readString(payload, 'refresh_token') : null
    const lifetimeSeconds = expiresIn !== null && expiresIn > 0 ? expiresIn : 3600

    return {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + lifetimeSeconds * 1000
    }
  } catch (error) {
    throw normalizeError(error, { timedOut: request.timedOut(), fallback: 'auth_failed' })
  } finally {
    request.dispose()
  }
}

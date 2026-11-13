import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { logger } from '../logger'
import { startCallbackServer } from './authCallback'
import { requestToken } from './authToken'
import type { TokenPayload } from './authToken'
import {
  DEFAULT_ONEDRIVE_CLIENT_ID,
  clearStoredCredentials,
  getOneDriveAuthStatus,
  readStoredCredentials,
  writeStoredCredentials
} from './credentials'
import { getAccountProfile } from './graph'
import { describeError, normalizeError, resolveTimeout } from './http'
import { maskEmail } from './logSafe'
import { OneDriveError } from './types'
import type { OneDriveAccount, OneDriveAuthStatus, OneDriveCredentials } from './types'

/**
 * Microsoft Graph 公共客户端授权（本地回环 + PKCE，无客户端密码）。
 *
 * 流程：
 * 1. 生成 PKCE 对 + state；
 * 2. `127.0.0.1` 随机端口起本地 server，回调地址 `http://localhost:<port>/`
 *    （Azure 登记的是 `http://localhost` 根路径；localhost 仅忽略端口，路径必须一致）；
 * 3. `shell.openExternal` 打开授权页；
 * 4. 校验 state → 用 code 换 token → 写加密凭据；
 * 5. 后续 `getValidAccessToken()` 在过期前 5 分钟自动刷新（含 refresh token 轮换回写）。
 *
 * 回调 server 见 `authCallback.ts`，令牌端点交互见 `authToken.ts`。
 * 错误一律抛 `OneDriveError`，不返回中文文案。
 */

const log = logger.scope('onedrive:auth')

/** 授权端点（common 租户，支持个人 / 工作账户）。 */
const AUTHORIZE_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'

/** 申请的权限（Graph 应用专属目录读写 + 读取账户资料）。 */
export const ONEDRIVE_SCOPES = 'offline_access Files.ReadWrite.AppFolder User.Read'

/** 等待用户在浏览器完成授权的默认超时：5 分钟。 */
const AUTHORIZE_TIMEOUT_MS = 5 * 60 * 1000

/** access token 提前刷新窗口：5 分钟。 */
const EXPIRY_SKEW_MS = 5 * 60 * 1000

/** `signIn` 选项。 */
export interface SignInOptions {
  /** 覆盖等待授权的超时（默认 5 分钟）。 */
  timeoutMs?: number
  /** 外部取消信号。 */
  signal?: AbortSignal
}

/** 当前进行中的授权流程的取消函数。 */
let activeCancel: (() => void) | null = null
/** 单飞刷新任务，避免并发刷新导致 refresh token 互相失效。 */
let refreshTask: Promise<string> | null = null
/** 凭据代际：登出 / 重新登录时自增，阻止在途刷新把旧凭据写回。 */
let credentialsGeneration = 0

/** Base64URL 编码（无 padding）。 */
function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 生成 PKCE 对（RFC 7636 S256）。 */
function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** 构造授权 URL。 */
function buildAuthorizeUrl(input: {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
}): string {
  const query = new URLSearchParams({
    client_id: input.clientId,
    response_type: 'code',
    redirect_uri: input.redirectUri,
    response_mode: 'query',
    scope: ONEDRIVE_SCOPES,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: 'S256'
  })
  return `${AUTHORIZE_ENDPOINT}?${query.toString()}`
}

/** 读取账户资料（失败不影响已有令牌，返回 null）。 */
async function loadAccount(
  accessToken: string,
  signal?: AbortSignal
): Promise<OneDriveAccount | null> {
  try {
    return await getAccountProfile({ accessToken, signal })
  } catch (error) {
    const normalized = normalizeError(error, { fallback: 'upstream' })
    log.warn('读取 OneDrive 账户信息失败（不影响令牌保存）', {
      code: normalized.code,
      status: normalized.status
    })
    return null
  }
}

/**
 * 发起一次交互式授权。
 *
 * 会先取消进行中的授权；成功返回最新授权状态（含账户邮箱）。
 */
export async function signIn(options: SignInOptions = {}): Promise<OneDriveAuthStatus> {
  cancelSignIn()

  const generation = (credentialsGeneration += 1)
  const clientId = DEFAULT_ONEDRIVE_CLIENT_ID
  const timeoutMs = resolveTimeout(options.timeoutMs, AUTHORIZE_TIMEOUT_MS)
  const { verifier, challenge } = createPkcePair()
  const state = base64Url(randomBytes(24))
  const server = await startCallbackServer(state, { timeoutMs, signal: options.signal })

  const cancel = (): void => server.close()
  activeCancel = cancel

  try {
    const authorizeUrl = buildAuthorizeUrl({
      clientId,
      redirectUri: server.redirectUri,
      state,
      challenge
    })

    try {
      await shell.openExternal(authorizeUrl)
    } catch (error) {
      throw new OneDriveError('auth_failed', {
        message: `Failed to open the system browser: ${describeError(error)}`,
        cause: error
      })
    }

    const authorizationCode = await server.code
    const token = await requestToken(
      {
        client_id: clientId,
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: server.redirectUri,
        code_verifier: verifier,
        scope: ONEDRIVE_SCOPES
      },
      options.signal
    )

    if (!token.refreshToken) {
      throw new OneDriveError('auth_failed', {
        message: 'Token response did not include a refresh token'
      })
    }

    const account = await loadAccount(token.accessToken, options.signal)
    if (generation !== credentialsGeneration) {
      throw new OneDriveError('auth_cancelled', {
        message: 'Authorization was superseded by another request'
      })
    }
    writeStoredCredentials({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      ...(account ? { account } : {})
    })
    log.info('OneDrive 授权完成', { account: maskEmail(account?.email) })
    return getOneDriveAuthStatus()
  } catch (error) {
    const normalized = normalizeError(error, { fallback: 'auth_failed' })
    // 授权码阶段出现 invalid_grant 属于本次授权失败，不是「需要重新登录」。
    if (normalized.code === 'reauth_required') {
      throw new OneDriveError('auth_failed', {
        status: normalized.status,
        message: normalized.message,
        cause: normalized
      })
    }
    throw normalized
  } finally {
    server.close()
    if (activeCancel === cancel) activeCancel = null
  }
}

/** 取消进行中的授权（幂等；无进行中流程时为空操作）。 */
export function cancelSignIn(): void {
  activeCancel?.()
  activeCancel = null
}

/** 是否有授权流程进行中。 */
export function isSignInInProgress(): boolean {
  return activeCancel !== null
}

/** 用 refresh token 换新 access token，并回写（含轮换）。 */
async function refreshStoredCredentials(
  credentials: OneDriveCredentials,
  signal?: AbortSignal
): Promise<OneDriveCredentials> {
  const generation = credentialsGeneration

  let token: TokenPayload
  try {
    token = await requestToken(
      {
        client_id: DEFAULT_ONEDRIVE_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        scope: ONEDRIVE_SCOPES
      },
      signal
    )
  } catch (error) {
    const normalized = normalizeError(error, { fallback: 'auth_failed' })
    if (normalized.code === 'reauth_required') {
      clearStoredCredentials()
      log.warn('OneDrive 刷新令牌已失效，凭据已清除', {
        code: normalized.code,
        status: normalized.status
      })
    }
    throw normalized
  }

  const next: OneDriveCredentials = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? credentials.refreshToken,
    expiresAt: token.expiresAt,
    ...(credentials.account ? { account: credentials.account } : {})
  }
  if (generation !== credentialsGeneration) {
    throw new OneDriveError('aborted', {
      message: 'OneDrive credentials changed while refreshing'
    })
  }
  writeStoredCredentials(next)
  log.info('OneDrive access token 已刷新', { expiresAt: next.expiresAt })
  return next
}

/**
 * 取一个可用的 access token（过期前 5 分钟自动刷新）。
 *
 * 失败情形：
 * - 未登录 / 无凭据 → `not_configured`；
 * - 刷新令牌失效 → `reauth_required`（同时已清除凭据）。
 */
export async function getValidAccessToken(
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {}
): Promise<string> {
  const credentials = readStoredCredentials()
  if (!credentials) {
    throw new OneDriveError('not_configured', { message: 'OneDrive is not signed in' })
  }

  const fresh = credentials.expiresAt - Date.now() > EXPIRY_SKEW_MS
  if (!options.forceRefresh && fresh) return credentials.accessToken

  if (!credentials.refreshToken) {
    throw new OneDriveError('reauth_required', {
      message: 'No refresh token is available; sign in again'
    })
  }

  if (!refreshTask) {
    const task = refreshStoredCredentials(credentials, options.signal).then(
      (next) => next.accessToken
    )
    refreshTask = task
    void task.then(
      () => {
        refreshTask = null
      },
      () => {
        refreshTask = null
      }
    )
  }
  return refreshTask
}

/** 登出：取消进行中的授权并清除全部凭据。 */
export function signOut(): void {
  cancelSignIn()
  credentialsGeneration += 1
  clearStoredCredentials()
  log.info('OneDrive 已登出')
}

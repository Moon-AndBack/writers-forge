import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { describeError, normalizeError } from './http'
import { OneDriveError } from './types'

/**
 * 本地回环 OAuth 回调 server。
 *
 * 约束：
 * - 仅监听 `127.0.0.1` 的随机端口（0 = 系统分配）；
 * - 仅接受 `GET /callback`，其余路径返回 404；
 * - 校验 `state`，收到 `code` 后立即响应极简成功页并关闭 server；
 * - 超时 / 取消 / 参数错误都会关闭 server 并拒绝 `code` Promise。
 */

/** 回调路径（Azure 侧登记的是 `http://localhost`，运行时带随机端口）。 */
export const CALLBACK_PATH = '/callback'

/** 本地回环回调 server 句柄。 */
export interface CallbackServer {
  redirectUri: string
  /** 收到合法 code 时 resolve；超时 / 取消 / state 不匹配时 reject。 */
  code: Promise<string>
  /** 主动取消（幂等）。 */
  close: () => void
}

/** 向浏览器返回极简 HTML（英文，避免在本模块硬编码中文字案）。 */
function respondHtml(
  response: ServerResponse,
  status: number,
  title: string,
  message: string
): void {
  const body = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:48px">
<h1>${title}</h1><p>${message}</p>
</body></html>`
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  })
  response.end(body)
}

/** 供非回调路径使用的纯文本响应。 */
function respondText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  })
  response.end(body)
}

/**
 * 启动本地回调 server 并返回回调地址与 `code` Promise。
 *
 * 回调地址使用 `http://localhost:<port>/callback`（与 Azure 登记的
 * `http://localhost` 对齐；Microsoft 允许 localhost 使用任意端口）。
 */
export async function startCallbackServer(
  state: string,
  options: { timeoutMs: number; signal?: AbortSignal }
): Promise<CallbackServer> {
  let timer: NodeJS.Timeout | null = null
  let server: Server | null = null
  let settled = false
  let resolveCode: ((code: string) => void) | null = null
  let rejectCode: ((error: OneDriveError) => void) | null = null

  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  // 调用方可能尚未 await（如 openExternal 抛错后立即 close），先挂一个空处理器
  // 避免 unhandledRejection；后续 await 仍能拿到原始拒绝原因。
  void code.catch(() => undefined)

  const finish = (error: OneDriveError | null, value?: string): void => {
    if (settled) return
    settled = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    options.signal?.removeEventListener('abort', onAbort)
    if (server?.listening) server.close()
    if (error !== null) rejectCode?.(error)
    else if (value !== undefined) resolveCode?.(value)
  }

  function onAbort(): void {
    finish(new OneDriveError('auth_cancelled', { message: 'Authorization cancelled' }))
  }

  const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    if (request.method !== 'GET' || requestUrl.pathname !== CALLBACK_PATH) {
      respondText(response, 404, 'Not Found')
      return
    }

    const returnedState = requestUrl.searchParams.get('state')
    if (returnedState !== state) {
      respondHtml(response, 400, 'Authorization failed', 'The response did not match this request.')
      finish(new OneDriveError('state_mismatch', { message: 'OAuth state mismatch' }))
      return
    }

    const oauthError = requestUrl.searchParams.get('error')
    if (oauthError) {
      respondHtml(
        response,
        400,
        'Authorization failed',
        'You can close this window and return to Writer’s Forge.'
      )
      const failureCode = oauthError === 'access_denied' ? 'auth_cancelled' : 'auth_failed'
      finish(new OneDriveError(failureCode, { message: `Authorization failed: ${oauthError}` }))
      return
    }

    const authorizationCode = requestUrl.searchParams.get('code')
    if (!authorizationCode) {
      respondHtml(response, 400, 'Authorization failed', 'Missing authorization code.')
      finish(new OneDriveError('auth_failed', { message: 'Missing authorization code' }))
      return
    }

    respondHtml(
      response,
      200,
      'Authorization complete',
      'You can close this window and return to Writer’s Forge.'
    )
    finish(null, authorizationCode)
  }

  server = createServer(handleRequest)
  const instance = server

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        instance.off('listening', onListening)
        const failure = new OneDriveError('port_bind_failed', {
          message: `Failed to start the local callback server: ${describeError(error)}`,
          cause: error
        })
        finish(failure)
        reject(failure)
      }
      const onListening = (): void => {
        instance.off('error', onError)
        resolve()
      }
      instance.once('error', onError)
      instance.once('listening', onListening)
      instance.listen(0, '127.0.0.1')
    })
  } catch (error) {
    throw normalizeError(error, { fallback: 'port_bind_failed' })
  }

  const address = instance.address()
  if (address === null || typeof address === 'string') {
    const failure = new OneDriveError('port_bind_failed', {
      message: 'The local callback server did not expose a TCP port'
    })
    finish(failure)
    throw failure
  }

  const redirectUri = `http://localhost:${address.port}${CALLBACK_PATH}`

  timer = setTimeout(() => {
    finish(new OneDriveError('auth_timeout', { message: 'Authorization timed out' }))
  }, options.timeoutMs)
  timer.unref()

  if (options.signal) {
    if (options.signal.aborted) onAbort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    redirectUri,
    code,
    close: () => finish(new OneDriveError('auth_cancelled', { message: 'Authorization cancelled' }))
  }
}

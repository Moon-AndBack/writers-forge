import { basename } from 'node:path'
import { isOneDriveError } from './types'

/**
 * 日志脱敏工具（单一实现，供 OneDrive 域与主进程日志复用）。
 *
 * 落盘日志属于「离开进程边界」的数据，必须假设可能被用户 / 支持人员查看，
 * 因此邮箱、绝对路径、整对象异常一律先脱敏再记录。
 *
 * 本文件只依赖 `node:path` 与纯类型模块 `./types`，不依赖 `electron` /
 * `logger`，因此核心日志模块（`src/main/logger.ts`）也可安全引入而不产生循环依赖。
 */

/** 日志里错误 message 的最大长度（上游长文本截断，避免刷屏）。 */
const MAX_ERROR_MESSAGE_LENGTH = 200

/**
 * 邮箱脱敏：保留首字符与域名，如 `alice@example.com` → `a***@example.com`。
 *
 * 空值返回 null；无法解析出「本地部分 + 域名」时统一返回 `***`，
 * 保证任何情况下都不会把原邮箱写进日志。
 */
export function maskEmail(email: string | null | undefined): string | null {
  const value = (email ?? '').trim()
  if (!value) return null
  const at = value.lastIndexOf('@')
  if (at <= 0 || at === value.length - 1) return '***'
  return `${value[0]}***${value.slice(at)}`
}

/**
 * 路径脱敏：只保留文件名，绝不记录目录。
 *
 * 绝对路径通常包含系统用户名（如 `C:\Users\<name>\AppData\...`），
 * 因此日志中一律以 `basename` 结果代替。
 */
export function safePath(filePath: string | null | undefined): string | null {
  if (!filePath) return null
  return basename(filePath) || null
}

/** 压缩空白并截断日志文本。 */
function clip(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${compact.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : compact
}

/** 脱敏后的异常日志载荷（白名单字段）。 */
export interface SafeErrorLog {
  code?: string
  status?: number
  message: string
}

/**
 * 错误对象脱敏：只输出白名单字段（`code` / `status` / 截断后的 `message`）。
 *
 * 不整体序列化异常：其 `cause`、自定义属性与上游响应片段可能携带 token、
 * 绝对路径等敏感信息，落盘后无法收回。
 */
export function safeError(error: unknown): SafeErrorLog {
  if (isOneDriveError(error)) {
    return {
      code: error.code,
      ...(typeof error.status === 'number' ? { status: error.status } : {}),
      message: clip(error.message)
    }
  }

  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return {
      ...(typeof code === 'string' ? { code } : {}),
      message: clip(error.message || error.name)
    }
  }

  if (typeof error === 'string') return { message: clip(error) }
  return { message: 'Unknown error' }
}

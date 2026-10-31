/**
 * AI 错误码 → 文案 key 映射（`ai` ns）。
 *
 * 独立成模块的原因：`ChatMessage.tsx` 只导出组件，若同时导出常量会触发
 * react-refresh 的 `only-export-components` 告警；而 AI 面板（模型拉取失败 /
 * 快捷结果失败）与消息气泡需要共用同一张表，保证同一错误在两处措辞一致。
 *
 * 与设置页 `aiSectionSupport.ts` 的 `ERROR_KEYS` 同款：`satisfies` 强制覆盖
 * `AiErrorCode` 全部 12 个值，主进程新增错误码时类型检查会失败，避免漏译。
 */
import type { AiError } from '../../../../../../preload/types/ai'

export const AI_ERROR_TEXT_KEYS = {
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
  auth_invalid: 'error.auth_invalid'
} as const satisfies Record<AiError['code'], string>

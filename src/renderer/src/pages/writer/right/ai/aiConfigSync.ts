/**
 * AI 配置变更的模块级通知：设置页落库（服务商 / 模型 / Base URL）成功后广播，
 * 已挂载的 `useAiModels` 据此重读配置，避免右栏面板沿用旧服务商的模型发送。
 */

/** 配置变更事件名。 */
export const AI_CONFIG_CHANGED_EVENT = 'wf:ai-config-changed'

/** 派发配置变更事件（无 `window` 环境为空操作）。 */
export function notifyAiConfigChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(AI_CONFIG_CHANGED_EVENT))
}

import { useSettingsValue } from '../settings/useSettingsValue'

/**
 * settings 键：AI 助手总开关（布尔，缺省开启）。
 *
 * 刻意用普通 camelCase 键、不放 `ai:` 域：`ai:` 前缀被主进程 `settings:get/set`
 * 整体屏蔽（`ipc/settings.ts` 的 `SENSITIVE_KEY_PREFIXES`，用于隔离服务商配置与密钥），
 * 而本开关是纯渲染层界面偏好——不含敏感信息，需经通用 settings 通道读写。
 */
export const AI_ASSISTANT_SETTING_KEY = 'aiAssistantEnabled'

/** 默认值：开启（设置页「启用 AI 助手」与消费方共用同一真源）。 */
export const AI_ASSISTANT_DEFAULT = true

/** 解码：仅显式 `'false'` 视为关闭（与 `ai:compression:enabled` 同口径）。 */
export function decodeAiAssistant(raw: string | null): boolean {
  return raw !== 'false'
}

/**
 * 写作域消费「AI 助手总开关」。
 *
 * 语义：开启时章节模块右栏保留「AI」页签并挂载面板；关闭后页签隐藏、面板卸载
 * （在途请求随卸载中止，半截回复落库），既有的连接配置与会话历史保留，
 * 重新开启即恢复。设置页的配置行不受开关影响——配置是启用的前置。
 *
 * 与设置页共用 `useSettingsValue`：设置弹窗切换后经同键广播即时生效，无需重挂写作页。
 */
export function useAiAssistantEnabled(): boolean {
  return useSettingsValue(AI_ASSISTANT_SETTING_KEY, AI_ASSISTANT_DEFAULT, decodeAiAssistant).value
}

export default useAiAssistantEnabled

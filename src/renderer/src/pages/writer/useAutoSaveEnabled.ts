import { useSettingsValue } from '../settings/useSettingsValue'

/** settings 键：自动保存开关（布尔，缺省开启）。 */
export const AUTO_SAVE_SETTING_KEY = 'autoSave'

/**
 * 写作域消费「自动保存」设置。
 *
 * 语义：开启时章节 / 大纲正文在停止输入 800ms 后自动落库；关闭时不排防抖保存，
 * 仅保留手动保存按钮与切章 / 切模块 / 关窗时的统一 flush（安全网，不丢字）。
 *
 * 与设置页共用 `useSettingsValue`：设置弹窗切换后经同键广播即时生效，无需重挂写作页。
 */
export function useAutoSaveEnabled(): boolean {
  return useSettingsValue(AUTO_SAVE_SETTING_KEY, true, (raw) =>
    raw === null || raw === '' ? true : raw === 'true'
  ).value
}

export default useAutoSaveEnabled

/**
 * 全局笔名（settings 键 `penName`）的共享规则。
 *
 * 设置页（基础偏好）与书架（书籍卡作者行）共用同一份键名 / 解码 / 校验，
 * 避免两处各写一份口径：设置页写库后经 `useSettingsValue` 的同键广播即时
 * 同步书架，无需书架重新挂载。
 */

/** settings 表键名。 */
export const PEN_NAME_SETTING_KEY = 'penName'

/** 笔名长度上限（中英文一致；按 trim 后的字符数计）。 */
export const PEN_NAME_MAX_LENGTH = 40

/** 校验结果：`null` 表示通过，其余对应设置页的行内提示文案。 */
export type PenNameError = 'tooLong' | 'blank'

/** 解码：数据库字符串 → 笔名（null → 空串；兼容旧数据两端空白）。 */
export function decodePenName(raw: string | null): string {
  return (raw ?? '').trim()
}

/**
 * 校验用户输入（原始草稿，未 trim）。
 * - 完全空串合法：表示清空笔名，书籍卡回退「未署名」；
 * - 非空但 trim 后为空：视为只含空白，拒绝保存；
 * - 超过 {@link PEN_NAME_MAX_LENGTH} 字拒绝保存。
 */
export function validatePenName(raw: string): PenNameError | null {
  const trimmed = raw.trim()
  if (raw !== '' && trimmed === '') return 'blank'
  if (trimmed.length > PEN_NAME_MAX_LENGTH) return 'tooLong'
  return null
}

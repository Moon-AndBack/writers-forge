/**
 * 回收站两栏列表卡宽度的持久化格式与钳制规则。
 *
 * 宽度真源是 `TrashSplitLayout` 的 React state（拖拽逐帧只重渲染该组件），
 * 本模块只负责 settings 键名、单值编解码与钳制：
 * - 键名 `trashListWidth`，值为纯数字字符串（全局一个，所有回收站共用）；
 * - 上下限与 `TrashSplitLayout` 的 Splitter 参数同源（200 / 360，默认 260）。
 */

/** settings 表键名（纯数字字符串，如 `"260"`）。 */
export const TRASH_LIST_WIDTH_SETTING_KEY = 'trashListWidth'

/** 列表卡宽度下限 / 上限 / 默认值（与 TrashSplitLayout 的 Splitter 参数同步）。 */
export const TRASH_LIST_MIN = 200
export const TRASH_LIST_MAX = 360
export const TRASH_LIST_DEFAULT = 260

/**
 * 单值宽度兜底：非数字 / NaN / ±Infinity 回落 `fallback`，
 * 其余按 `[TRASH_LIST_MIN, TRASH_LIST_MAX]` 钳制。
 */
export function clampTrashListWidth(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(TRASH_LIST_MAX, Math.max(TRASH_LIST_MIN, value))
}

/** 反序列化 settings 值：空串 / 空白 / 非数字文本一律回落默认值。 */
export function decodeTrashListWidth(raw: string | null): number {
  if (!raw) return TRASH_LIST_DEFAULT
  const trimmed = raw.trim()
  if (!trimmed) return TRASH_LIST_DEFAULT
  const parsed = Number(trimmed)
  return Number.isFinite(parsed)
    ? clampTrashListWidth(parsed, TRASH_LIST_DEFAULT)
    : TRASH_LIST_DEFAULT
}

/** 序列化为 settings 字符串值（取整，避免小数）。 */
export function encodeTrashListWidth(width: number): string {
  return String(Math.round(width))
}

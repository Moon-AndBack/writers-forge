/**
 * 时间线 settings 键**跨进程共享**的单一真源（主进程 `database/timeline` 与渲染层
 * `pages/writer/timeline/timelineOrigin` 共用，AGENTS §2 / §9）。
 *
 * 本文件只允许**类型 + 纯数据 + 纯函数**，不得引入 Node / React。
 *
 * 存储约定（settings）：
 * - 列表键：`timeline:list:<bookId>` → JSON 数组
 * - 选中键：`timeline:active:<bookId>` → 选中 id 字符串
 * - 老键：`timeline:origin:<bookId>` → 起点自由文本（仅 migration 兼容，新代码不再写入）
 *
 * 渲染层无 bookId 时回退裸键（预览 / 无书上下文兜底）；主进程调用点均传真实书籍 id。
 */

/** 默认时间线 id。 */
export const DEFAULT_TIMELINE_ID = 'default'

/** 按书列表 settings 键；bookId 缺省 / 空白时回退裸键。 */
export function timelineListKey(bookId?: string): string {
  const id = (bookId ?? '').trim()
  return id === '' ? 'timeline:list' : `timeline:list:${id}`
}

/** 按书选中 id settings 键；bookId 缺省 / 空白时回退裸键。 */
export function timelineActiveKey(bookId?: string): string {
  const id = (bookId ?? '').trim()
  return id === '' ? 'timeline:active' : `timeline:active:${id}`
}

/** 老起点 settings 键（仅 migration / 清理使用）；bookId 缺省 / 空白时回退裸键。 */
export function timelineOriginKey(bookId?: string): string {
  const id = (bookId ?? '').trim()
  return id === '' ? 'timeline:origin' : `timeline:origin:${id}`
}

/** settings 存值是否有效（非空字符串）。 */
export function isStoredOrigin(value: string | null): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

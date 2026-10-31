/**
 * 独立时间线模块 · 起点 / 时间线键工具（渲染层）。
 *
 * 多时间线数据层（批1）：
 * - 列表键：`timeline:list:<bookId>` → JSON 数组 `TimelineEntry[]`：`{ id, name, origin }`
 * - 选中键：`timeline:active:<bookId>` → 选中 id 字符串
 * - 老键 `timeline:origin:<bookId>` 仅 migration 兼容；新代码读写新键。
 *
 * - 按书隔离；无 bookId 时回退裸键（预览 / 无书上下文兜底）；
 * - 读不到（null / 空白 / 非法）一律回退调用方经 `t('originDefault')` 显示的默认值。
 */

/** 默认时间线 id。 */
export const DEFAULT_TIMELINE_ID = 'default'

/** 时间线条目（与主进程 `TimelineEntry` 同口径）。 */
export interface TimelineEntry {
  id: string
  name: string
  origin: string
}

/** 按书列表 settings 键。 */
export function timelineListKey(bookId?: string): string {
  const id = (bookId ?? '').trim()
  return id === '' ? 'timeline:list' : `timeline:list:${id}`
}

/** 按书选中 id settings 键。 */
export function timelineActiveKey(bookId?: string): string {
  const id = (bookId ?? '').trim()
  return id === '' ? 'timeline:active' : `timeline:active:${id}`
}

/** 老起点 settings 键（migration 兼容，新代码不再写入）。 */
export function timelineOriginKey(bookId?: string): string {
  const id = (bookId ?? '').trim()
  return id === '' ? 'timeline:origin' : `timeline:origin:${id}`
}

/** settings 存值是否有效（非空字符串）。 */
export function isStoredOrigin(value: string | null): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 解析列表 JSON；非法 / 空 → []。 */
export function parseTimelineList(raw: string | null): TimelineEntry[] {
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const result: TimelineEntry[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const id = typeof obj.id === 'string' && obj.id.trim() !== '' ? obj.id.trim() : null
      if (id === null) continue
      // 缺名回填空串，展示层经 `t('timeline.defaultName')` 兜底（不写入中文默认名）。
      const name = typeof obj.name === 'string' && obj.name.trim() !== '' ? obj.name : ''
      const origin = typeof obj.origin === 'string' ? obj.origin : ''
      result.push({ id, name, origin })
    }
    return result
  } catch {
    return []
  }
}

/** 序列化列表。 */
export function serializeTimelineList(list: TimelineEntry[]): string {
  return JSON.stringify(list)
}

/** 从列表 + 选中 id 解析当前 active 条目（缺/非法 → 首条）。 */
export function resolveActiveEntry(
  list: TimelineEntry[],
  activeId: string | null
): TimelineEntry | null {
  if (list.length === 0) return null
  if (activeId && list.some((entry) => entry.id === activeId)) {
    return list.find((entry) => entry.id === activeId) ?? list[0]
  }
  return list[0]
}
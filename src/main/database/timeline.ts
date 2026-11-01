import { getDb } from './index'
import { getSetting, setSetting, deleteSetting } from './settings'
import { listBooks } from './books'
import { DEFAULT_TIMELINE_ORIGIN } from './books'

/** 时间线（多起点 / 多 origin 集合）数据层 helper。
 *
 * 存储约定（settings JSON）：
 * - 列表键：`timeline:list:<bookId>` → JSON 数组 `TimelineEntry[]`：`{ id, name, origin }`
 * - 选中键：`timeline:active:<bookId>` → 选中 id 字符串
 * - 默认时间线 id：`'default'`，名称 / origin 默认均为空串（展示层 i18n 兜底，不落中文）
 *
 * 老键 `timeline:origin:<bookId>` 仅用于 migration：首次运行时迁入新列表（id='default'）并删除老键。
 */

/** 默认时间线 id。 */
export const DEFAULT_TIMELINE_ID = 'default'

/** 默认时间线名称：空串（展示层以 i18n `timeline.defaultName` 兜底）。 */
export const DEFAULT_TIMELINE_NAME = ''

/** 时间线条目。 */
export interface TimelineEntry {
  id: string
  name: string
  origin: string
}

/** 按书列表 settings 键。 */
export function timelineListKey(bookId: string): string {
  return `timeline:list:${bookId}`
}

/** 按书选中 id settings 键。 */
export function timelineActiveKey(bookId: string): string {
  return `timeline:active:${bookId}`
}

/** 老起点 settings 键（仅 migration / 清理使用）。 */
export function timelineOriginKey(bookId: string): string {
  return `timeline:origin:${bookId}`
}

/** 全局 migration 守卫键。 */
export function timelineMigratedGuardKey(): string {
  return 'timeline:migrated:v1'
}

/** settings 存值是否有效（非空字符串）。 */
function isStoredOrigin(value: string | null): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 归一化单条目：非法元素丢弃。 */
function normalizeEntry(raw: unknown): TimelineEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === 'string' && obj.id.trim() !== '' ? obj.id.trim() : null
  const name = typeof obj.name === 'string' ? obj.name : ''
  const origin = typeof obj.origin === 'string' ? obj.origin : ''
  if (id === null) return null
  return { id, name: name === '' ? DEFAULT_TIMELINE_NAME : name, origin }
}

/** 解析列表 JSON；非法 / 空 → []。 */
export function parseTimelineList(raw: string | null): TimelineEntry[] {
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const result: TimelineEntry[] = []
    for (const item of parsed) {
      const entry = normalizeEntry(item)
      if (entry) result.push(entry)
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

/** 默认时间线条目。 */
export function defaultTimelineEntry(origin: string = DEFAULT_TIMELINE_ORIGIN): TimelineEntry {
  return { id: DEFAULT_TIMELINE_ID, name: DEFAULT_TIMELINE_NAME, origin }
}

/** 迁移 / 初始化单书时间线列表（幂等）。
 *
 * - 若 `timeline:list:<bookId>` 已存在：仅校正选中 id（缺/非法 → 首条）；
 * - 否则：若存在老键 `timeline:origin:<bookId>`，将其 origin 迁入新列表（id='default'），
 *   并删除老键；否则用默认条目。同时写选中 id='default'。
 * 失败时事务回滚且不置键。
 */
export function ensureTimelineList(bookId: string): { list: TimelineEntry[]; activeId: string } {
  const listKey = timelineListKey(bookId)
  const activeKey = timelineActiveKey(bookId)

  let list = parseTimelineList(getSetting(listKey))
  let activeId = getSetting(activeKey)

  if (list.length === 0) {
    const oldOrigin = getSetting(timelineOriginKey(bookId))
    const origin = isStoredOrigin(oldOrigin) ? oldOrigin.trim() : DEFAULT_TIMELINE_ORIGIN
    list = [defaultTimelineEntry(origin)]
    activeId = DEFAULT_TIMELINE_ID

    const db = getDb()
    db.transaction(() => {
      setSetting(listKey, serializeTimelineList(list))
      setSetting(activeKey, activeId as string)
      if (oldOrigin !== null) {
        deleteSetting(timelineOriginKey(bookId))
      }
      setSetting(`timeline:migrated:${bookId}`, '1')
    })()
  } else {
    if (!activeId || !list.some((entry) => entry.id === activeId)) {
      activeId = list[0].id
      setSetting(activeKey, activeId)
    }
  }

  return { list, activeId: activeId as string }
}

/** 全库 migration：遍历所有书，幂等初始化时间线列表。 */
export function migrateAllTimelines(): void {
  for (const book of listBooks()) {
    ensureTimelineList(book.id)
  }
  setSetting(timelineMigratedGuardKey(), '1')
}

/** 读取当前选中时间线的 origin（回退默认）。 */
export function getActiveOrigin(bookId: string): string {
  const { list, activeId } = ensureTimelineList(bookId)
  const entry = list.find((item) => item.id === activeId) ?? list[0]
  const origin = entry?.origin ?? ''
  return isStoredOrigin(origin) ? origin.trim() : DEFAULT_TIMELINE_ORIGIN
}

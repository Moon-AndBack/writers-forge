/**
 * 独立时间线模块 · 起点 / 时间线键工具（渲染层）。
 *
 * 多时间线数据层（批1）：
 * - 列表键：`timeline:list:<bookId>` → JSON 数组 `TimelineEntry[]`：`{ id, name, origin, description, descriptionJson? }`
 * - 选中键：`timeline:active:<bookId>` → 选中 id 字符串
 * - 老键 `timeline:origin:<bookId>` 仅 migration 兼容；新代码读写新键。
 *
 * - 按书隔离；无 bookId 时回退裸键（预览 / 无书上下文兜底）；
 * - 读不到（null / 空白 / 非法）一律回退调用方经 `t('originDefault')` 显示的默认值。
 */

import { plainTextToDocJson } from '../../../../../shared/richTextDoc'

/** 默认时间线 id。 */
export const DEFAULT_TIMELINE_ID = 'default'

/**
 * 时间线条目（渲染层）。主进程 `TimelineEntry` 只读 `id` / `name` / `origin`；
 * `description` / `descriptionJson` 为渲染层扩展字段（起点描述），由本模块解析 / 序列化。
 *
 * 双字段口径（与 `plot_scenes` / `foreshadows` 一致）：
 * - `descriptionJson`：整条块级 Tiptap JSON 串（富文本真源）；
 * - `description`：派生纯文本摘要（中栏卡片 / 列表展示用），保存时由编辑器归一值回写。
 */
export interface TimelineEntry {
  id: string
  name: string
  origin: string
  /** 起点描述（派生纯文本）；老数据缺失 → `''`。 */
  description: string
  /** 起点描述富文本（Tiptap JSON 串）；老数据缺失 → 读侧经 `resolveEntryDescriptionJson` 兜底。 */
  descriptionJson?: string
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
      // 向后兼容：老数据无 `description`（或非字符串）→ 空串，不丢弃条目。
      const description = typeof obj.description === 'string' ? obj.description : ''
      // 富文本起点描述：老数据缺失 / 非字符串 → 不写入（读侧由下方兜底函数补齐）。
      const descriptionJson =
        typeof obj.descriptionJson === 'string' ? obj.descriptionJson : undefined
      result.push({
        id,
        name,
        origin,
        description,
        ...(descriptionJson === undefined ? {} : { descriptionJson })
      })
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

/**
 * 读侧兜底：取条目的起点描述富文本（与 `resolveForeshadowDescriptionJson` 同口径）。
 *
 * - `descriptionJson` 非空且**可解析** → 原样使用（富文本真源）；
 * - 否则（老数据缺失 / 空串 / 坏 JSON）→ 用共享纯函数 `plainTextToDocJson(description)`
 *   把派生纯文本按行包成合法文档；
 * - 纯空白 / 空描述 → `null`（空正文口径，与 `ShortRichTextField.initialJson` 一致）。
 *
 * ⚠️ 右栏的 `initialJson` 与脏态基线**必须**都经本函数得到，否则老数据首帧会假 dirty。
 */
export function resolveEntryDescriptionJson(entry: TimelineEntry): string | null {
  const raw = entry.descriptionJson?.trim() ?? ''
  if (raw !== '') {
    try {
      JSON.parse(raw)
      return raw
    } catch {
      // 坏 JSON：落回纯文本摘要兜底（不因脏数据打不开右栏）。
    }
  }
  const fallback = plainTextToDocJson(entry.description)
  return fallback === '' ? null : fallback
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

import { useCallback, useEffect, useState } from 'react'
import {
  parseTimelineList,
  serializeTimelineList,
  timelineActiveKey,
  timelineListKey,
  type TimelineEntry
} from './timelineOrigin'

/** 缺省时间线名称：留空，由展示层经 `t('timeline.defaultName')` 兜底（不落库中文默认名）。 */
const DEFAULT_TIMELINE_NAME = ''

export interface TimelineWorkspace {
  /** 全书时间线列表（settings JSON）。 */
  list: TimelineEntry[]
  /** 当前选中时间线 id。 */
  activeId: string | null
  /** 当前选中时间线条目。 */
  activeEntry: TimelineEntry | null
  /** 当前选中时间线的 origin（可能为空 → 由消费方回退默认）。 */
  origin: string
  /** 是否已完成首读。 */
  loaded: boolean
  /** 切换选中时间线（写 `timeline:active:<bookId>`）。 */
  selectTimeline: (id: string) => void
  /** 新建时间线（追加并选中；name 为空 → 空名，展示层经 `t('timeline.defaultName')` 兜底）。 */
  createTimeline: (name: string, origin?: string) => Promise<TimelineEntry | null>
  /** 编辑当前选中时间线的 origin 并写回列表。 */
  updateOrigin: (origin: string) => void
  /** 重新读取。 */
  reload: () => void
}

export function useTimelineWorkspace(bookId: string): TimelineWorkspace {
  const [list, setList] = useState<TimelineEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const listKey = timelineListKey(bookId)
  const activeKey = timelineActiveKey(bookId)

  const load = useCallback(async () => {
    const [listRaw, activeRaw] = await Promise.all([
      window.api?.settings.get(listKey),
      window.api?.settings.get(activeKey)
    ])
    let parsed = parseTimelineList(listRaw ?? null)
    let active = activeRaw ?? null

    if (parsed.length === 0) {
      const entry: TimelineEntry = { id: 'default', name: DEFAULT_TIMELINE_NAME, origin: '' }
      parsed = [entry]
      active = 'default'
      await window.api?.settings.set(listKey, serializeTimelineList(parsed))
      await window.api?.settings.set(activeKey, active)
    } else if (!active || !parsed.some((entry) => entry.id === active)) {
      active = parsed[0].id
      await window.api?.settings.set(activeKey, active)
    }

    setList(parsed)
    setActiveId(active)
    setLoaded(true)
  }, [listKey, activeKey])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await load()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const selectTimeline = useCallback(
    (id: string) => {
      setActiveId(id)
      void window.api?.settings.set(activeKey, id)
      // 切换后同步刷新列表，保证 origin 由最新数据派生（避免列表过期导致 origin 卡死）。
      void (async () => {
        try {
          const listRaw = await window.api?.settings.get(listKey)
          const parsed = parseTimelineList(listRaw ?? null)
          if (parsed.length > 0) setList(parsed)
        } catch {
          // 忽略读取失败，保留现有列表
        }
      })()
    },
    [activeKey, listKey]
  )

  const createTimeline = useCallback(
    async (name: string, origin?: string): Promise<TimelineEntry | null> => {
      const entryName = name.trim() !== '' ? name.trim() : DEFAULT_TIMELINE_NAME
      const entryOrigin = origin && origin.trim() !== '' ? origin.trim() : ''
      const id = `tl_${Date.now()}`
      const newEntry: TimelineEntry = { id, name: entryName, origin: entryOrigin }
      const nextList = [...list, newEntry]
      setList(nextList)
      setActiveId(id)
      await window.api?.settings.set(listKey, serializeTimelineList(nextList))
      await window.api?.settings.set(activeKey, id)
      return newEntry
    },
    [list, listKey, activeKey]
  )

  const updateOrigin = useCallback(
    (origin: string) => {
      if (activeId === null) return
      const next = list.map((entry) => (entry.id === activeId ? { ...entry, origin } : entry))
      setList(next)
      void window.api?.settings.set(listKey, serializeTimelineList(next))
    },
    [list, activeId, listKey]
  )

  const activeEntry =
    (activeId !== null ? list.find((entry) => entry.id === activeId) : null) ??
    (list.length > 0 ? list[0] : null) ??
    null
  const origin = activeEntry?.origin ?? ''

  return {
    list,
    activeId,
    activeEntry,
    origin,
    loaded,
    selectTimeline,
    createTimeline,
    updateOrigin,
    reload: load
  }
}

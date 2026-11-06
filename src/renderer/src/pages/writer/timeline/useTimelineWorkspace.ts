import { useCallback, useEffect, useState } from 'react'
import {
  parseTimelineList,
  resolveActiveEntry,
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
  /** 当前选中时间线的起点描述（可能为空）。 */
  description: string
  /** 是否已完成首读。 */
  loaded: boolean
  /** 切换选中时间线（写 `timeline:active:<bookId>`）。 */
  selectTimeline: (id: string) => void
  /** 新建时间线（追加并选中；name 为空 → 空名，展示层经 `t('timeline.defaultName')` 兜底）。 */
  createTimeline: (name: string, description?: string) => Promise<TimelineEntry | null>
  /**
   * 更新**当前选中时间线**的起点描述（只改对应条目，其余条目原样写回）。
   * 起点时间（origin）固定不可编辑；写入成功后同步列表态；返回是否落库成功。
   */
  updateDescription: (description: string) => Promise<boolean>
  /**
   * 重命名指定时间线：读磁盘最新列表 → 只改目标条目的 `name` → 原样写回。
   * 空名回退默认空名（展示层经 `t('timeline.defaultName')` 兜底）；返回是否落库成功。
   */
  renameTimeline: (id: string, name: string) => Promise<boolean>
  /**
   * 删除指定时间线：读磁盘最新列表 → 移除目标条目 → 原样写回。
   * 至少保留一条（删最后一条返回 false）；删的是当前选中项时 active 切到剩余第一条。
   */
  removeTimeline: (id: string) => Promise<boolean>
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
      const entry: TimelineEntry = {
        id: 'default',
        name: DEFAULT_TIMELINE_NAME,
        origin: '',
        description: ''
      }
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
    async (name: string, description?: string): Promise<TimelineEntry | null> => {
      const entryName = name.trim() !== '' ? name.trim() : DEFAULT_TIMELINE_NAME
      const entryDescription = description && description.trim() !== '' ? description.trim() : ''
      const id = `tl_${Date.now()}`
      // origin 固定空串（展示层回退「元年」）；新建时填的是起点描述。
      const newEntry: TimelineEntry = {
        id,
        name: entryName,
        origin: '',
        description: entryDescription
      }
      const nextList = [...list, newEntry]
      setList(nextList)
      setActiveId(id)
      await window.api?.settings.set(listKey, serializeTimelineList(nextList))
      await window.api?.settings.set(activeKey, id)
      return newEntry
    },
    [list, listKey, activeKey]
  )

  // 起点描述保存：先按磁盘最新列表做读-改-写，避免内存列表过期时覆盖其它时间线的改动；
  // 只替换当前选中条目的 `description`，其余条目（含固定 origin）原样写回。
  const updateDescription = useCallback(
    async (description: string): Promise<boolean> => {
      const listRaw = await window.api?.settings.get(listKey)
      const current = parseTimelineList(listRaw ?? null)
      const base = current.length > 0 ? current : list
      const target = resolveActiveEntry(base, activeId)
      if (target === null) return false
      const nextDescription = description.trim()
      const nextList = base.map((entry) =>
        entry.id === target.id ? { ...entry, description: nextDescription } : entry
      )
      try {
        await window.api?.settings.set(listKey, serializeTimelineList(nextList))
        setList(nextList)
        return true
      } catch {
        return false
      }
    },
    [activeId, list, listKey]
  )

  const activeEntry =
    (activeId !== null ? list.find((entry) => entry.id === activeId) : null) ??
    (list.length > 0 ? list[0] : null) ??
    null
  const origin = activeEntry?.origin ?? ''
  const description = activeEntry?.description ?? ''

  // 重命名：与 `updateDescription` 同款「磁盘最新列表 → 读-改-写」，避免内存列表过期时
  // 覆盖其它条目的改动；只替换目标条目的 `name`，空名回退默认空名（展示层兜底）。
  const renameTimeline = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const listRaw = await window.api?.settings.get(listKey)
      const current = parseTimelineList(listRaw ?? null)
      const base = current.length > 0 ? current : list
      if (!base.some((entry) => entry.id === id)) return false
      const nextName = name.trim() !== '' ? name.trim() : DEFAULT_TIMELINE_NAME
      const nextList = base.map((entry) => (entry.id === id ? { ...entry, name: nextName } : entry))
      try {
        await window.api?.settings.set(listKey, serializeTimelineList(nextList))
        setList(nextList)
        return true
      } catch {
        return false
      }
    },
    [list, listKey]
  )

  // 删除：至少保留一条（删最后一条直接拒绝）；删的是当前选中项时把 active 切到剩余第一条，
  // 并同步写回 `timeline:active:<bookId>`（被删条目的选中键不会残留）。
  const removeTimeline = useCallback(
    async (id: string): Promise<boolean> => {
      const listRaw = await window.api?.settings.get(listKey)
      const current = parseTimelineList(listRaw ?? null)
      const base = current.length > 0 ? current : list
      if (base.length <= 1) return false
      if (!base.some((entry) => entry.id === id)) return false
      const nextList = base.filter((entry) => entry.id !== id)

      const activeRaw = await window.api?.settings.get(activeKey)
      const currentActive = activeRaw ?? activeId
      const nextActive =
        currentActive !== null && nextList.some((entry) => entry.id === currentActive)
          ? currentActive
          : nextList[0].id
      try {
        await window.api?.settings.set(listKey, serializeTimelineList(nextList))
        if (nextActive !== currentActive) {
          await window.api?.settings.set(activeKey, nextActive)
          setActiveId(nextActive)
        }
        setList(nextList)
        return true
      } catch {
        return false
      }
    },
    [activeId, activeKey, list, listKey]
  )

  return {
    list,
    activeId,
    activeEntry,
    origin,
    description,
    loaded,
    selectTimeline,
    createTimeline,
    updateDescription,
    renameTimeline,
    removeTimeline,
    reload: load
  }
}

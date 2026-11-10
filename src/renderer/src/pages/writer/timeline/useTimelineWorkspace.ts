import { useCallback, useEffect, useState } from 'react'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
import {
  parseTimelineList,
  resolveActiveEntry,
  resolveEntryDescriptionJson,
  serializeTimelineList,
  timelineActiveKey,
  timelineListKey,
  type TimelineEntry
} from './timelineOrigin'
import { countPlotLinesByTimeline } from './timelinePlotCounts'

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
  /** 当前选中时间线的起点卡片标题（可能为空 → 由消费方回退 `t('originTitle')`）。 */
  originName: string
  /** 当前选中时间线的起点描述（派生纯文本，供中栏展示；可能为空）。 */
  description: string
  /** 当前选中时间线的起点描述富文本（Tiptap JSON 串；老数据已经读侧兜底派生，无描述为 `''`）。 */
  descriptionJson: string
  /** 是否已完成首读。 */
  loaded: boolean
  /** 切换选中时间线（写 `timeline:active:<bookId>`）。 */
  selectTimeline: (id: string) => void
  /** 新建时间线（追加并选中；name 为空 → 空名，展示层经 `t('timeline.defaultName')` 兜底）。 */
  createTimeline: (name: string, description?: RichTextBodyValue) => Promise<TimelineEntry | null>
  /**
   * 更新**当前选中时间线**的起点描述（只改对应条目，其余条目原样写回）。
   * 入参为编辑器归一值：同时写 `description`（派生纯文本）与 `descriptionJson`（富文本真源）；
   * 起点时间（origin）固定不可编辑；写入成功后同步列表态；返回是否落库成功。
   */
  updateDescription: (value: RichTextBodyValue) => Promise<boolean>
  /**
   * 重命名指定时间线：读磁盘最新列表 → 只改目标条目的 `name` → 原样写回。
   * 空名回退默认空名（展示层经 `t('timeline.defaultName')` 兜底）；返回是否落库成功。
   */
  renameTimeline: (id: string, name: string) => Promise<boolean>
  /**
   * 重命名起点卡标题：读磁盘最新列表 → 只改目标条目的 `originName` → 原样写回。
   * 空名（trim 后为空）落空串，展示层回退 `t('originTitle')`；返回是否落库成功。
   */
  renameOrigin: (id: string, name: string) => Promise<boolean>
  /**
   * 删除指定时间线：读磁盘最新列表 → 移除目标条目 → 原样写回。
   * 至少保留一条（删最后一条返回 false）；该时间线下仍有剧情线时拒绝删除（返回 false，
   * 不写库——否则剧情线会因时间线消失而在界面上「凭空不见」）；删的是当前选中项时
   * active 切到剩余第一条。
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
        originName: '',
        description: '',
        // 显式写空富文本：与保存路径的「双列」口径一致（读侧仍可兜底老数据）。
        descriptionJson: ''
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
    async (name: string, description?: RichTextBodyValue): Promise<TimelineEntry | null> => {
      const entryName = name.trim() !== '' ? name.trim() : DEFAULT_TIMELINE_NAME
      // 新建弹窗已产出富文本归一值：`text` 与 `json` 一并按「双列」写入；
      // 未提供（缺省）时按空文档写空串（读侧仍可对老数据兜底派生）。
      const entryDescription = description?.text.trim() ?? ''
      const entryDescriptionJson = description?.json ?? ''
      const id = `tl_${Date.now()}`
      // origin 固定空串（展示层回退「元年」）；新建时填的是起点描述。
      const newEntry: TimelineEntry = {
        id,
        name: entryName,
        origin: '',
        originName: '',
        description: entryDescription,
        descriptionJson: entryDescriptionJson
      }
      // 与 `updateDescription` / `renameTimeline` 同款「磁盘最新列表 → 改 → 写回」：以磁盘为准，
      // 避免内存列表过期时覆盖其它已落库的条目；磁盘为空时回退内存列表。
      let base: TimelineEntry[]
      try {
        const listRaw = await window.api?.settings.get(listKey)
        const current = parseTimelineList(listRaw ?? null)
        base = current.length > 0 ? current : list
      } catch {
        return null
      }
      const nextList = [...base, newEntry]

      // 顺序固定：先写列表（条目存在才允许被选中），成功后再写 active。
      try {
        await window.api?.settings.set(listKey, serializeTimelineList(nextList))
      } catch {
        return null
      }
      try {
        await window.api?.settings.set(activeKey, id)
      } catch {
        // active 写失败 → **回滚列表**到写入前的基线，保证 active 不会指向不存在的 id；
        // 若回滚也失败（磁盘异常），active 仍是旧值（本次未写成），列表多出一个未被选中的
        // 孤儿条目，由 `load()` 的 ensureTimelineList 自愈，不会造成悬空引用。
        try {
          await window.api?.settings.set(listKey, serializeTimelineList(base))
        } catch {
          // 忽略二次失败：内存态保持原值，不误导 UI。
        }
        return null
      }

      // 两次写入都成功后才同步内存态，避免失败时 UI 出现「已新建并切换」的假象。
      setList(nextList)
      setActiveId(id)
      return newEntry
    },
    [list, listKey, activeKey]
  )

  // 起点描述保存：先按磁盘最新列表做读-改-写，避免内存列表过期时覆盖其它时间线的改动；
  // 只替换当前选中条目的描述两列（`description` 派生纯文本 + `descriptionJson` 富文本真源），
  // 其余条目（含固定 origin）原样写回。
  const updateDescription = useCallback(
    async (value: RichTextBodyValue): Promise<boolean> => {
      const listRaw = await window.api?.settings.get(listKey)
      const current = parseTimelineList(listRaw ?? null)
      const base = current.length > 0 ? current : list
      const target = resolveActiveEntry(base, activeId)
      if (target === null) return false
      const nextDescription = value.text.trim()
      const nextDescriptionJson = value.json ?? ''
      const nextList = base.map((entry) =>
        entry.id === target.id
          ? { ...entry, description: nextDescription, descriptionJson: nextDescriptionJson }
          : entry
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
  const originName = activeEntry?.originName ?? ''
  const description = activeEntry?.description ?? ''
  // 中栏元年卡与右栏同源口径：老数据只有 `description`（无 `descriptionJson`）时，
  // 读侧经共享纯函数派生成文档，避免「描述还在、中栏却显示故事开始了」的假空态。
  const descriptionJson =
    activeEntry === null ? '' : (resolveEntryDescriptionJson(activeEntry) ?? '')

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

  // 起点卡标题重命名：与 `renameTimeline` 同款「磁盘最新列表 → 读-改-写」，只替换目标条目的
  // `originName`（trim 后空串即清空，展示层回退「起点」），不改 `origin` 时间语义。
  const renameOrigin = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const listRaw = await window.api?.settings.get(listKey)
      const current = parseTimelineList(listRaw ?? null)
      const base = current.length > 0 ? current : list
      if (!base.some((entry) => entry.id === id)) return false
      const nextOriginName = name.trim()
      const nextList = base.map((entry) =>
        entry.id === id ? { ...entry, originName: nextOriginName } : entry
      )
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

  // 删除：至少保留一条（删最后一条直接拒绝）；写库前兜底查询该时间线是否仍被剧情线引用
  // （有引用则拒绝，避免绕过 UI 造成剧情线「消失」）；删的是当前选中项时把 active 切到
  // 剩余第一条，并同步写回 `timeline:active:<bookId>`（被删条目的选中键不会残留）。
  const removeTimeline = useCallback(
    async (id: string): Promise<boolean> => {
      const listRaw = await window.api?.settings.get(listKey)
      const current = parseTimelineList(listRaw ?? null)
      const base = current.length > 0 ? current : list
      if (base.length <= 1) return false
      if (!base.some((entry) => entry.id === id)) return false
      // 兜底与左栏禁用共用同一聚合口径（`countPlotLinesByTimeline`）：此处**实时查询**
      // 而非读 UI 计数 Map，避免计数过期放行删除；查询失败一律不写库（安全优先）。
      try {
        const lines = await window.api?.plot.listLines(bookId)
        if (!lines) return false
        if ((countPlotLinesByTimeline(lines).get(id) ?? 0) > 0) return false
      } catch {
        return false
      }
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
    [activeId, activeKey, bookId, list, listKey]
  )

  return {
    list,
    activeId,
    activeEntry,
    origin,
    originName,
    description,
    descriptionJson,
    loaded,
    selectTimeline,
    createTimeline,
    updateDescription,
    renameTimeline,
    renameOrigin,
    removeTimeline,
    reload: load
  }
}

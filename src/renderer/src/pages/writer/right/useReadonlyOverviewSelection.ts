/**
 * 右栏只读总览的「列表 → 详情」选中态（伏笔 / 灵感 / 实体三个页签共用，AGENTS §9）。
 *
 * 口径（与三处原实现一致，上提后行为不变）：
 * - `selectedId` 只在本栏内切换，选中项按 id 从**当前行数组派生**——行被删 / 刷新后
 *   `selectedRow` 自然回落 `null`，无需同步 effect 即自动回到列表；
 * - `listHidden` 供列表壳加 `hidden`：列表只隐藏、不卸载，返回时保留滚动位置；
 * - `select` / `back` 为稳定引用（`useCallback`），可安全进子组件依赖。
 */
import { useCallback, useMemo, useState } from 'react'

export interface ReadonlyOverviewSelection<T> {
  /** 当前选中行（列表派生；null = 未选中 / 行已不存在）。 */
  selectedRow: T | null
  /** 列表是否应隐藏（有选中行时为真，详情接管栏内空间）。 */
  listHidden: boolean
  /** 选中某行（进入详情）。 */
  select: (id: number) => void
  /** 返回列表（清空选中）。 */
  back: () => void
}

/**
 * 只读总览的选中态。
 *
 * @param rows 当前可用的行数组（顺序即后端顺序；换书 / 刷新后自动重算选中项）。
 */
export function useReadonlyOverviewSelection<T extends { id: number }>(
  rows: readonly T[]
): ReadonlyOverviewSelection<T> {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selectedRow = useMemo(
    () => (selectedId === null ? null : (rows.find((row) => row.id === selectedId) ?? null)),
    [rows, selectedId]
  )
  const select = useCallback((id: number): void => setSelectedId(id), [])
  const back = useCallback((): void => setSelectedId(null), [])
  return { selectedRow, listHidden: selectedRow !== null, select, back }
}

export default useReadonlyOverviewSelection

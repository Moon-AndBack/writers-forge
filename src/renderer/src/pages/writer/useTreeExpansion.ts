/**
 * 左栏树「卷 / 分组」展开态（通用，§9 禁止平行实现）。
 *
 * 状态模型为**白名单**：`openKeys` 只记录已展开的 key，默认空集 = 全部收起。
 * （旧黑名单 `closedKeys` 下新出现的卷 key 会自动展开，与「默认折叠」冲突，故反转。）
 *
 * 三处树共用本 hook：章节卷（`v{id}`）、大纲正文卷（`v{id}`）、大纲分组（`g{id}`）。
 * - `isOpen` / `toggle` / `open` / `openMany`：用户手动展开态，会话内保留；
 * - `seedOnce`：数据**首次就绪**时播种一次（仅展开当前编辑项所属卷 / 分组）；
 *   之后 rename / reorder / 正文刷新带来的数据变化不再重复播种，避免覆盖用户操作；
 * - `bookId` 变化（切书）时重置白名单并允许重新播种；面板层同时以 `key={bookId}`
 *   强制重挂载，双保险。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/** 树展开态读写接口（可整体透传给子级列表，避免再持一套状态）。 */
export interface TreeExpansion {
  /** 该 key 当前是否展开。 */
  isOpen: (key: string) => boolean
  /** 手动切换展开 / 收起。 */
  toggle: (key: string) => void
  /** 展开单项（已展开则无副作用）。 */
  open: (key: string) => void
  /** 批量展开。 */
  openMany: (keys: readonly string[]) => void
  /** 首次数据就绪时播种展开项（仅生效一次）。 */
  seedOnce: (keys: readonly string[]) => void
}

export function useTreeExpansion(bookId?: string): TreeExpansion {
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(() => new Set<string>())
  // 是否已播种（ref 不触发渲染；切书时重置）。
  const seeded = useRef(false)
  const currentBook = useRef(bookId)

  useEffect(() => {
    if (currentBook.current === bookId) return
    currentBook.current = bookId
    seeded.current = false
    setOpenKeys(new Set<string>())
  }, [bookId])

  const isOpen = useCallback((key: string): boolean => openKeys.has(key), [openKeys])

  const toggle = useCallback((key: string): void => {
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const open = useCallback((key: string): void => {
    setOpenKeys((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])

  const openMany = useCallback((keys: readonly string[]): void => {
    setOpenKeys((prev) => {
      if (keys.every((key) => prev.has(key))) return prev
      const next = new Set(prev)
      for (const key of keys) next.add(key)
      return next
    })
  }, [])

  const seedOnce = useCallback((keys: readonly string[]): void => {
    if (seeded.current) return
    seeded.current = true
    setOpenKeys(new Set(keys))
  }, [])

  return { isOpen, toggle, open, openMany, seedOnce }
}

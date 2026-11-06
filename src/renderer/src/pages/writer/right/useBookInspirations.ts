/**
 * 章节模块右栏「灵感」页签的数据 hook：拉**全书**灵感（纯只读、不分组）。
 *
 * 口径：
 * - **数据源**：`inspiration.list(bookId)`（后端顺序 `updated_at DESC, id DESC`，
 *   与灵感模块列表一致），只在 `active` 为真时发起请求（惰性加载）；`active` 变假时
 *   只失效在途请求，**不清空**已加载行——再次切回页签可直接显示上次结果，随后静默刷新；
 * - **不接筛选**：活动栏的标签 / 关键词筛选是灵感模块自己的焦点，本页签固定显示全书；
 * - **竞态**：每轮请求带自增 `seq`，乱序 / 过期响应一律丢弃；卸载、切走页签或重新
 *   加载时递增序号使在途响应作废；
 * - **换书**：返回值按 `bookId` 隔离，换书瞬间不把上一本书的列表短暂套到新书上；
 * - **失败**：`loadError` 仅在「当前书 + 无可用数据」时暴露给空态（有旧数据时保留旧
 *   列表），`reload()` 供失败态手动重试。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { InspirationRow } from '../inspiration/inspirationTree'

export interface BookInspirations {
  /** 全书未删除灵感（后端已按最近编辑倒序；换书瞬间为空数组）。 */
  rows: InspirationRow[]
  /** 是否有在途请求（列表非空时不闪加载态）。 */
  loading: boolean
  /** 当前书读取是否失败（仅列表为空时用于失败态）。 */
  loadError: boolean
  /** 重新拉取（失败态「重试」/ 面板外部触发）。 */
  reload: () => void
}

interface BookInspirationsState {
  bookId: string
  rows: InspirationRow[]
  loadError: boolean
}

/** 无数据时的恒等空数组（换书瞬间复用，引用稳定）。 */
const EMPTY_ROWS: InspirationRow[] = []

/**
 * 拉全书灵感。`bookId` 为空或页签未激活时不发请求。
 */
export function useBookInspirations(bookId: string, active: boolean): BookInspirations {
  const [state, setState] = useState<BookInspirationsState>({
    bookId: '',
    rows: [],
    loadError: false
  })
  const [loading, setLoading] = useState(false)
  // 请求序号：仅最新一轮结果可写回（丢弃乱序 / 过期响应）。
  const seqRef = useRef(0)
  // 手动重试键：`reload()` 递增即重跑加载 effect。
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!active || bookId === '') return

    const load = (): void => {
      const seq = ++seqRef.current
      setLoading(true)
      void window.api.inspiration
        .list(bookId)
        .then((next) => {
          if (seq !== seqRef.current) return
          setState({ bookId, rows: next, loadError: false })
          setLoading(false)
        })
        .catch(() => {
          if (seq !== seqRef.current) return
          // 保留上一轮成功数据（同书）；换书后失败则落空列表 + 失败态。
          setState((prev) =>
            prev.bookId === bookId
              ? { ...prev, loadError: true }
              : { bookId, rows: [], loadError: true }
          )
          setLoading(false)
        })
    }

    load()
    return () => {
      // 失效在途请求；rows 保留（见文件头：切走页签不清空）。
      seqRef.current += 1
    }
  }, [bookId, active, reloadKey])

  const reload = useCallback((): void => setReloadKey((key) => key + 1), [])

  const sameBook = state.bookId === bookId
  return {
    rows: sameBook ? state.rows : EMPTY_ROWS,
    loading,
    loadError: sameBook && state.loadError,
    reload
  }
}

export default useBookInspirations

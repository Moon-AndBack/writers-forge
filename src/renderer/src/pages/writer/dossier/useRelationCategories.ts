/**
 * 关系弹窗「类别」下拉的数据源：**本书分类表**（`worldSubtype:list`）。
 *
 * 为什么不用候选实体反推类别：分类表才是子类唯一真源。按实体反推只能列出「已有实体
 * 落在其中」的类别，角色模块四位分类里没人物的类别（如尚未建反派）就不会出现在下拉里，
 * 与「类别 → 项目」三级联动语义不符。这里按书一次性拉全量分类，按当前目标模块的
 * `entityType` 过滤后交给 `useRelationDraft` 排序展示。
 */
import { useEffect, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { WorldSubtypeRow } from '../../../../../preload/types/worldSubtype'

const log = createLogger('dossier')

/** 稳定空数组：未加载 / 切换书籍时复用，避免每次渲染新建引用。 */
const EMPTY_SUBTYPES: WorldSubtypeRow[] = []

/** 按书标记的分类态：切书后旧数据自然失效，无需在 effect 里同步清空。 */
interface CategoriesState {
  bookId: string
  rows: WorldSubtypeRow[]
}

/** 拉取本书全量未删除子类分类（按 `sort_order, id` 排序，由 IPC 保证）。 */
export function useRelationCategories(bookId: string): WorldSubtypeRow[] {
  const [state, setState] = useState<CategoriesState | null>(null)

  useEffect(() => {
    if (bookId === '') return undefined
    const api = window.api?.worldSubtype
    if (!api) return undefined
    let cancelled = false
    void (async () => {
      try {
        const rows = await api.list(bookId)
        if (cancelled) return
        setState({ bookId, rows })
      } catch (error) {
        log.warn('关系类别候选加载失败', error)
        if (!cancelled) setState({ bookId, rows: EMPTY_SUBTYPES })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId])

  return state !== null && state.bookId === bookId ? state.rows : EMPTY_SUBTYPES
}

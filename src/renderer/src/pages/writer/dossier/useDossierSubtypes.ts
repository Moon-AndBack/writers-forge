/**
 * 活动栏「模块筛选」面板的子类数据源：本书分类表（`worldSubtype:list`），按实体类型过滤。
 *
 * 只读取数，不含新增 / 删除分类的写入口——那是 `SubTypeSelect` 的职责；筛选只需选项，
 * 不为复用整套选择器而把写 UI 拖进面板（§9：差异经 props / 独立职责表达）。
 * 范式同 `useRelationCategories`：状态按「书 + 实体类型」打标，切换后旧数据自然失效。
 */
import { useEffect, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { WorldEntityType } from '../../../../../preload/types/worldEntity'
import type { WorldSubtypeRow } from '../../../../../preload/types/worldSubtype'

const log = createLogger('dossier')

/** 稳定空数组：未加载 / 切换书或域时复用，避免每次渲染新建引用。 */
const EMPTY_SUBTYPES: WorldSubtypeRow[] = []

interface SubtypesState {
  bookId: string
  entityType: WorldEntityType
  rows: WorldSubtypeRow[]
}

/** 拉取当前书 + 当前实体类型的未删除子类分类（`sort_order, id` 由 IPC 保证）。 */
export function useDossierSubtypes(bookId: string, entityType: WorldEntityType): WorldSubtypeRow[] {
  const [state, setState] = useState<SubtypesState | null>(null)

  useEffect(() => {
    if (bookId === '') return undefined
    const api = window.api?.worldSubtype
    if (!api) return undefined
    let cancelled = false
    void (async () => {
      try {
        const rows = await api.list(bookId, entityType)
        if (cancelled) return
        setState({ bookId, entityType, rows })
      } catch (error) {
        log.warn('筛选子类加载失败', error)
        if (!cancelled) setState({ bookId, entityType, rows: EMPTY_SUBTYPES })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId, entityType])

  return state !== null && state.bookId === bookId && state.entityType === entityType
    ? state.rows
    : EMPTY_SUBTYPES
}

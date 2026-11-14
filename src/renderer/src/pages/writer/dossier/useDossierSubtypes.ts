/**
 * 设定档案标题栏筛选行的分类数据源：本书分类表（`worldSubtype:list`），按实体类型过滤。
 *
 * 只读取数，不含新增 / 删除分类的写入口——那是 `SubTypeSelect` 的职责；筛选只需选项，
 * 不为复用整套选择器而把写 UI 拖进标题栏（§9：差异经 props / 独立职责表达）。
 * 范式同 `useRelationCategories`：状态按「书 + 实体类型」打标，切换后旧数据自然失效。
 *
 * `reload` 供筛选行在下拉打开前刷新：标题栏常驻不重挂载，分类可能在编辑弹窗里新增 /
 * 删除，模块重挂载只是保底。刷新期间保留旧选项，失败也不清空（避免筛选条件被误重置）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  /** 是否已完成一次成功拉取（失败保持 false，调用方据此决定要不要校验旧选项）。 */
  loaded: boolean
}

/** 筛选行读取的分类结果。 */
export interface DossierSubtypesResult {
  /** 当前书 + 实体类型的未删除分类（`sort_order, id` 由 IPC 保证）。 */
  rows: WorldSubtypeRow[]
  /** 是否已成功拉取过（加载中 / 失败为 false）。 */
  loaded: boolean
  /** 重新拉取（下拉打开前调用；失败保留旧选项）。 */
  reload: () => void
}

/**
 * 拉取当前书 + 当前实体类型的未删除子类分类（`sort_order, id` 由 IPC 保证）。
 * `entityType = null`（境界体系无分类）时不发起请求。
 */
export function useDossierSubtypes(
  bookId: string,
  entityType: WorldEntityType | null
): DossierSubtypesResult {
  const [state, setState] = useState<SubtypesState | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const reload = useCallback((): void => {
    setReloadToken((token) => token + 1)
  }, [])

  useEffect(() => {
    if (bookId === '' || entityType === null) return undefined
    const api = window.api?.worldSubtype
    if (!api) return undefined
    let cancelled = false
    void (async () => {
      try {
        const rows = await api.list(bookId, entityType)
        if (cancelled) return
        setState({ bookId, entityType, rows, loaded: true })
      } catch (error) {
        log.warn('筛选分类加载失败', error)
        // 失败保留已有选项：首次失败时没有可展示的分类，但也不把 loaded 置真，
        // 避免调用方把「拉取失败」误判为「分类全部被删」而重置筛选条件。
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId, entityType, reloadToken])

  return useMemo(() => {
    const current =
      state !== null && state.bookId === bookId && state.entityType === entityType ? state : null
    return current !== null
      ? { rows: current.rows, loaded: current.loaded, reload }
      : { rows: EMPTY_SUBTYPES, loaded: false, reload }
  }, [bookId, entityType, reload, state])
}

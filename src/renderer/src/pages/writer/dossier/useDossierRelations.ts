/**
 * 卡片铅笔编辑弹窗内「关联关系」区的数据装配。
 *
 * 为什么不能直接复用 `bundle.detail` / `bundle.incomingRelations`：这两项绑定在
 * **右栏选中行**（`activeId`）上，而弹窗可能是在未切换选中时打开的（避免触发
 * 右栏未保存草稿的切换守卫）。因此本 hook 按**弹窗正在编辑的实体 id** 独立
 * 拉取出边 / 入边；写操作仍复用 `DossierBundle` 的关系回调，走 workspace 的
 * 写链串行化（与名称 / 别名更新共用一条链），写后重拉本区数据。
 */
import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { DossierRelationInput, DossierRelationPatch, WorldRefRow } from './dossierTree'

const log = createLogger('dossier')

/** 稳定空数组（未加载 / 无数据时复用，避免每次渲染新建引用）。 */
const EMPTY_REFS: WorldRefRow[] = []

/** 关系写入动作（来自 `DossierBundle`，显式带源实体 id）。 */
export interface DossierRelationActions {
  onAdd: (id: number, input: DossierRelationInput) => void | Promise<void>
  onUpdate: (id: number, refId: number, patch: DossierRelationPatch) => void | Promise<void>
  onRemove: (id: number, refId: number) => void | Promise<void>
}

export interface DossierRelationsState {
  /** 当前实体的出边关系。 */
  relations: WorldRefRow[]
  /** 当前实体的入边关系（改类型 / 备注与删除同出边，均按 ref id 落库）。 */
  incoming: WorldRefRow[]
  /** 首次加载中。 */
  loading: boolean
  add: (input: DossierRelationInput) => Promise<void>
  /** 更新（出边 / 入边同一入口：`refId` 即 `world_refs.id`，与方向无关）。 */
  update: (refId: number, patch: DossierRelationPatch) => Promise<void>
  /** 删除（同上，入边删的也是对方发起的那一行）。 */
  remove: (refId: number) => Promise<void>
}

/** 读取实体出 / 入边（纯 IO，不写状态；挂载加载与写后重拉共用）。 */
async function loadRelations(
  entityId: number
): Promise<{ relations: WorldRefRow[]; incoming: WorldRefRow[] } | null> {
  const api = window.api?.worldEntity
  if (!api) return null
  const [relations, incoming] = await Promise.all([
    api.listRefs(entityId),
    api.listIncomingRefs(entityId)
  ])
  return { relations, incoming }
}

export function useDossierRelations(
  entityId: number,
  actions: DossierRelationActions
): DossierRelationsState {
  const { onAdd, onUpdate, onRemove } = actions
  const [relations, setRelations] = useState<WorldRefRow[]>(EMPTY_REFS)
  const [incoming, setIncoming] = useState<WorldRefRow[]>(EMPTY_REFS)
  // 无 preload API（纯浏览器预览）时没有可加载的数据，直接视为加载完成。
  const [loading, setLoading] = useState(() => window.api?.worldEntity !== undefined)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const result = await loadRelations(entityId)
      if (result !== null) {
        setRelations(result.relations)
        setIncoming(result.incoming)
      }
    } catch (error) {
      log.warn('设定档案关系加载失败', error)
    } finally {
      setLoading(false)
    }
  }, [entityId])

  // 弹窗按行挂载 / 卸载，编辑期间 `entityId` 不变；这里只承担首次加载，
  // 状态写入均在 `await` 之后（避免在 effect 体内同步 setState）。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const result = await loadRelations(entityId)
        if (cancelled) return
        if (result !== null) {
          setRelations(result.relations)
          setIncoming(result.incoming)
        }
      } catch (error) {
        log.warn('设定档案关系加载失败', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entityId])

  const add = useCallback(
    async (input: DossierRelationInput): Promise<void> => {
      await onAdd(entityId, input)
      await reload()
    },
    [entityId, onAdd, reload]
  )

  const update = useCallback(
    async (refId: number, patch: DossierRelationPatch): Promise<void> => {
      await onUpdate(entityId, refId, patch)
      await reload()
    },
    [entityId, onUpdate, reload]
  )

  const remove = useCallback(
    async (refId: number): Promise<void> => {
      await onRemove(entityId, refId)
      await reload()
    },
    [entityId, onRemove, reload]
  )

  return { relations, incoming, loading, add, update, remove }
}

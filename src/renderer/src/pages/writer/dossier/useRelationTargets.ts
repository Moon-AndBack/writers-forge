/**
 * 关系「关联对象」候选：**本书世界观 / 角色 / 势力 / 境界体系 / 物品功法五域的实体**
 * （跨模块），供新增关系的「模块 → 类别 → 可搜索项目组合框」使用。
 *
 * 为什么不复用 `bundle.rows`：那是**当前模块**的列表行，跨模块关系（如势力 →
 * 角色条目）取不到目标。这里按书拉一次全量列表（`worldEntity.list` 不传
 * `entityType`），只保留 `id / name / entityType / subType / subtypeId / presetKey` 六个字段——
 * 正文 / 别名 / 标签对大列表无意义，不进状态（配色取 `presetKey`，`subtypeId` 仅作保留字段）。
 *
 * 世界观与其它四域一样参与关联关系，因此全量保留；自身与已关联目标的排除依赖实体的
 * 出边关系，属调用方视图逻辑（关系变化即重算）。
 */
import { useEffect, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { WorldEntityType } from './dossierTree'

const log = createLogger('dossier')

/** 候选目标行（裁剪后的设定库列表行）。 */
export interface RelationTargetRow {
  id: number
  name: string
  entityType: WorldEntityType
  /** 子类展示名（未分类为空串）。 */
  subType: string
  /**
   * 子类分类外键（`world_subtypes.id`），`null` = 未分类；保留字段，下游仍携带，
   * 但不参与筛选 / 展示，关系胶囊配色已改用下方的 `presetKey`。
   */
  subtypeId: number | null
  /**
   * 子类预设路由键（`world_subtypes.preset_key`），空串 = 自定义分类或未分类；
   * 供关系胶囊按 23 个预设子类取独立颜色（自定义分类回落模块色）。
   */
  presetKey: string
}

export interface RelationTargetsState {
  /** 候选实体（五域全部，未加载 / 无书时为空数组）。 */
  targets: RelationTargetRow[]
  /** 是否仍在加载（无 preload API 时视为加载完成）。 */
  loading: boolean
}

/** 稳定空数组：未加载 / 切换书籍时复用，避免每次渲染新建引用。 */
const EMPTY_TARGETS: RelationTargetRow[] = []

/** 按书标记的候选态：切书后旧数据自然失效，无需在 effect 里同步清空。 */
interface TargetsState {
  bookId: string
  targets: RelationTargetRow[]
}
export function useRelationTargets(bookId: string): RelationTargetsState {
  const [state, setState] = useState<TargetsState | null>(null)

  useEffect(() => {
    if (bookId === '') return undefined
    const api = window.api?.worldEntity
    if (!api) return undefined
    let cancelled = false
    void (async () => {
      try {
        const rows = await api.list(bookId)
        if (cancelled) return
        setState({
          bookId,
          targets: rows.map((row) => ({
            id: row.id,
            name: row.name,
            entityType: row.entityType,
            subType: row.subType,
            subtypeId: row.subtypeId,
            presetKey: row.presetKey
          }))
        })
      } catch (error) {
        log.warn('关系目标候选加载失败', error)
        if (!cancelled) setState({ bookId, targets: EMPTY_TARGETS })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId])

  const targets = state !== null && state.bookId === bookId ? state.targets : EMPTY_TARGETS
  // 首次拉取中才算 loading：失败后已写入空候选，不再显示加载文案。
  const loading = bookId !== '' && state?.bookId !== bookId && window.api?.worldEntity !== undefined

  return { targets, loading }
}

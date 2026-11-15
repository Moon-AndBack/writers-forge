/**
 * 右栏「实体」页签的数据 hook：一次 `worldEntity:list(bookId)` 拉**全书五域实体**。
 *
 * 口径：
 * - **数据源**：`worldEntity.list(bookId)`（不传 `entityType`），后端顺序 `entity_type, id`；
 *   列表行已含 `entityType` / `subType` / `presetKey` / `name` / `aliases` / `body`（纯文本）/
 *   `relations`（出入边摘要）/ `grade` / `rank`，故卡片与分组**不需要逐条再发 `get`**，
 *   只有进详情取富文本 `bodyJson` 时才补一次；
 * - **分组**：`groupBookEntities` 按 `DOSSIER_MODULES` → `MODULE_ENTITY_TYPE` 的顺序分桶，
 *   丢弃空组，组内保持后端顺序（模块名作组标题由面板取 `module` ns）；
 * - **惰性**：只在 `active` 为真时发起请求；`active` 变假只失效在途请求，**不清空**已加载行
 *   （切回页签先显示上次结果，随后静默刷新）；
 * - **竞态 / 换书 / 失败**：同 `useBookInspirations`——每轮请求带自增 `seq`，乱序响应丢弃；
 *   返回值按 `bookId` 隔离；`loadError` 仅在「当前书 + 无可用数据」时暴露给三态，
 *   `reload()` 供失败态重试；
 * - **不接 `entities:revision`**：关系增删不 touch 实体 `revision`，用它做判重短路会漏刷新；
 *   沿用「每次激活都重拉」；
 * - **筛选**：`buildEntitySubtypeOptions` 从已加载行提取分类下拉（带域前缀），
 *   `filterBookEntityRows` 按名称 / 别名 / 子类过滤，均不额外发 IPC。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DOSSIER_MODULES, MODULE_ENTITY_TYPE } from '../../../shell/activityBarModules'
import type { DossierModule } from '../../../shell/activityBarModules'
import type { DossierRow } from '../dossier/dossierTree'

/** 一个设定域分组（模块 id + 该域实体行）。 */
export interface BookEntityGroup {
  /** 设定域模块 id（组标题取 `module` ns 的模块名）。 */
  module: DossierModule
  /** 该域实体行（后端顺序）。 */
  rows: DossierRow[]
}

/**
 * 按五个设定域分组：顺序固定为 `DOSSIER_MODULES`（世界观 / 角色 / 势力 / 境界体系 /
 * 物品功法），空组丢弃，组内保持入参顺序。
 */
export function groupBookEntities(rows: readonly DossierRow[]): BookEntityGroup[] {
  const groups: BookEntityGroup[] = []
  for (const module of DOSSIER_MODULES) {
    const entityType = MODULE_ENTITY_TYPE[module]
    const bucket = rows.filter((row) => row.entityType === entityType)
    if (bucket.length > 0) groups.push({ module, rows: bucket })
  }
  return groups
}

export interface BookEntities {
  /** 全书实体行（换书瞬间为空数组）。 */
  rows: DossierRow[]
  /** 按五域分组后的行（空组已丢弃）。 */
  groups: BookEntityGroup[]
  /** 行数（三态判定用）。 */
  total: number
  /** 是否有在途请求（列表非空时不闪加载态）。 */
  loading: boolean
  /** 当前书读取是否失败（仅列表为空时用于失败态）。 */
  loadError: boolean
  /** 重新拉取（失败态「重试」/ 面板外部触发）。 */
  reload: () => void
}

/** 实体分类下拉的一项：`value` 为 `${entityType}:${subType}`，跨域唯一。 */
export interface BookEntitySubtypeOption {
  value: string
  label: string
}

/**
 * 从已加载的实体行提取分类下拉选项：按 `DOSSIER_MODULES` 顺序遍历（各域内保持后端
 * 行序），`entityType + subType` 去重；未分类（`subType` 为空）不生成选项。
 *
 * `value` 带域前缀（如 `character:主角`），避免「主角」等多域重名子类无法区分；
 * `label` 取「模块名 · 子类名」，模块名由调用方注入 `module` ns 的翻译函数——
 * 纯函数不持有 i18n 实例，词典仍以 zh-CN 为真源。
 */
export function buildEntitySubtypeOptions(
  rows: readonly DossierRow[],
  moduleLabel: (module: DossierModule) => string
): BookEntitySubtypeOption[] {
  const seen = new Set<string>()
  const options: BookEntitySubtypeOption[] = []
  for (const module of DOSSIER_MODULES) {
    const entityType = MODULE_ENTITY_TYPE[module]
    for (const row of rows) {
      if (row.entityType !== entityType) continue
      const subType = row.subType.trim()
      if (subType === '') continue
      const value = `${entityType}:${subType}`
      if (seen.has(value)) continue
      seen.add(value)
      options.push({ value, label: `${moduleLabel(module)} · ${subType}` })
    }
  }
  return options
}

/**
 * 按筛选条件过滤实体行：关键词匹配名称 / 别名 / 子类（大小写不敏感、`trim`，
 * 不扫正文——沿用设定模块「不扫正文」口径）；`category` 为 `null` 时不过滤。
 */
export function filterBookEntityRows(
  rows: readonly DossierRow[],
  query: string,
  category: string | null
): DossierRow[] {
  const keyword = query.trim().toLowerCase()
  if (keyword === '' && category === null) return [...rows]
  return rows.filter((row) => {
    if (category !== null && `${row.entityType}:${row.subType}` !== category) return false
    if (keyword === '') return true
    return (
      row.name.toLowerCase().includes(keyword) ||
      row.subType.toLowerCase().includes(keyword) ||
      row.aliases.some((alias) => alias.toLowerCase().includes(keyword))
    )
  })
}

interface BookEntitiesState {
  bookId: string
  rows: DossierRow[]
  loadError: boolean
}

/** 无数据时的恒等空数组（换书瞬间复用，引用稳定）。 */
const EMPTY_ROWS: DossierRow[] = []

/** 拉全书实体（按五域分组）。`bookId` 为空或页签未激活时不发请求。 */
export function useBookEntities(bookId: string, active: boolean): BookEntities {
  const [state, setState] = useState<BookEntitiesState>({
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
      void window.api.worldEntity
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
  const rows = sameBook ? state.rows : EMPTY_ROWS
  const groups = useMemo(() => groupBookEntities(rows), [rows])
  return {
    rows,
    groups,
    total: rows.length,
    loading,
    loadError: sameBook && state.loadError,
    reload
  }
}

export default useBookEntities

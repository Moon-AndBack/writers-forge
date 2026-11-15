/**
 * 右栏「实体」页签的数据 hook：一次 `worldEntity:list(bookId)` 拉**全书五域实体**。
 *
 * 口径：
 * - **数据源**：`worldEntity.list(bookId)`（不传 `entityType`），后端顺序 `entity_type, id`；
 *   列表行已含 `entityType` / `subType` / `presetKey` / `name` / `aliases` / `body`（纯文本）/
 *   `relations`（出入边摘要）/ `grade` / `rank`，故卡片**不需要逐条再发 `get`**，
 *   只有进详情取富文本 `bodyJson` 时才补一次；
 * - **排序**：`sortBookEntityRows` 按名称 `localeCompare('zh-CN')` 升序（中文即拼音序），
 *   同名按 `id` 升序保证稳定；面板在**过滤之后**调用，平铺网格按此顺序渲染；
 * - **惰性**：只在 `active` 为真时发起请求；`active` 变假只失效在途请求，**不清空**已加载行
 *   （切回页签先显示上次结果，随后静默刷新）；
 * - **竞态 / 换书 / 失败**：同 `useBookInspirations`——每轮请求带自增 `seq`，乱序响应丢弃；
 *   返回值按 `bookId` 隔离；`loadError` 仅在「当前书 + 无可用数据」时暴露给三态，
 *   `reload()` 供失败态重试；
 * - **不接 `entities:revision`**：关系增删不 touch 实体 `revision`，用它做判重短路会漏刷新；
 *   沿用「每次激活都重拉」；
 * - **筛选**：`buildEntityModuleOptions` / `buildEntitySubtypeOptions` 从已加载行提取
 *   模块与子类两个下拉（子类只列当前模块，选项只显示纯名称）；`filterBookEntityRows`
 *   按模块 / 子类 / 关键词（名称 / 别名 / 子类）取交集，均不额外发 IPC。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { DOSSIER_MODULES, MODULE_ENTITY_TYPE } from '../../../shell/activityBarModules'
import type { DossierModule } from '../../../shell/activityBarModules'
import type { DossierRow } from '../dossier/dossierTree'

export interface BookEntities {
  /** 全书实体行（换书瞬间为空数组）。 */
  rows: DossierRow[]
  /** 行数（三态判定用）。 */
  total: number
  /** 是否有在途请求（列表非空时不闪加载态）。 */
  loading: boolean
  /** 当前书读取是否失败（仅列表为空时用于失败态）。 */
  loadError: boolean
  /** 重新拉取（失败态「重试」/ 面板外部触发）。 */
  reload: () => void
}

/** 模块下拉的一项：`value` 为数据层 `entityType`（如 `character`），`label` 为模块名。 */
export interface BookEntityModuleOption {
  value: string
  label: string
}

/**
 * 从已加载的实体行提取模块下拉选项：按 `DOSSIER_MODULES` 顺序遍历，只保留实际出现过的
 * 实体类型（同域多行只留一项）；模块名由调用方注入 `module` ns 的翻译函数——纯函数
 * 不持有 i18n 实例，词典仍以 zh-CN 为真源。
 */
export function buildEntityModuleOptions(
  rows: readonly DossierRow[],
  moduleLabel: (module: DossierModule) => string
): BookEntityModuleOption[] {
  const present = new Set<string>(rows.map((row) => row.entityType))
  const options: BookEntityModuleOption[] = []
  for (const module of DOSSIER_MODULES) {
    const entityType = MODULE_ENTITY_TYPE[module]
    if (!present.has(entityType)) continue
    options.push({ value: entityType, label: moduleLabel(module) })
  }
  return options
}

/** 子类下拉的一项：`value` 与 `label` 均为子类名（域上下文由模块下拉承担）。 */
export interface BookEntitySubtypeOption {
  value: string
  label: string
}

/**
 * 从已加载的实体行提取**指定模块**下的子类下拉选项：按后端行序去重，只显示纯子类名，
 * 不再拼模块前缀（模块已由另一个下拉选定）；`entityType` 为 `null`（全部模块）时返回
 * 空数组——跨域同名子类会混淆。未分类（`subType` 为空）不生成选项。
 */
export function buildEntitySubtypeOptions(
  rows: readonly DossierRow[],
  entityType: string | null
): BookEntitySubtypeOption[] {
  if (entityType === null) return []
  const seen = new Set<string>()
  const options: BookEntitySubtypeOption[] = []
  for (const row of rows) {
    if (row.entityType !== entityType) continue
    const subType = row.subType.trim()
    if (subType === '' || seen.has(subType)) continue
    seen.add(subType)
    options.push({ value: subType, label: subType })
  }
  return options
}

/**
 * 按筛选条件过滤实体行：模块、子类、关键词三者取交集；关键词匹配名称 / 别名 / 子类
 * （大小写不敏感、`trim`，不扫正文——沿用设定模块「不扫正文」口径）。`entityType` /
 * `subType` 为 `null` 时对应维度不过滤。
 */
export function filterBookEntityRows(
  rows: readonly DossierRow[],
  query: string,
  entityType: string | null,
  subType: string | null
): DossierRow[] {
  const keyword = query.trim().toLowerCase()
  if (keyword === '' && entityType === null && subType === null) return [...rows]
  return rows.filter((row) => {
    if (entityType !== null && row.entityType !== entityType) return false
    if (subType !== null && row.subType.trim() !== subType) return false
    if (keyword === '') return true
    return (
      row.name.toLowerCase().includes(keyword) ||
      row.subType.toLowerCase().includes(keyword) ||
      row.aliases.some((alias) => alias.toLowerCase().includes(keyword))
    )
  })
}

/**
 * 按名称排序（平铺网格的展示顺序）：`localeCompare('zh-CN')` 让中文按拼音、英文按字母，
 * 与数字混排也走本地化规则；同名时按 `id` 升序，保证顺序稳定（名称并不唯一）。
 * 返回新数组，不改入参。
 */
export function sortBookEntityRows(rows: readonly DossierRow[]): DossierRow[] {
  return [...rows].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'zh-CN')
    return byName !== 0 ? byName : a.id - b.id
  })
}

interface BookEntitiesState {
  bookId: string
  rows: DossierRow[]
  loadError: boolean
}

/** 无数据时的恒等空数组（换书瞬间复用，引用稳定）。 */
const EMPTY_ROWS: DossierRow[] = []

/** 拉全书实体。`bookId` 为空或页签未激活时不发请求。 */
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
  return {
    rows,
    total: rows.length,
    loading,
    loadError: sameBook && state.loadError,
    reload
  }
}

export default useBookEntities

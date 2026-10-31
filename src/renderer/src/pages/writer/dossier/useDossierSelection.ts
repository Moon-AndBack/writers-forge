/**
 * 设定档案「选中 + 详情 + 关系 + 语义码」装配（自 `useDossierWorkspace.ts` 拆出，§3 ≤500 行）。
 *
 * 选中口径（派生）：显式选中项仍属当前域且在列表中则用之，否则回退首行；被删除后自动回退。
 * 状态一律**按域 / 行打标**（`SelectedState` / `DetailState` / `RefsState`），派生时仅在
 * 标记与当前域（当前行）一致时才采用，因此无需在 effect 里同步清空状态。
 * 关系：走统一引用通道（`listRefs` / `listIncomingRefs`），详情加载时并行取回；
 * 关系类型取语义码字典（全局拉一次）。
 *
 * 对外除派生值外还提供 `api`（写后本地状态回填回调集合）：写动作 hook 不直接持 setter，
 * 由组合层把本 `api` 与列表行回填合并后显式传入。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type {
  DossierDetail,
  DossierModule,
  DossierRow,
  WorldRefRow,
  WorldSemanticCodeRow
} from './dossierTree'

/** 设定档案装配日志（转发至主进程落盘）。 */
const log = createLogger('dossier')

/** 稳定空数组：入边关系 / 语义码字典未加载时使用。 */
const EMPTY_REFS: WorldRefRow[] = []
const EMPTY_CODES: WorldSemanticCodeRow[] = []

/** 选中态（带域标记：仅当前域有效）。 */
interface SelectedState {
  module: DossierModule
  id: number
}

/** 详情态（带域 + 行标记：仅当前域当前行有效）。 */
interface DetailState {
  module: DossierModule
  id: number
  detail: DossierDetail | null
}

/** 出边引用态（带域 + 行标记）。 */
interface RefsState {
  module: DossierModule
  id: number
  refs: WorldRefRow[]
  incoming: WorldRefRow[]
}

/**
 * 写后本地状态回填（选中 / 详情 / 关系）。
 *
 * 不向写动作透出原始 setter：调用方以「域 + 行」显式传参，回填口径集中在此，
 * 避免写动作各自重写标记比较逻辑（写链内闭包也可能拿到旧域）。
 */
export interface DossierSelectionApi {
  /** 新建成功后预置详情缓存（列表刷新后 `activeId` 落到新行）。 */
  seedDetail: (module: DossierModule, created: Omit<DossierDetail, 'relations'>) => void
  /** 直接标记选中（新建成功后调用，不经切换守卫）。 */
  markSelected: (module: DossierModule, id: number) => void
  /** 删除后清空指向被删行的选中（其余交由派生口径回退首行）。 */
  dropSelected: (module: DossierModule, id: number) => void
  /** 更新成功后就地替换详情（保留详情已加载的关系列表）。 */
  patchDetail: (module: DossierModule, updated: Omit<DossierDetail, 'relations'>) => void
  /** 关系写后就地替换出边 / 入边与详情关系列表。 */
  patchRelations: (
    module: DossierModule,
    id: number,
    refs: WorldRefRow[],
    incoming: WorldRefRow[]
  ) => void
}

export interface DossierSelectionResult {
  /** 当前选中行 id（null = 无行）。 */
  activeId: number | null
  /** 当前选中行详情（null = 未选中 / 加载中）。 */
  detail: DossierDetail | null
  /**
   * 选中行已确定但详情尚未回填（正在加载）。
   *
   * 仅作**渲染分支**用：详情面板据此渲染空白而**非**空态，避免「切换条目时先闪一帧
   * 空态文案 + 布局跳动」。不能改用 `detail === null` 判定——实体被删时 IPC 返回
   * `null`，此时 `detailState` 仍命中行标记、属于「已加载但无数据」，应照常显示空态。
   */
  detailPending: boolean
  /** 当前选中行的入边关系。 */
  incomingRelations: WorldRefRow[]
  /** 语义码字典（全局，关系类型下拉数据源）。 */
  semanticCodes: WorldSemanticCodeRow[]
  /** 选中某行（不触发右栏展开，展开由页面层包装）。 */
  select: (id: number) => void
  /** 写后回填回调集合（引用稳定，可直接进依赖）。 */
  api: DossierSelectionApi
}

export function useDossierSelection(
  active: DossierModule | null,
  currentRows: DossierRow[],
  guardSwitch: (proceed: () => void) => void
): DossierSelectionResult {
  const [selected, setSelected] = useState<SelectedState | null>(null)
  const [detailState, setDetailState] = useState<DetailState | null>(null)
  const [refsState, setRefsState] = useState<RefsState | null>(null)
  const [semanticCodes, setSemanticCodes] = useState<WorldSemanticCodeRow[]>(EMPTY_CODES)

  // 语义码字典（全局，与书 / 域无关）：挂载后拉一次，供关系类型下拉。
  // 失败时保持空表（下拉仅剩「其他 / 自定义」不可用），不阻塞其余编辑。
  useEffect(() => {
    const api = window.api?.worldEntity
    if (!api) return undefined
    let cancelled = false
    void (async () => {
      try {
        const codes = await api.listSemanticCodes()
        if (!cancelled) setSemanticCodes(codes)
      } catch (error) {
        log.warn('关系语义码加载失败', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 选中口径（派生）：显式选中项仍属当前域且在列表中则用之，否则回退首行。
  const activeId =
    selected !== null &&
    selected.module === active &&
    currentRows.some((row) => row.id === selected.id)
      ? selected.id
      : (currentRows[0]?.id ?? null)

  // 选中行详情加载（实体 + 出边 / 入边引用并行）；未选中 / 非设定档案域时不拉取。
  useEffect(() => {
    if (!active || activeId === null) return undefined
    const api = window.api?.worldEntity
    if (!api) return undefined
    let cancelled = false
    void (async () => {
      try {
        const [entity, refs, incoming] = await Promise.all([
          api.get(activeId),
          api.listRefs(activeId),
          api.listIncomingRefs(activeId)
        ])
        if (cancelled) return
        setRefsState({ module: active, id: activeId, refs, incoming })
        setDetailState({
          module: active,
          id: activeId,
          detail: entity ? { ...entity, relations: refs } : null
        })
      } catch (error) {
        log.warn('设定档案详情加载失败', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, activeId])

  // 详情态是否命中「当前域 + 当前行」：命中即视为本条详情已回填（entity 为 null 也算已回填）。
  const detailLoaded =
    detailState !== null && detailState.module === active && detailState.id === activeId

  const detail = detailLoaded
    ? detailState.detail === null
      ? null
      : {
          ...detailState.detail,
          relations:
            refsState !== null && refsState.module === active && refsState.id === activeId
              ? refsState.refs
              : detailState.detail.relations
        }
    : null

  // 选中行已定、详情态尚未命中该行 = 正在加载（渲染层据此跳过空态，避免闪帧）。
  const detailPending = activeId !== null && !detailLoaded

  const incomingRelations =
    refsState !== null && refsState.module === active && refsState.id === activeId
      ? refsState.incoming
      : EMPTY_REFS

  const select = useCallback(
    (id: number): void => {
      if (!active) return
      // 点当前已选中的卡片不算切换：不回滚草稿、不弹未保存确认。
      if (id === activeId) return
      guardSwitch(() => setSelected({ module: active, id }))
    },
    [active, activeId, guardSwitch]
  )

  // 回填回调只依赖 setter（引用恒定）；域 / 行由调用方显式传入，故依赖为空。
  const api = useMemo<DossierSelectionApi>(
    () => ({
      seedDetail(module, created) {
        setDetailState({ module, id: created.id, detail: { ...created, relations: [] } })
      },
      markSelected(module, id) {
        setSelected({ module, id })
      },
      dropSelected(module, id) {
        setSelected((prev) => (prev && prev.module === module && prev.id === id ? null : prev))
      },
      patchDetail(module, updated) {
        setDetailState((prev) =>
          prev && prev.module === module && prev.id === updated.id
            ? {
                module,
                id: updated.id,
                detail: { ...updated, relations: prev.detail?.relations ?? [] }
              }
            : prev
        )
      },
      patchRelations(module, id, refs, incoming) {
        setRefsState({ module, id, refs, incoming })
        setDetailState((prev) =>
          prev && prev.module === module && prev.id === id && prev.detail !== null
            ? { ...prev, detail: { ...prev.detail, relations: refs } }
            : prev
        )
      }
    }),
    []
  )

  return { activeId, detail, detailPending, incomingRelations, semanticCodes, select, api }
}

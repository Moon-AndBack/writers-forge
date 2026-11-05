import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { readGridCardWidth } from '../../../components/cardGridMetrics'
import { useStableMeasure } from '../../../components/useStableMeasure'
import type { OverflowPopupControl } from '../../../components/useOverflowPopup'
import { POPOVER_HIDE_DELAY, POPOVER_SHOW_DELAY } from '../../../components/popoverTiming'
import { useModuleLabel } from '../../../shell/activityBarModules'
import type { DossierModule } from '../../../shell/activityBarModules'
import { HoverCard } from '../entities/HoverCard'
import type { HoverAnchor } from '../entities/HoverCard'
import ConfirmDialog from '../ConfirmDialog'
import DossierActivityActions from './DossierActivityActions'
import DossierCard from './DossierCard'
import DossierCreateDialog from './DossierCreateDialog'
import DossierEditDialog from './DossierEditDialog'
import { useDossierFilters } from './dossierFilterContext'
import { filterDossierRows } from './dossierFilterMatch'
import DossierRelationsDialog from './DossierRelationsDialog'
import type { DossierBundle } from './dossierTree'

/** 关系 chip 悬停卡延迟：移入显示、移出消失（避免扫过时频繁弹出），取通用浮层延迟。 */
const CHIP_HOVER_SHOW_DELAY = POPOVER_SHOW_DELAY
const CHIP_HOVER_HIDE_DELAY = POPOVER_HIDE_DELAY
/**
 * 「+N」浮窗内胶囊 → 第二层详情卡：悬停显示、离开收起。
 * 与 `HoverCard` 内部嵌套层同口径，两者均取 `popoverTiming` 的通用浮层延迟。
 */
const NESTED_SHOW_DELAY = POPOVER_SHOW_DELAY
const NESTED_HIDE_DELAY = POPOVER_HIDE_DELAY

export interface DossierViewProps {
  /** 设定档案装配包（活动域的数据 + 动作）。 */
  bundle: DossierBundle
}

/**
 * 设定档案中栏视图（五域共用，按 module 参数化）：
 * 标题栏注册「新建」加号（`DossierActivityActions`）+ 卡片网格（单卡见 `DossierCard`）。
 *
 * 五域一致：点卡经 `onSelect` 选中（页面层包装：右栏隐藏时自动展开），详情在**右栏**上下
 * 两张卡片中编辑；中栏不切换编辑器。编辑收敛到卡片铅笔弹窗（`DossierEditDialog`），
 * 关联关系统一到卡片「关联关系」按钮的独立弹窗（`DossierRelationsDialog`），删除收敛到
 * 卡片垃圾桶确认框。世界观与其它四域一样可参与关联关系（卡片挂入口，也可作为目标）；
 * 境界体系无卡片关系入口（`relationsEnabled = false`），其余入口与其他域一致。
 *
 * 拆分后的职责边界（本文件只留装配 + 浮层状态）：
 * - 单卡渲染与关系行自适应收口：「+N」开合状态机 ⇒ `DossierCard.tsx`
 * - 关系胶囊文案 / 配色映射（纯函数）⇒ `dossierCardRelations.ts`
 * - 浮层两层：关系胶囊 → 第一层 `HoverCard`；「+N」浮窗内胶囊 → 第二层 `HoverCard`（nested，
 *   只展开一层：第二层传 `relationsExpandable={false}`）。
 */
export default function DossierView({ bundle }: DossierViewProps) {
  const { t } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')
  const moduleLabel = useModuleLabel(bundle.module)
  const [createOpen, setCreateOpen] = useState(false)
  // 编辑弹窗当前打开的行 id（null = 关闭；境界体系无类别选择器，仅改名称 / 别名）。
  const [editId, setEditId] = useState<number | null>(null)
  // 关联关系弹窗当前打开的行 id（null = 关闭；境界体系模块不挂入口）。
  const [relationsId, setRelationsId] = useState<number | null>(null)
  // 删除确认当前打开的行 id（null = 关闭；五域一致，删除走卡片垃圾桶）。
  const [deleteId, setDeleteId] = useState<number | null>(null)
  // 第一层：关系胶囊悬停卡（全视图共用一份，portal 挂 body），延迟显示 / 消失；
  // 目标实体详情由 HoverCard 内置 LRU 缓存按 peerId 取（`worldEntity:get`）。
  const [chipHover, setChipHover] = useState<HoverAnchor | null>(null)
  const chipShowTimerRef = useRef<number | null>(null)
  const chipHideTimerRef = useRef<number | null>(null)
  // 第二层：「+N」浮窗内胶囊 → 对端详情卡（只展开一层）。带来源行 id：换行 / 删行后旧锚点自动失效。
  const [nestedHover, setNestedHover] = useState<{
    anchor: HoverAnchor
    sourceRowId: number
  } | null>(null)
  const nestedShowTimerRef = useRef<number | null>(null)
  const nestedHideTimerRef = useRef<number | null>(null)
  // 卡片网格：供 ResizeObserver 推导单卡内容可用宽（关系行布局签名）。
  const gridRef = useRef<HTMLDivElement | null>(null)
  // 「+N」浮窗开合控制器（按行 id 登记）：第二层详情卡悬停时据此保持浮窗不被自己的计时收起。
  const popupControlsRef = useRef<Map<number, OverflowPopupControl>>(new Map())

  const clearChipTimers = useCallback((): void => {
    if (chipShowTimerRef.current !== null) {
      window.clearTimeout(chipShowTimerRef.current)
      chipShowTimerRef.current = null
    }
    if (chipHideTimerRef.current !== null) {
      window.clearTimeout(chipHideTimerRef.current)
      chipHideTimerRef.current = null
    }
  }, [])

  const handleChipEnter = useCallback(
    (event: ReactMouseEvent<HTMLElement>, peerId: number): void => {
      clearChipTimers()
      const element = event.currentTarget
      // 换到另一条关系标签时先撤掉旧卡，避免延迟窗口内仍显示上一条的摘要。
      setChipHover(null)
      chipShowTimerRef.current = window.setTimeout(() => {
        chipShowTimerRef.current = null
        if (!element.isConnected) return
        setChipHover({ rect: element.getBoundingClientRect(), entityId: peerId, anchorEl: element })
      }, CHIP_HOVER_SHOW_DELAY)
    },
    [clearChipTimers]
  )

  const handleChipLeave = useCallback((): void => {
    if (chipShowTimerRef.current !== null) {
      window.clearTimeout(chipShowTimerRef.current)
      chipShowTimerRef.current = null
    }
    if (chipHideTimerRef.current !== null) window.clearTimeout(chipHideTimerRef.current)
    chipHideTimerRef.current = window.setTimeout(() => {
      chipHideTimerRef.current = null
      setChipHover(null)
    }, CHIP_HOVER_HIDE_DELAY)
  }, [])

  const closeChipHover = useCallback((): void => {
    clearChipTimers()
    setChipHover(null)
  }, [clearChipTimers])

  /**
   * 鼠标进入悬停卡：只取消 chip 侧隐藏定时器，允许在卡片内停留 / 滚动正文
   * （否则 chip 的 mouseleave 会在 CHIP_HOVER_HIDE_DELAY 后把卡片关掉）。
   */
  const handleChipHoverEnter = useCallback((): void => {
    if (chipHideTimerRef.current !== null) {
      window.clearTimeout(chipHideTimerRef.current)
      chipHideTimerRef.current = null
    }
  }, [])

  /** 鼠标离开悬停卡：复用 chip 移出的延迟关闭逻辑，重新启动隐藏定时器。 */
  const handleChipHoverLeave = useCallback((): void => {
    handleChipLeave()
  }, [handleChipLeave])

  const clearNestedTimers = useCallback((): void => {
    if (nestedShowTimerRef.current !== null) {
      window.clearTimeout(nestedShowTimerRef.current)
      nestedShowTimerRef.current = null
    }
    if (nestedHideTimerRef.current !== null) {
      window.clearTimeout(nestedHideTimerRef.current)
      nestedHideTimerRef.current = null
    }
  }, [])

  /**
   * 「+N」浮窗内胶囊移入：260ms 后展开对端详情（第二层）。
   * 换对端时先撤旧卡，避免延迟窗口内仍显示上一条；锚点胶囊已卸载则不再打开。
   */
  const handleMoreItemEnter = useCallback(
    (el: HTMLElement, peerId: number, rowId: number): void => {
      clearNestedTimers()
      setNestedHover(null)
      nestedShowTimerRef.current = window.setTimeout(() => {
        nestedShowTimerRef.current = null
        if (!el.isConnected) return
        setNestedHover({
          anchor: { rect: el.getBoundingClientRect(), entityId: peerId, anchorEl: el },
          sourceRowId: rowId
        })
      }, NESTED_SHOW_DELAY)
    },
    [clearNestedTimers]
  )

  /** 「+N」浮窗内胶囊移出：延迟收起第二层，给「浮窗胶囊 → 详情卡」的往返留余量。 */
  const handleMoreItemLeave = useCallback((): void => {
    clearNestedTimers()
    nestedHideTimerRef.current = window.setTimeout(() => {
      nestedHideTimerRef.current = null
      setNestedHover(null)
    }, NESTED_HIDE_DELAY)
  }, [clearNestedTimers])

  /** 关闭第二层（其自身鼠标离开 120ms 后回调）。 */
  const closeNestedHover = useCallback((): void => {
    clearNestedTimers()
    setNestedHover(null)
  }, [clearNestedTimers])

  /** 登记 / 注销某行「+N」浮窗的控制器（`DossierCard` 挂载时上报、卸载时以 null 注销）。 */
  const handlePopupControl = useCallback(
    (rowId: number, control: OverflowPopupControl | null): void => {
      if (control === null) popupControlsRef.current.delete(rowId)
      else popupControlsRef.current.set(rowId, control)
    },
    []
  )

  /**
   * 进入第二层详情卡：取消全部挂起计时（含其自身的延迟收起），并取消所属行「+N」浮窗的挂起收起
   * ——鼠标从浮窗胶囊移向详情卡时会先触发浮窗 / 胶囊的 mouseleave，不取消就会 120ms 后把
   * 浮窗关掉（与 `HoverCard` 内部 `handleRootEnter` 反向调用 `cancelRootClose` 同口径）。
   */
  const handleNestedCardEnter = useCallback((): void => {
    clearNestedTimers()
    if (nestedHover !== null) {
      popupControlsRef.current.get(nestedHover.sourceRowId)?.cancelClose()
    }
  }, [clearNestedTimers, nestedHover])

  /**
   * 离开第二层详情卡：重启第二层延迟收起，并重启所属行「+N」浮窗的延迟收起
   * （对应 `HoverCard` 内部 `scheduleRootClose`；两层都按 120ms 同一结果收敛）。
   */
  const handleNestedCardLeave = useCallback((): void => {
    handleMoreItemLeave()
    if (nestedHover !== null) {
      popupControlsRef.current.get(nestedHover.sourceRowId)?.scheduleClose()
    }
  }, [handleMoreItemLeave, nestedHover])

  // 卸载清理挂起定时器
  useEffect(() => clearChipTimers, [clearChipTimers])
  useEffect(() => clearNestedTimers, [clearNestedTimers])

  const {
    module,
    rows,
    activeId,
    loading,
    semanticCodes,
    onSelect,
    onCreate,
    onUpdate,
    onDelete,
    onAddRelation,
    onUpdateRelation,
    onRemoveRelation
  } = bundle

  // 中栏筛选：条件来自活动栏模块浮层（`DossierFilterProvider`，按模块分桶、切模块各自保留）。
  // `rows` 始终保持全量——选中回退（`useDossierSelection` 取 `currentRows[0]`）依赖全量，
  // 故只把 `visibleRows` 喂给网格渲染。
  const { bookId, filters, setSummary } = useDossierFilters()
  const filterEntry = filters[module]
  const visibleRows = useMemo(
    () => filterDossierRows(rows, filterEntry.subtype, filterEntry.query),
    [rows, filterEntry]
  )

  // 匹配汇总上报：浮层里的「匹配 N 项」与网格同一口径（直接取入参 / 出参长度），
  // 不在浮层另写一套过滤。值比较守卫避免 effect → Context → 重渲染的自激循环。
  const reportedSummary = useRef<{
    bookId: string
    module: DossierModule
    total: number
    matched: number
  } | null>(null)
  useEffect(() => {
    const total = rows.length
    const matched = visibleRows.length
    const previous = reportedSummary.current
    if (
      previous !== null &&
      previous.bookId === bookId &&
      previous.module === module &&
      previous.total === total &&
      previous.matched === matched
    ) {
      return
    }
    reportedSummary.current = { bookId, module, total, matched }
    setSummary(module, { total, matched })
  }, [bookId, module, rows, setSummary, visibleRows])

  // 关系行布局签名：单卡内容可用宽（网格列宽 − 卡片左右内边距）。无可见卡片时不观察。
  const layoutKey = useStableMeasure(gridRef, visibleRows.length > 0, readGridCardWidth)

  // 关系入口开关：境界体系仍无卡片关系入口（其余四域，含世界观，卡片挂入口）。
  const relationsEnabled = module !== 'power_system'
  // 编辑目标行（id 失效时回 null，不开弹窗）。
  const editRow = editId === null ? null : (rows.find((row) => row.id === editId) ?? null)
  // 关联关系目标行（id 失效时回 null，不开弹窗）。
  const relationsRow =
    relationsId === null ? null : (rows.find((row) => row.id === relationsId) ?? null)
  // 删除目标行（id 失效时回 null，不开确认框）。
  const deleteRow = deleteId === null ? null : (rows.find((row) => row.id === deleteId) ?? null)
  // 第二层锚点：来源行已不存在（删行 / 换域）时视同失效，浮卡不渲染。
  const nestedAnchor =
    nestedHover !== null && rows.some((row) => row.id === nestedHover.sourceRowId)
      ? nestedHover.anchor
      : null

  return (
    <>
      <DossierActivityActions module={module} onCreate={() => setCreateOpen(true)} />

      <div className="editor-scroll">
        <div className="editor-inner is-full">
          {loading && rows.length === 0 ? (
            <div className="dossier-detail__empty">{tCommon('loading')}</div>
          ) : rows.length === 0 ? (
            <div className="placeholder-view" role="note">
              <div className="placeholder-title">{t('emptyTitle', { module: moduleLabel })}</div>
              <div className="placeholder-desc">{t('emptyDesc')}</div>
            </div>
          ) : visibleRows.length === 0 ? (
            /* 有数据但被筛选条件全部滤掉：与「模块还没有条目」的空态文案区分。 */
            <div className="placeholder-view" role="note">
              <div className="placeholder-title">{t('filter.emptyTitle')}</div>
              <div className="placeholder-desc">{t('filter.emptyDesc')}</div>
            </div>
          ) : (
            <div
              className="wf-card-grid dossier-grid"
              ref={gridRef}
              aria-label={t('gridAria', { module: moduleLabel })}
            >
              {visibleRows.map((row) => (
                <DossierCard
                  key={row.id}
                  row={row}
                  active={row.id === activeId}
                  layoutKey={layoutKey}
                  onSelect={onSelect}
                  onEdit={setEditId}
                  onRelations={relationsEnabled ? setRelationsId : undefined}
                  onDelete={setDeleteId}
                  onChipEnter={handleChipEnter}
                  onChipLeave={handleChipLeave}
                  onMoreItemEnter={handleMoreItemEnter}
                  onMoreItemLeave={handleMoreItemLeave}
                  onPopupOpen={closeChipHover}
                  onPopupControl={handlePopupControl}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {createOpen ? (
        <DossierCreateDialog
          module={module}
          bookId={bundle.bookId}
          onClose={() => setCreateOpen(false)}
          onSubmit={onCreate}
        />
      ) : null}

      {editRow ? (
        <DossierEditDialog
          module={module}
          bookId={bundle.bookId}
          row={editRow}
          onClose={() => setEditId(null)}
          onSubmit={(patch) => onUpdate(editRow.id, patch)}
        />
      ) : null}
      {relationsEnabled && relationsRow ? (
        <DossierRelationsDialog
          module={module}
          row={relationsRow}
          semanticCodes={semanticCodes}
          onAddRelation={onAddRelation}
          onUpdateRelation={onUpdateRelation}
          onRemoveRelation={onRemoveRelation}
          onClose={() => setRelationsId(null)}
        />
      ) : null}
      {deleteRow ? (
        <ConfirmDialog
          open
          title={t('detail.deleteTitle', { module: moduleLabel })}
          message={t('detail.deleteMessage', {
            name: deleteRow.name.trim() === '' ? t('unnamed') : deleteRow.name
          })}
          confirmText={t('detail.delete')}
          cancelText={tCommon('cancel')}
          onConfirm={() => {
            onDelete(deleteRow.id)
            setDeleteId(null)
          }}
          onClose={() => setDeleteId(null)}
        />
      ) : null}
      {/* 第一层：关系胶囊悬停卡（与章节 / 剧情正文高亮共用展示组件）。此处不传 passive，
          整卡可交互：卡内「+N」浮窗依赖胶囊自身收到 mouseenter，正文滚动也依赖卡片承接鼠标。
          onPointerEnter / onPointerLeave 负责让卡片侧感知鼠标进出，取消 / 重启 chip 的隐藏
          定时器，使鼠标能停在卡片内不被 120ms 计时关掉。 */}
      <HoverCard
        anchor={chipHover}
        onClose={closeChipHover}
        onPointerEnter={handleChipHoverEnter}
        onPointerLeave={handleChipHoverLeave}
      />
      {/* 第二层：「+N」浮窗内胶囊展开的对端详情卡（只展开一层）。
          其锚点胶囊在浮窗内（portal 挂 body），浮窗自身 120ms 后收起不影响本卡存活；
          `relationsExpandable={false}` 使其关系行仅展示，「+N」不可再展开。
          进入 / 离开本卡经 onPointerEnter / onPointerLeave 取消 / 重启第二层隐藏计时，
          与 HoverCard 内部嵌套层（handleRootEnter / scheduleRootClose）同口径。 */}
      <HoverCard
        anchor={nestedAnchor}
        onClose={closeNestedHover}
        onPointerEnter={handleNestedCardEnter}
        onPointerLeave={handleNestedCardLeave}
        relationsExpandable={false}
        nested
      />
    </>
  )
}

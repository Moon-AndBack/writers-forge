/**
 * 活动栏「模块筛选」浮层（可筛选模块图标 hover 触发：实体五域 + 灵感）。
 *
 * 交互：鼠标移入模块图标 → 浮层贴活动栏右侧展开（`HoverPopupShell` 的 `right` 定位，
 * 固定态内缩 64px 由 `popoverGeometry` 统一处理）；移出按钮与浮层约 300ms 后收起
 * （计时器在 `activityBar.tsx`，本组件只管内容与「进入 / 离开」上报）。
 *
 * 内容只有两行（不做计数 / 提示 / 分隔线）：
 * - 第一行：模块名 + 搜索框 + 圆形提交按钮；
 * - 第二行：「全部」+ 该模块的全部分类（横向 chip，超出换行）。
 * 点击分类 = 写入该模块的筛选条件并切到该模块；点「全部」清除分类条件；
 * 搜索框只写关键词，点搜索按钮才切模块——避免打字就触发未保存改动确认。
 * 匹配结果本身在中栏网格看，浮层不再报数。
 *
 * 数据源适配（**不复制浮层**）：
 * - 实体域：`useDossierFilters` + `useDossierSubtypes`，分类 = 子类，搜索 = 名称 + 别名；
 * - 灵感域：`useInspirationFilters` + 「内置预置 ∪ 已用标签」，分类 = 标签，
 *   搜索 = 标题 + 内容 + 标签；
 * - 伏笔域：`useForeshadowFilters`，分类 = 派生状态（建设中 / 埋设中 / 已回收 / 已废弃），
 *   搜索 = 名称 + 描述 + 回收备注 + 三处原文摘抄；
 * 三分支只在「条件 / 选项 / 写入方式」上不同，两行布局、搜索防抖、提交与切换守卫
 * 全部共用同一棵 JSX（`dossierModule` 仅作为实体分支的判据，其余按模块 id 分流）。
 *
 * 收起保护：`onKeepOpen` 由活动栏提供，同时取消活动栏自身的收起计时与浮层计时；
 * 搜索框 `onFocus` 也调它，保证「Tab 聚焦输入框」不会因鼠标不在而收起。
 * 另外浮层根节点经 `shellRef` 回传活动栏，供 `focusin / focusout` 驱动同一「保持打开」状态。
 *
 * 搜索输入：本地受控 + 停止输入 `QUERY_DEBOUNCE` 后再提交到 Context，
 * 避免逐键触发 Provider → 中栏全量重渲染。组合输入（IME）期间挂起提交，
 * `compositionend` 后再按防抖提交；失焦 / Enter / 卸载时立即 flush，
 * 保证最后一次输入不会随 200ms 防抖窗口丢失。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  CompositionEvent as ReactCompositionEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/cn'
import { SearchInput } from '../components/ui'
import { SearchIcon } from '../components/icons'
import { HoverPopupShell } from '../components/HoverPopupShell'
import type { ForeshadowDisplayStatus } from '../../../shared/foreshadowStatus'
import { FILTER_ALL, useDossierFilters } from '../pages/writer/dossier/dossierFilterContext'
import { useDossierSubtypes } from '../pages/writer/dossier/useDossierSubtypes'
import {
  FORESHADOW_FILTER_STATUSES,
  useForeshadowFilters
} from '../pages/writer/foreshadow/foreshadowFilterContext'
import { FORESHADOW_STATUS_LABEL_KEYS } from '../pages/writer/foreshadow/foreshadowTree'
import { useInspirationFilters } from '../pages/writer/inspiration/inspirationFilterContext'
import { mergeInspirationTags } from '../pages/writer/inspiration/inspirationPresets'
import { useActivityBar } from './activityBarContext'
import { MODULE_ENTITY_TYPE, isDossierModule, useModuleLabel } from './activityBarModules'
import type { FilterableModule } from './activityBarModules'
import { useRequestSwitch } from './unsavedSwitchGuard'

/** 搜索输入提交防抖（ms）：停止打字后 200ms 再写 Context。 */
const QUERY_DEBOUNCE = 200

export interface ActivityBarFilterPopoverProps {
  /** 触发浮层的可筛选模块。 */
  module: FilterableModule
  /** 锚点图标元素（连通时按其最新视口矩形定位）。 */
  anchorEl: HTMLElement
  /** 锚点快照（元素断开时兜底）。 */
  anchorRect: DOMRect
  /** 浮层根节点回调 ref：活动栏据此判断焦点 / 指针是否仍在浮层内。 */
  shellRef: (node: HTMLDivElement | null) => void
  /** 指针 / 焦点进入浮层：置「保持打开」并取消活动栏与浮层的收起计时。 */
  onKeepOpen: () => void
  /** 指针离开浮层：附带事件，供活动栏按 `relatedTarget` 判断是否仍在 hover 区域。 */
  onLeave: (event: ReactMouseEvent<HTMLDivElement>) => void
  /** 主动关闭浮层：选择分类 / 提交搜索后由活动栏收起浮层并交还焦点。 */
  onClose: () => void
}

export default function ActivityBarFilterPopover({
  module,
  anchorEl,
  anchorRect,
  shellRef,
  onKeepOpen,
  onLeave,
  onClose
}: ActivityBarFilterPopoverProps) {
  const { t: tDossier } = useTranslation('dossier')
  const { t: tInspiration } = useTranslation('inspiration')
  const { t: tForeshadow } = useTranslation('foreshadow')
  const {
    bookId: dossierBookId,
    filters: dossierFilters,
    setFilter: setDossierFilter
  } = useDossierFilters()
  const {
    filters: inspirationFilters,
    setFilter: setInspirationFilter,
    tags: inspirationTags
  } = useInspirationFilters()
  const { filters: foreshadowFilters, setFilter: setForeshadowFilter } =
    useForeshadowFilters(dossierBookId)
  const { active } = useActivityBar()
  // 模块切换统一经守卫：有未保存草稿时由写作页弹「保存并切换 / 放弃并切换」。
  const requestSwitch = useRequestSwitch()
  const moduleLabel = useModuleLabel(module)

  // 仅实体模块拉子类；灵感分支传 null，避免无谓请求。
  const dossierModule = isDossierModule(module) ? module : null
  const subtypes = useDossierSubtypes(
    dossierBookId,
    dossierModule === null ? null : MODULE_ENTITY_TYPE[dossierModule]
  )

  const entryQuery =
    dossierModule !== null
      ? dossierFilters[dossierModule].query
      : module === 'inspiration'
        ? inspirationFilters.query
        : foreshadowFilters.query
  const activeValue: string | null =
    dossierModule !== null
      ? dossierFilters[dossierModule].subtype
      : module === 'inspiration'
        ? inspirationFilters.tag
        : foreshadowFilters.status

  const allLabel =
    dossierModule !== null
      ? tDossier('filter.all')
      : module === 'inspiration'
        ? tInspiration('filter.all')
        : tForeshadow('filter.all')
  const copy =
    dossierModule !== null
      ? {
          searchPlaceholder: tDossier('filter.searchPlaceholder'),
          searchAria: tDossier('filter.searchAria'),
          search: tDossier('filter.search'),
          listAria: tDossier('filter.subtypeAria')
        }
      : module === 'inspiration'
        ? {
            searchPlaceholder: tInspiration('filter.searchPlaceholder'),
            searchAria: tInspiration('filter.searchAria'),
            search: tInspiration('filter.search'),
            listAria: tInspiration('filter.tagAria')
          }
        : {
            searchPlaceholder: tForeshadow('filter.searchPlaceholder'),
            searchAria: tForeshadow('filter.searchAria'),
            search: tForeshadow('filter.search'),
            listAria: tForeshadow('filter.statusAria')
          }

  // 搜索框本地受控值：挂载时取该模块 Context 中已有的 query（不是清空），
  // 之后只在本组件内更新，停止输入后再提交。
  const [query, setQuery] = useState(() => entryQuery)
  /** 最新本地值：flush 走 ref，避免卸载 / 失焦回调拿到旧 state。 */
  const queryRef = useRef(query)
  /** 已写入 Context 的值（相同值不再写，减少无谓的 Provider / 网格重渲染）。 */
  const committedRef = useRef(entryQuery)
  /** 组合输入（中文拼音等）期间挂起提交，`compositionend` 后再按防抖提交最终值。 */
  const composingRef = useRef(false)
  /** 是否有尚未写入 Context 的本地值。 */
  const pendingRef = useRef(false)
  const debounceTimer = useRef<number | null>(null)

  const cancelDebounce = useCallback((): void => {
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
  }, [])

  /** 写入 Context：与已提交值相同则跳过。 */
  const commitQuery = useCallback(
    (value: string): void => {
      if (value === committedRef.current) return
      committedRef.current = value
      if (dossierModule !== null) setDossierFilter(dossierModule, { query: value })
      else if (module === 'inspiration') setInspirationFilter({ query: value })
      else setForeshadowFilter({ query: value })
    },
    [dossierModule, module, setDossierFilter, setForeshadowFilter, setInspirationFilter]
  )

  /**
   * 立即提交挂起的本地值（失焦 / Enter / 卸载共用）：先清防抖计时，再写最新值。
   * 写入模块由本实例的 props 固定，切换模块时不会串到别的模块。
   */
  const flushQuery = useCallback((): void => {
    cancelDebounce()
    if (!pendingRef.current) return
    pendingRef.current = false
    commitQuery(queryRef.current)
  }, [cancelDebounce, commitQuery])

  /** 防抖提交：组合输入期间不排（拼音阶段不能把 `chao` 当关键词写进筛选）。 */
  const scheduleCommit = useCallback((): void => {
    cancelDebounce()
    pendingRef.current = true
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null
      pendingRef.current = false
      commitQuery(queryRef.current)
    }, QUERY_DEBOUNCE)
  }, [cancelDebounce, commitQuery])

  // 卸载（浮层收起 / 切换模块）时**先 flush 再清理**：防抖窗口内的最后一次输入
  // 不随组件卸载丢失；flush 写入的是本实例的 module。
  useEffect(() => flushQuery, [flushQuery])

  /** 输入只改本地值；正常输入走防抖，组合输入期间挂起（等 `compositionend`）。 */
  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value
    queryRef.current = next
    setQuery(next)
    pendingRef.current = true
    if (composingRef.current) {
      cancelDebounce()
      return
    }
    scheduleCommit()
  }

  /** 组合输入开始：丢弃挂起的旧提交，拼音阶段不写关键词。 */
  const handleCompositionStart = (): void => {
    composingRef.current = true
    cancelDebounce()
  }

  /** 组合输入结束：以最终上屏文本重新排定防抖提交。 */
  const handleCompositionEnd = (event: ReactCompositionEvent<HTMLInputElement>): void => {
    composingRef.current = false
    const next = event.currentTarget.value
    queryRef.current = next
    setQuery(next)
    scheduleCommit()
  }

  /** 失焦立即提交：浮层收起 / 焦点移走时不再依赖 200ms 防抖。 */
  const handleQueryBlur = (): void => {
    composingRef.current = false
    flushQuery()
  }

  /** Enter 立即提交；组合输入中按 Enter 是确认候选词，不当作提交。 */
  const handleQueryKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || composingRef.current) return
    if (event.key !== 'Enter') return
    event.preventDefault()
    flushQuery()
  }

  /** 清空即时生效（点击清除按钮要立刻反馈），并丢掉挂起的提交。 */
  const handleQueryClear = (): void => {
    cancelDebounce()
    pendingRef.current = false
    queryRef.current = ''
    setQuery('')
    commitQuery('')
  }

  // 「全部」恒在；实体分支按分类表顺序追加子类，灵感分支追加「预设 ∪ 已用标签」，
  // 伏笔分支按派生状态固定顺序追加四个状态。
  const options = useMemo<Array<{ value: string | null; label: string }>>(() => {
    if (dossierModule !== null) {
      return [
        { value: null, label: allLabel },
        ...subtypes.map((row) => ({ value: String(row.id), label: row.name }))
      ]
    }
    if (module === 'inspiration') {
      return [
        { value: null, label: allLabel },
        ...mergeInspirationTags(inspirationTags).map((tag) => ({ value: tag, label: tag }))
      ]
    }
    return [
      { value: null, label: allLabel },
      ...FORESHADOW_FILTER_STATUSES.map((status) => ({
        value: status,
        label: tForeshadow(FORESHADOW_STATUS_LABEL_KEYS[status])
      }))
    ]
  }, [allLabel, dossierModule, inspirationTags, module, subtypes, tForeshadow])

  const isCurrentModule = active === module

  /** 应用分类筛选并切到该模块（切换走模块切换守卫，保留未保存改动确认）。 */
  const handlePick = (value: string | null): void => {
    // 筛选条件先写入（立即生效，不受守卫影响），模块切换交给守卫裁决。
    if (dossierModule !== null) {
      setDossierFilter(dossierModule, { subtype: value ?? FILTER_ALL })
    } else if (module === 'inspiration') {
      setInspirationFilter({ tag: value })
    } else {
      setForeshadowFilter({ status: value === null ? null : (value as ForeshadowDisplayStatus) })
    }
    requestSwitch(module)
    onClose()
  }

  /**
   * 空关键词且浮层模块就是当前模块时没有可提交的内容（禁用按钮）；
   * 其余情况（有关键词，或要切到别的模块）都允许点，切换仍受未保存守卫约束。
   */
  const canSubmitSearch = query.trim().length > 0 || !isCurrentModule

  /** 搜索按钮：先 flush 防抖窗口内的关键词，再切到该模块让关键词生效。 */
  const handleSearchSubmit = (): void => {
    flushQuery()
    requestSwitch(module)
    onClose()
  }

  return (
    <HoverPopupShell
      anchorRect={anchorRect}
      anchorEl={anchorEl}
      placement="right"
      className="act-filter"
      role="group"
      contentKey={options}
      elementRef={shellRef}
      onPointerEnter={onKeepOpen}
      onPointerLeave={onLeave}
    >
      {/* 第一行：模块名 + 搜索框 + 圆形提交按钮（按钮先把关键词落进 Context，再切到该模块）。 */}
      <div className="act-filter__headrow">
        <div className="act-filter__head">{moduleLabel}</div>
        <SearchInput
          className="act-filter__search"
          showIcon={false}
          value={query}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchAria}
          autoComplete="off"
          spellCheck={false}
          onChange={handleQueryChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleQueryKeyDown}
          onBlur={handleQueryBlur}
          onClear={handleQueryClear}
          onFocus={onKeepOpen}
        />
        <button
          type="button"
          className="act-filter__search-btn"
          aria-label={copy.search}
          title={copy.search}
          disabled={!canSubmitSearch}
          onClick={handleSearchSubmit}
        >
          <SearchIcon />
        </button>
      </div>
      {/* 第二行：「全部」+ 该模块的全部分类（无分类时只剩「全部」，属自然状态）。 */}
      <div className="act-filter__list" role="group" aria-label={copy.listAria}>
        {options.map((option) => {
          const selected = activeValue === option.value
          return (
            <button
              key={option.value ?? '__all__'}
              type="button"
              className={cn('act-filter__item', selected && 'is-active')}
              aria-pressed={selected}
              onClick={() => handlePick(option.value)}
            >
              <span className="act-filter__item-label">{option.label}</span>
            </button>
          )
        })}
      </div>
    </HoverPopupShell>
  )
}

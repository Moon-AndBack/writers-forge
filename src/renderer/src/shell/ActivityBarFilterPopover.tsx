/**
 * 活动栏「模块筛选」浮层（五个实体模块图标 hover 触发）。
 *
 * 交互：鼠标移入模块图标 → 浮层贴活动栏右侧展开（`HoverPopupShell` 的 `right` 定位，
 * 固定态内缩 64px 由 `popoverGeometry` 统一处理）；移出按钮与浮层约 300ms 后收起
 * （计时器在 `activityBar.tsx`，本组件只管内容与「进入 / 离开」上报）。
 *
 * 内容：模块名 + 搜索框（模糊匹配**名称 + 别名**，不含正文）+ 结果计数 + 列表
 * （全部 / 各子类）。点击列表项 = 写入该模块的筛选条件并切到该模块；
 * 搜索框只写关键词（当前模块即时生效，非当前模块暂存，点列表项切过去后生效），
 * 不主动切模块——避免打字就触发未保存改动确认。
 * 计数只显示「匹配 N 项 / 无匹配」，不列匹配条目（结果本身在中栏网格看）；
 * 浮层模块不是当前活动模块时提示「切换后生效」，不拿未加载的数据显示 0。
 *
 * 收起保护：`onKeepOpen` 由活动栏提供，同时取消活动栏自身的收起计时与浮层计时；
 * 搜索框 `onFocus` 也调它，保证「Tab 聚焦输入框」不会因鼠标不在而收起。
 * 另外浮层根节点经 `shellRef` 回传活动栏，供 `focusin / focusout` 驱动同一「保持打开」状态。
 *
 * 搜索输入：本地受控 + 停止输入 `QUERY_DEBOUNCE` 后再提交到 Context，
 * 避免逐键触发 `DossierFilterProvider` → `DossierView` 全量重渲染。组合输入（IME）
 * 期间挂起提交，`compositionend` 后再按防抖提交；失焦 / Enter / 卸载时立即 flush，
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
import { SearchInput } from '../components/ui'
import { HoverPopupShell } from '../components/HoverPopupShell'
import { FILTER_ALL, useDossierFilters } from '../pages/writer/dossier/dossierFilterContext'
import { useDossierSubtypes } from '../pages/writer/dossier/useDossierSubtypes'
import { useActivityBar } from './activityBarContext'
import { MODULE_ENTITY_TYPE, useModuleLabel } from './activityBarModules'
import type { DossierModule } from './activityBarModules'

/** 搜索输入提交防抖（ms）：停止打字后 200ms 再写 Context。 */
const QUERY_DEBOUNCE = 200

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export interface ActivityBarFilterPopoverProps {
  /** 触发浮层的实体模块。 */
  module: DossierModule
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
}

export default function ActivityBarFilterPopover({
  module,
  anchorEl,
  anchorRect,
  shellRef,
  onKeepOpen,
  onLeave
}: ActivityBarFilterPopoverProps) {
  const { t } = useTranslation('dossier')
  const { bookId, filters, setFilter, summary } = useDossierFilters()
  const { active, setActive } = useActivityBar()
  const moduleLabel = useModuleLabel(module)
  const subtypes = useDossierSubtypes(bookId, MODULE_ENTITY_TYPE[module])
  const entry = filters[module]

  // 搜索框本地受控值：挂载时取该模块 Context 中已有的 query（不是清空），
  // 之后只在本组件内更新，停止输入后再提交。
  const [query, setQuery] = useState(() => entry.query)
  /** 最新本地值：flush 走 ref，避免卸载 / 失焦回调拿到旧 state。 */
  const queryRef = useRef(query)
  /** 已写入 Context 的值（相同值不再写，减少无谓的 Provider / 网格重渲染）。 */
  const committedRef = useRef(entry.query)
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
      setFilter(module, { query: value })
    },
    [module, setFilter]
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

  // 「全部」恒在；各子类按分类表顺序追加（值为分类 id 字符串，与 `subtypeId` 对齐）。
  const options = useMemo(
    () => [
      { value: FILTER_ALL, label: t('filter.all') },
      ...subtypes.map((row) => ({ value: String(row.id), label: row.name }))
    ],
    [subtypes, t]
  )

  // 结果计数：仅当浮层模块就是当前活动模块时展示真实计数（由中栏 `DossierView`
  // 按同一 `filterDossierRows` 口径上报）；其它模块尚未加载数据，提示切换后生效，
  // 避免拿不到汇总时误显示 0。
  const isCurrentModule = active === module
  const moduleSummary = summary[module]
  let statusText = ''
  if (!isCurrentModule) {
    statusText = t('filter.applyOnSwitch', { module: moduleLabel })
  } else if (moduleSummary !== undefined) {
    statusText =
      moduleSummary.matched === 0
        ? t('filter.noMatch')
        : t('filter.matchCount', { count: moduleSummary.matched })
  }

  /** 应用子类筛选并切到该模块（切换走活动栏既有入口，保留其未保存改动守卫）。 */
  const handlePick = (value: string): void => {
    setFilter(module, { subtype: value })
    setActive(module)
  }

  return (
    <HoverPopupShell
      anchorRect={anchorRect}
      anchorEl={anchorEl}
      placement="right"
      className="act-filter"
      role="group"
      contentKey={subtypes}
      elementRef={shellRef}
      onPointerEnter={onKeepOpen}
      onPointerLeave={onLeave}
    >
      <div className="act-filter__head">{moduleLabel}</div>
      <SearchInput
        className="act-filter__search"
        value={query}
        placeholder={t('filter.searchPlaceholder')}
        aria-label={t('filter.searchAria')}
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
      <p className="act-filter__status" role="status">
        {statusText}
      </p>
      <div className="act-filter__list" role="group" aria-label={t('filter.subtypeAria')}>
        {options.map((option) => {
          const selected = entry.subtype === option.value
          return (
            <button
              key={option.value}
              type="button"
              className={cn('act-filter__item', selected && 'is-active')}
              aria-pressed={selected}
              onClick={() => handlePick(option.value)}
            >
              <span className="act-filter__item-label">{option.label}</span>
              {selected ? (
                <span className="act-filter__check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </HoverPopupShell>
  )
}

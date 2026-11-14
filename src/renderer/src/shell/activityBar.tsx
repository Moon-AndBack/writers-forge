import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MorphIcon } from 'morphicons/react'
import { cn } from '@renderer/lib/cn'
import { IconButton } from '../components/ui'
import { useTooltip } from '../components/ui'
import { POPOVER_SHOW_DELAY } from '../components/popoverTiming'
import { ActivityBarContext, useActivityBar } from './activityBarContext'
import type { ActivityBarContextValue } from './activityBarContext'
import ActivityBarFilterPopover from './ActivityBarFilterPopover'
import { WRITER_MODULES, isFilterableModule } from './activityBarModules'
import type { FilterableModule, WriterModule } from './activityBarModules'
import { useActivityPinned } from './activityPinned'
import { MODULE_MORPH_ICONS } from './moduleIcons'
import { useRequestSwitch } from './unsavedSwitchGuard'

export type { WriterModule } from './activityBarModules'

/** 悬浮胶囊展开延迟（ms）与收起延迟（ms），与 template/index.html 原型一致。 */
const SHOW_DELAY = 180
const HIDE_DELAY = 800

/** 模块筛选浮层收起延迟（ms）：给「图标 → portal 浮层」的鼠标穿行留余量。 */
const FILTER_POPOVER_HIDE_DELAY = 300

/**
 * 活动栏 Provider：包裹窗口外壳，维护「当前模块」与「注册页计数」。
 *
 * 由于 `children` 由上层（App）以稳定引用传入，Provider 自身 state 变化只会重渲染
 * 读取上下文的外壳节点，不会重渲染页面子树，因此 `useRegisterActivityBar` 的注册
 * 不会回灌触发页面重渲染，不产生注册循环（与 statusBar / titleBarActions 同范式）。
 */
export function ActivityBarProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<WriterModule>('chapters')
  const [count, setCount] = useState(0)

  const register = useMemo(() => () => setCount((n) => n + 1), [])
  const unregister = useMemo(() => () => setCount((n) => Math.max(0, n - 1)), [])

  const value = useMemo<ActivityBarContextValue>(
    () => ({ active, setActive, visible: count > 0, register, unregister }),
    [active, count, register, unregister]
  )

  return <ActivityBarContext.Provider value={value}>{children}</ActivityBarContext.Provider>
}

/** 判定事件落点是否落在可筛选模块图标上（`IconButton` 的 `data-module` 钩子）。 */
function isFilterableIconTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const host = target.closest<HTMLElement>('[data-module]')
  const id = host?.dataset.module
  return id !== undefined && isFilterableModule(id as WriterModule)
}

/**
 * 活动栏视图：悬浮胶囊 `.act-pill` + 模块栏 `.activitybar`，两态可切换。
 *
 * - 悬浮态（默认）：hover 胶囊 180ms 后展开 `.activitybar.is-shown`，移出 800ms 后收起；
 * - 固定态：`body.act-pinned` 存在时活动栏常驻、胶囊隐藏（样式见 shell.css）；
 *   两态真源为 ActivityPinnedProvider（`useActivityPinned`），body 类由 Provider 投影；
 * - 固定态切换入口：状态栏图钉按钮 `.st-side-btn[data-state]`（PinButton.tsx）。
 */
export function ActivityBar(): ReactElement {
  const { t } = useTranslation('titlebar')
  const { t: tModule } = useTranslation('module')
  const { active } = useActivityBar()
  // 点图标切模块统一经守卫（页面注册了未保存守卫时先确认，否则直接切）。
  const requestSwitch = useRequestSwitch()
  const { pinned } = useActivityPinned()
  const [shown, setShown] = useState(false)
  // 模块筛选浮层：目标模块 + 锚点（活元素优先，快照兜底）。
  const [filterTarget, setFilterTarget] = useState<{
    module: FilterableModule
    anchorEl: HTMLElement
    anchorRect: DOMRect
  } | null>(null)
  const showTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const filterShowTimer = useRef<number | null>(null)
  const filterHideTimer = useRef<number | null>(null)
  const barRef = useRef<HTMLElement | null>(null)
  /** 浮层根节点（body portal）：焦点 / 指针是否仍在浮层内只能按节点包含关系判断。 */
  const filterNodeRef = useRef<HTMLDivElement | null>(null)
  /**
   * 浮层「保持打开」状态：由浮层 mouseenter / focusin 置 true，
   * mouseleave / focusout（relatedTarget 已离开浮层）置 false。
   * 两处收起计时器在回调开头都读它，指针或焦点仍在浮层内时一律不收起。
   */
  const filterEngagedRef = useRef(false)
  /** 主动关闭后交还焦点的一次性抑制：避免图标 onFocus 重新展开浮层。 */
  const suppressFilterFocusRef = useRef(false)

  /** 浮层根节点回调 ref（HoverPopupShell 的 `elementRef`）。 */
  const setFilterNode = useCallback((node: HTMLDivElement | null): void => {
    filterNodeRef.current = node
  }, [])
  const {
    anchorRef: pillRef,
    anchorProps: pillAnchor,
    tooltip: pillTooltip,
    cancelShow: cancelPillTooltipShow
  } = useTooltip<HTMLDivElement>({
    content: t('moduleBar'),
    placement: 'right'
  })

  // 进入固定态：清理挂起的展开 / 收起定时器（不在此处 setState，避免级联渲染）。
  // 「固定 ⇄ 悬浮」切换时收起展开面板由 App 的 ActivityBarSlot 以 key 重新挂载实现，
  // 内部 shown 状态随挂载自动复位，无需在此 effect 中写 setState。
  useEffect(() => {
    if (!pinned) return
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current)
      showTimer.current = null
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [pinned])

  // 卸载时清理挂起的定时器
  useEffect(
    () => () => {
      if (showTimer.current !== null) window.clearTimeout(showTimer.current)
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
      if (filterShowTimer.current !== null) window.clearTimeout(filterShowTimer.current)
      if (filterHideTimer.current !== null) window.clearTimeout(filterHideTimer.current)
    },
    []
  )

  // 竖条展开时取消胶囊 tooltip 尚未触发的显示计时，避免「模块栏」气泡压在已展开的栏上。
  useEffect(() => {
    if (shown) cancelPillTooltipShow()
  }, [cancelPillTooltipShow, shown])

  // 全局兜底：窗口失焦（Alt+Tab / 最小化）或指针快速移出视口时 mouseleave 可能丢失，
  // 清掉全部挂起计时并直接收起浮层与竖条，避免残留展开态。
  useEffect(() => {
    const closeAll = (): void => {
      if (showTimer.current !== null) {
        window.clearTimeout(showTimer.current)
        showTimer.current = null
      }
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
      if (filterShowTimer.current !== null) {
        window.clearTimeout(filterShowTimer.current)
        filterShowTimer.current = null
      }
      if (filterHideTimer.current !== null) {
        window.clearTimeout(filterHideTimer.current)
        filterHideTimer.current = null
      }
      filterEngagedRef.current = false
      setFilterTarget(null)
      setShown(false)
    }
    window.addEventListener('blur', closeAll)
    document.documentElement.addEventListener('mouseleave', closeAll)
    return () => {
      window.removeEventListener('blur', closeAll)
      document.documentElement.removeEventListener('mouseleave', closeAll)
    }
  }, [])

  const open = (delay: number): void => {
    if (pinned) return
    if (showTimer.current !== null) window.clearTimeout(showTimer.current)
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    showTimer.current = window.setTimeout(() => setShown(true), delay)
  }

  /**
   * 焦点是否仍停留在浮层的**文本输入**中（浮层是 body portal，只能按节点包含关系判断）。
   * 分类 chip / 搜索按钮等可聚焦控件不算：点完按钮后焦点若留在其上，
   * 不应让浮层与竖条永久钉住（点击按钮属于一次性操作，不是持续占用）。
   */
  const isFilterFocused = useCallback((): boolean => {
    const node = filterNodeRef.current
    const focused = document.activeElement
    if (node === null || focused === null || !node.contains(focused)) return false
    if (focused instanceof HTMLInputElement) return true
    return focused instanceof HTMLElement && focused.isContentEditable
  }, [])

  /**
   * 浮层是否仍被指针或焦点占用。
   *
   * 浮层 portal 到 body，`barRef.matches(':hover')` 覆盖不到它，必须单独判断：
   * ref 布尔由浮层 mouseenter / focusin / mouseleave / focusout 驱动，
   * `document.activeElement` 兜底（事件丢失时仍能识别「光标停在搜索框里」）。
   */
  const isFilterEngaged = useCallback((): boolean => {
    if (filterEngagedRef.current) return true
    return isFilterFocused()
  }, [isFilterFocused])

  const cancelHide = useCallback((): void => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const scheduleHide = useCallback((): void => {
    if (pinned) return
    if (showTimer.current !== null) window.clearTimeout(showTimer.current)
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      // 守卫：指针或焦点仍在筛选浮层内时不得收起活动栏 —— 浮层是 body portal，
      // 下面的 `matches(':hover')` 判据覆盖不到它，否则会「浮层关掉顺带收起整栏」。
      if (isFilterEngaged()) return
      setShown(false)
      // 栏收起时浮层不得悬空；一并清掉目标（计时器随浮层卸载即无意义）。
      setFilterTarget(null)
    }, HIDE_DELAY)
  }, [isFilterEngaged, pinned])

  // ---------- 模块筛选浮层（可筛选模块图标 hover：实体五域 + 灵感） ----------

  const cancelFilterHide = useCallback((): void => {
    if (filterHideTimer.current !== null) {
      window.clearTimeout(filterHideTimer.current)
      filterHideTimer.current = null
    }
  }, [])

  /**
   * 主动收起筛选浮层（选择分类 / 提交搜索 / Escape 共用）：
   * 清掉展开与收起计时、复位「保持打开」，再把焦点交还触发图标。
   * 指针已不在活动栏上时按常规延迟收起整栏；仍在栏上则保持展开。
   */
  const dismissFilter = useCallback((): void => {
    const anchorEl = filterTarget?.anchorEl ?? null
    if (filterShowTimer.current !== null) {
      window.clearTimeout(filterShowTimer.current)
      filterShowTimer.current = null
    }
    cancelFilterHide()
    cancelHide()
    filterEngagedRef.current = false
    setFilterTarget(null)
    if (anchorEl !== null && anchorEl.isConnected) {
      // focus 事件同步派发：若已聚焦 / 不可聚焦而未触发，立即复位，避免吞掉下一次键盘聚焦。
      suppressFilterFocusRef.current = true
      anchorEl.focus({ preventScroll: true })
      suppressFilterFocusRef.current = false
    }
    if (!barRef.current?.matches(':hover')) scheduleHide()
  }, [cancelFilterHide, cancelHide, filterTarget, scheduleHide])

  // 浮层展开期间：Escape 收起并交还焦点（已被上层弹层处理的事件不重复响应）。
  useEffect(() => {
    if (filterTarget === null) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') return
      dismissFilter()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dismissFilter, filterTarget])

  /** 挂起收起浮层：延迟结束再判「指针 / 焦点是否仍在浮层内」，避免栏永久展开。 */
  const scheduleFilterHide = useCallback((): void => {
    if (filterShowTimer.current !== null) {
      window.clearTimeout(filterShowTimer.current)
      filterShowTimer.current = null
    }
    cancelFilterHide()
    filterHideTimer.current = window.setTimeout(() => {
      filterHideTimer.current = null
      // 核心守卫：指针或焦点仍在浮层内（典型：点进搜索框后鼠标移出再继续打字）
      // 时，任何 hover 计时都不允许卸载浮层 —— 否则输入框会随之失焦。
      if (isFilterEngaged()) return
      setFilterTarget(null)
      if (!barRef.current?.matches(':hover')) scheduleHide()
    }, FILTER_POPOVER_HIDE_DELAY)
  }, [cancelFilterHide, isFilterEngaged, scheduleHide])

  /** 指针 / 焦点进入浮层：置「保持打开」并取消两处收起计时。 */
  const engageFilter = useCallback((): void => {
    filterEngagedRef.current = true
    cancelFilterHide()
    cancelHide()
  }, [cancelFilterHide, cancelHide])

  /** 指针离开浮层：落点仍在浮层内 / 可筛选图标上时不算离开；否则重算 engaged 并排计时。 */
  const releaseFilter = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      const next: EventTarget | null = event.relatedTarget
      if (next instanceof Node) {
        if (filterNodeRef.current?.contains(next)) return
        if (isFilterableIconTarget(next)) return
      }
      // 指针已离开：仅当焦点仍在浮层内时保持「保持打开」，计时器守卫据此放行或拦截。
      filterEngagedRef.current = isFilterFocused()
      scheduleFilterHide()
    },
    [isFilterFocused, scheduleFilterHide]
  )

  /** 指针离开可筛选模块图标：只有落点既不在浮层内、也不在可筛选图标上时才排收起。 */
  const handleIconLeave = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>): void => {
      const next: EventTarget | null = event.relatedTarget
      if (next instanceof Node) {
        if (filterNodeRef.current?.contains(next)) return
        if (isFilterableIconTarget(next)) return
      }
      filterEngagedRef.current = isFilterFocused()
      scheduleFilterHide()
    },
    [isFilterFocused, scheduleFilterHide]
  )

  /** 指针离开活动栏：落点在浮层内时视为仍在同一 hover 区域，不收起活动栏。 */
  const handleBarLeave = (event: ReactMouseEvent<HTMLElement>): void => {
    const next: EventTarget | null = event.relatedTarget
    if (next instanceof Node && filterNodeRef.current?.contains(next)) return
    scheduleHide()
  }

  /**
   * 焦点驱动：浮层是 body portal，React 合成事件无法从活动栏冒泡覆盖到它，
   * 故在浮层根节点上直接监听 focusin / focusout，与 hover 一起驱动同一个
   * `filterEngagedRef`。
   */
  useEffect(() => {
    if (filterTarget === null) return
    const node = filterNodeRef.current
    if (node === null) return
    const handleFocusIn = (): void => {
      filterEngagedRef.current = true
      cancelFilterHide()
      cancelHide()
    }
    const handleFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget
      // 焦点只在浮层内部移动（搜索框 → 列表项）：仍保持打开。
      if (next instanceof Node && node.contains(next)) return
      // 焦点已离开：仅当指针仍在浮层内时保持「保持打开」，否则开始收起计时。
      const pointerInside = node.matches(':hover')
      filterEngagedRef.current = pointerInside
      if (!pointerInside) scheduleFilterHide()
    }
    node.addEventListener('focusin', handleFocusIn)
    node.addEventListener('focusout', handleFocusOut)
    return () => {
      node.removeEventListener('focusin', handleFocusIn)
      node.removeEventListener('focusout', handleFocusOut)
    }
  }, [cancelFilterHide, cancelHide, filterTarget, scheduleFilterHide])

  // 浮层卸载后清掉「保持打开」残留，避免下次打开被旧状态挡住计时器。
  useEffect(() => {
    if (filterTarget !== null) return
    filterEngagedRef.current = false
  }, [filterTarget])

  /** 在图标上停留 `POPOVER_SHOW_DELAY` 后展开该模块的筛选浮层。 */
  const openFilter = (module: FilterableModule, anchorEl: HTMLElement): void => {
    if (filterShowTimer.current !== null) window.clearTimeout(filterShowTimer.current)
    cancelFilterHide()
    filterShowTimer.current = window.setTimeout(() => {
      filterShowTimer.current = null
      if (!anchorEl.isConnected) return
      setFilterTarget({ module, anchorEl, anchorRect: anchorEl.getBoundingClientRect() })
    }, POPOVER_SHOW_DELAY)
  }

  return (
    <>
      {pillTooltip}
      <div
        ref={pillRef}
        className={cn('act-pill', shown && 'is-hidden')}
        onMouseEnter={() => {
          pillAnchor.onMouseEnter()
          open(SHOW_DELAY)
        }}
        onMouseLeave={() => {
          pillAnchor.onMouseLeave()
          if (!barRef.current?.matches(':hover')) scheduleHide()
        }}
        onFocus={pillAnchor.onFocus}
        onBlur={pillAnchor.onBlur}
        aria-describedby={pillAnchor['aria-describedby']}
      >
        <span />
        <span />
        <span />
      </div>

      <aside
        ref={barRef}
        className={cn('activitybar', shown && 'is-shown')}
        aria-label={t('moduleBarAria')}
        onMouseEnter={cancelHide}
        onMouseLeave={handleBarLeave}
      >
        {WRITER_MODULES.map((id) => {
          const icons = MODULE_MORPH_ICONS[id]
          const isActive = active === id
          // 可筛选模块（实体五域 + 灵感）额外挂「模块筛选」hover 浮层；
          // `data-module` 供状态定位 / 样式钩子。
          const filterModule: FilterableModule | null = isFilterableModule(id) ? id : null
          return (
            <IconButton
              key={id}
              variant="ghost"
              className={cn('act-btn', isActive && 'is-active')}
              label={tModule(id)}
              // 可筛选模块的自绘 tooltip 让位给筛选浮层，避免两层浮层在同一锚点重叠。
              tooltip={filterModule ? '' : undefined}
              tooltipPlacement="right"
              aria-pressed={isActive}
              data-module={id}
              onClick={() => requestSwitch(id)}
              onMouseEnter={
                filterModule ? (event) => openFilter(filterModule, event.currentTarget) : undefined
              }
              onMouseLeave={filterModule ? handleIconLeave : undefined}
              onFocus={
                filterModule
                  ? (event) => {
                      // 主动关闭交还焦点时的一次性抑制：程序化 focus 不得重新展开浮层。
                      if (suppressFilterFocusRef.current) return
                      // 仅键盘聚焦（`:focus-visible`）展开，指针路径交给 hover。
                      if (event.currentTarget.matches(':focus-visible')) {
                        openFilter(filterModule, event.currentTarget)
                      }
                    }
                  : undefined
              }
            >
              {/* 形变图标：新选中模块 idle → active，取消选中的模块反向形变；
                  形变由 SVG 路径插值完成（非 CSS transform），尺寸 / 颜色仍由
                  `.act-btn > svg`（18×18）与 `currentColor` 统一约束。 */}
              <MorphIcon
                icon={isActive ? icons.active : icons.idle}
                size={18}
                strokeWidth={1.9}
                reducedMotion="user"
              />
            </IconButton>
          )
        })}
      </aside>

      {/* 模块筛选浮层（portal 到 body）：指针移入浮层时必须取消活动栏自身的收起计时，
          否则 `<aside>` 的 mouseleave 会在 800ms 后把整栏收起、浮层悬空。
          `key` 绑定模块：切换模块时重挂载，搜索框以该模块已有 query 重新初始化。 */}
      {filterTarget !== null ? (
        <ActivityBarFilterPopover
          key={filterTarget.module}
          module={filterTarget.module}
          anchorEl={filterTarget.anchorEl}
          anchorRect={filterTarget.anchorRect}
          shellRef={setFilterNode}
          onKeepOpen={engageFilter}
          onLeave={releaseFilter}
          onClose={dismissFilter}
        />
      ) : null}
    </>
  )
}

export default ActivityBar

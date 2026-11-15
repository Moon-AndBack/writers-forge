import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MorphIcon } from 'morphicons/react'
import { cn } from '@renderer/lib/cn'
import { IconButton } from '../components/ui'
import { useTooltip } from '../components/ui'
import { ActivityBarContext, useActivityBar } from './activityBarContext'
import type { ActivityBarContextValue } from './activityBarContext'
import { ActivityPill } from './activityPill'
import { WRITER_MODULES } from './activityBarModules'
import type { WriterModule } from './activityBarModules'
import { useActivityPinned } from './activityPinned'
import { MODULE_MORPH_ICONS } from './moduleIcons'
import { useRequestSwitch } from './unsavedSwitchGuard'

export type { WriterModule } from './activityBarModules'

/** 悬浮胶囊展开延迟（ms）与收起延迟（ms），与 template/index.html 原型一致。 */
const SHOW_DELAY = 180
const HIDE_DELAY = 800

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

/**
 * 活动栏视图：悬浮胶囊 `.act-pill` + 模块栏 `.activitybar`，两态可切换。
 *
 * - 悬浮态（默认）：hover 胶囊 180ms 后展开 `.activitybar.is-shown`，移出 800ms 后收起；
 * - 固定态：`body.act-pinned` 存在时活动栏常驻、胶囊隐藏（样式见 shell.css）；
 *   两态真源为 ActivityPinnedProvider（`useActivityPinned`），body 类由 Provider 投影；
 * - 固定态切换入口：状态栏图钉按钮 `.st-side-btn[data-state]`（PinButton.tsx）。
 *
 * 模块筛选入口统一在标题栏筛选行（`TitleBarFilterRow`），活动栏图标只负责切模块，
 * 悬停显示模块名 tooltip（由 `IconButton` 自绘）。
 */
export function ActivityBar(): ReactElement {
  const { t } = useTranslation('titlebar')
  const { t: tModule } = useTranslation('module')
  const { active } = useActivityBar()
  // 点图标切模块统一经守卫（页面注册了未保存守卫时先确认，否则直接切）。
  const requestSwitch = useRequestSwitch()
  const { pinned } = useActivityPinned()
  const [shown, setShown] = useState(false)
  const showTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const barRef = useRef<HTMLElement | null>(null)

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
    },
    []
  )

  // 竖条展开时取消胶囊 tooltip 尚未触发的显示计时，避免「模块栏」气泡压在已展开的栏上。
  useEffect(() => {
    if (shown) cancelPillTooltipShow()
  }, [cancelPillTooltipShow, shown])

  // 全局兜底：窗口失焦（Alt+Tab / 最小化）或指针快速移出视口时 mouseleave 可能丢失，
  // 清掉全部挂起计时并直接收起竖条，避免残留展开态。
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

  /** 键盘展开（胶囊 Enter / Space）：立即展开，并把焦点交给首个模块按钮；
      活动栏的 `inert` 本次提交后才解除，故等下一帧再聚焦（同步会被拦下）。 */
  const expandForKeyboard = useCallback((): void => {
    if (pinned) return
    setShown(true)
    window.requestAnimationFrame(() => {
      barRef.current?.querySelector<HTMLElement>('.act-btn')?.focus()
    })
  }, [pinned])

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
      // 守卫：键盘焦点仍在活动栏内时不得收起 —— 收起会让 `inert` 生效并抢走焦点，
      // 用户的 Tab 位置随之丢失。焦点离开后由栏的 `onBlur` 重新排收起。
      if (barRef.current?.contains(document.activeElement)) return
      setShown(false)
    }, HIDE_DELAY)
  }, [pinned])

  return (
    <>
      {pillTooltip}
      <ActivityPill
        shown={shown}
        pillRef={pillRef}
        anchorProps={pillAnchor}
        label={t('moduleBar')}
        onEnter={() => open(SHOW_DELAY)}
        onLeave={() => {
          pillAnchor.onMouseLeave()
          if (!barRef.current?.matches(':hover')) scheduleHide()
        }}
        onExpand={expandForKeyboard}
      />

      <aside
        ref={barRef}
        className={cn('activitybar', shown && 'is-shown')}
        aria-label={t('moduleBarAria')}
        // 收起态整体移出焦点顺序与无障碍树（CSS 只有 opacity / transform，Tab 仍可进入）。
        // 固定态常驻可见，永不 inert（否则固定活动栏无法键盘操作）。
        inert={!pinned && !shown}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
        onKeyDown={(event) => {
          // 键盘收起：仅收起悬停态；固定态常驻。
          if (event.key !== 'Escape' || pinned) return
          event.preventDefault()
          setShown(false)
          pillRef.current?.focus()
        }}
        onBlur={(event) => {
          // 焦点在栏内移动（按钮之间）不收起；真正离开后按常规延迟收起。
          const next = event.relatedTarget
          if (next instanceof Node && event.currentTarget.contains(next)) return
          scheduleHide()
        }}
      >
        {WRITER_MODULES.map((id) => {
          const icons = MODULE_MORPH_ICONS[id]
          const isActive = active === id
          return (
            <IconButton
              key={id}
              variant="ghost"
              className={cn('act-btn', isActive && 'is-active')}
              label={tModule(id)}
              tooltipPlacement="right"
              aria-pressed={isActive}
              onClick={() => requestSwitch(id)}
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
    </>
  )
}

export default ActivityBar

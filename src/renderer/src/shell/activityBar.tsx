import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MorphIcon } from 'morphicons/react'
import { IconButton } from '../components/ui'
import { useTooltip } from '../components/ui'
import { ActivityBarContext, useActivityBar } from './activityBarContext'
import type { ActivityBarContextValue } from './activityBarContext'
import { WRITER_MODULES } from './activityBarModules'
import type { WriterModule } from './activityBarModules'
import { useActivityPinned } from './activityPinned'
import { MODULE_MORPH_ICONS } from './moduleIcons'

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

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
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
  const { active, setActive } = useActivityBar()
  const { pinned } = useActivityPinned()
  const [shown, setShown] = useState(false)
  const showTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const barRef = useRef<HTMLElement | null>(null)
  const {
    anchorRef: pillRef,
    anchorProps: pillAnchor,
    tooltip: pillTooltip
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

  const open = (delay: number): void => {
    if (pinned) return
    if (showTimer.current !== null) window.clearTimeout(showTimer.current)
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    showTimer.current = window.setTimeout(() => setShown(true), delay)
  }

  const scheduleHide = (): void => {
    if (pinned) return
    if (showTimer.current !== null) window.clearTimeout(showTimer.current)
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShown(false), HIDE_DELAY)
  }

  const cancelHide = (): void => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
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
        onMouseLeave={scheduleHide}
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
              onClick={() => setActive(id)}
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

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MorphIcon } from 'morphicons/react'
import { IconButton } from '../components/ui'
import { useTooltip } from '../components/ui'
import { useActivityPinned } from './activityPinned'
import { MODULE_MORPH_ICONS } from './moduleIcons'

/** 写作模块标识（活动栏可在其间切换）。 */
export type WriterModule =
  | 'chapters'
  | 'outline'
  | 'plot'
  | 'worldview'
  | 'characters'
  | 'factions'
  | 'power_system'
  | 'items'
  | 'timeline'
  | 'foreshadow'
  | 'inspiration'

/**
 * 模块名（i18n）：键即模块 id，展示名取自 `module` 命名空间，随界面语言切换。
 *
 * 命名说明：`worldview` 承载「世界观」，语义为世界观 / 设定条目，
 * 刻意避开 `settings`（易与「应用设置」混淆）；其余 id 取英文语义名
 * `plot` / `characters` / `factions` / `power_system` / `items` / `timeline` /
 * `foreshadow` / `inspiration`（`items` 承载「物品功法」，即物品与功法条目）。
 */
export function useModuleLabel(id: WriterModule): string {
  const { t } = useTranslation('module')
  return t(id)
}

/** 活动栏模块清单（顺序即渲染顺序）：章节 / 大纲 / 剧情 / 世界观 / 角色 / 势力 /
 *  境界体系 / 物品功法 / 时间线 / 伏笔 / 灵感。 */
export const WRITER_MODULES: readonly WriterModule[] = [
  'chapters',
  'outline',
  'plot',
  'worldview',
  'characters',
  'factions',
  'power_system',
  'items',
  'timeline',
  'foreshadow',
  'inspiration'
]

/** 悬浮胶囊展开延迟（ms）与收起延迟（ms），与 template/index.html 原型一致。 */
const SHOW_DELAY = 180
const HIDE_DELAY = 800

interface ActivityBarContextValue {
  /** 当前激活模块，默认 `chapters`。 */
  active: WriterModule
  /** 切换激活模块。 */
  setActive: (module: WriterModule) => void
  /** 是否渲染活动栏：由「是否有页面注册」决定。 */
  visible: boolean
  /** 页面注册 / 注销回调（内部使用，保持引用稳定避免注册循环）。 */
  register: () => void
  unregister: () => void
}

const ActivityBarContext = createContext<ActivityBarContextValue | null>(null)

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
 * 读取活动栏状态。无 Provider（如独立测试渲染）时回退为不可见，
 * 保证调用方不会因缺省上下文而崩溃。
 */
export function useActivityBar(): {
  active: WriterModule
  setActive: (module: WriterModule) => void
  visible: boolean
} {
  const context = useContext(ActivityBarContext)
  if (!context) {
    return { active: 'chapters', setActive: () => undefined, visible: false }
  }
  return { active: context.active, setActive: context.setActive, visible: context.visible }
}

/**
 * 页面声明「本页需要活动栏」：`enabled` 为 true 时注册，卸载或置 false 时注销。
 * 无活动栏 Provider 时为空操作（不影响既有页面）。
 */
export function useRegisterActivityBar(enabled: boolean): void {
  const context = useContext(ActivityBarContext)
  const register = context?.register
  const unregister = context?.unregister

  useEffect(() => {
    if (!enabled || !register || !unregister) return undefined
    register()
    return () => unregister()
  }, [enabled, register, unregister])
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

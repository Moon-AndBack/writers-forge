import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type {
  PointerEvent as ReactPointerEvent,
  TransitionEvent as ReactTransitionEvent
} from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { POPOVER_HIDE_DELAY, POPOVER_SHOW_DELAY } from '../../components/popoverTiming'
import { getLiveSnapshot, SPEED_MIN_CHARS, useWritingSession } from '../writingSession'
import type { WritingSessionSnapshot } from '../writingSession'
import WritingSessionDetail from './WritingSessionDetail'

/** 锁定态浮层的视口坐标（拖拽后只更新这里，解锁即归空）。 */
interface DragPosition {
  left: number
  top: number
}

/**
 * 解锁复位后的自动收起延时（ms）。
 *
 * 复位动画把弹窗从拖动位置移回状态栏上方；解锁意味着回到「按需查看」，
 * 归位后不应常驻，且指针通常已被移动的弹窗甩出。因此复位完成（过渡结束，
 * 零位移取解锁瞬间）后开始计时，到点自动关闭；期间重新移入弹窗视为用户
 * 仍想看，取消计时。取值 500ms：给「追回弹窗」留出余量，又不会长期滞留。
 */
const RESET_AUTO_CLOSE_MS = 500

/**
 * 状态栏「本次码字」胶囊：书架页与写作页共用（挂在外壳 `StatusBar` 内）。
 *
 * 数据来自 `shell/writingSession`（模块级 store）：启动即常驻渲染（零值显示
 * 「本次 0 字」），净增字数为负时展示 0。不足 `SPEED_MIN_CHARS` 字只显示字数，
 * 避免「首字 → 天文时速」的误导。
 *
 * 胶囊同时是详情浮层的触发器（`.st-popup` 向上展开，避免状态栏贴底被裁切）：
 * - 悬停 260ms 打开 / 移出 120ms 关闭（`popoverTiming`）；
 * - 点击打开后为「粘住」态：移出仍显示，点外部 / Esc 关闭；
 * - 浮层内锁定后常驻：移出 / 点外部 / Esc 均不关闭，必须先点锁图标解锁；
 * - 锁定后浮层切到 `position: fixed`，标题区成为拖动把手；解锁复位回锚点并恢复 hover，
 *   复位结束后 500ms 自动收起（期间重新移入弹窗则取消收起）。
 * 打开时用 `getLiveSnapshot()` 现算总时长 / 空闲时长，不引入常驻定时器。
 */
export default function WritingSessionStats() {
  const { t } = useTranslation('status')
  const { chars, speed } = useWritingSession()
  const [detail, setDetail] = useState<WritingSessionSnapshot | null>(null)
  /** 点击打开（非锁定）：移出不关，点外部 / Esc 关。 */
  const [sticky, setSticky] = useState(false)
  /** 锁定常驻：移出 / 点外部 / Esc 都不关，只能先点锁图标解锁。 */
  const [locked, setLocked] = useState(false)
  /** 锁定态的固定定位；null = 跟随状态栏胶囊（绝对定位）。 */
  const [position, setPosition] = useState<DragPosition | null>(null)
  /** 拖动中（仅用于 `cursor: grabbing`）。 */
  const [dragging, setDragging] = useState(false)
  /** 解锁复位动画进行中（仅此时给 left / top 挂过渡）。 */
  const [resetting, setResetting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  /** 指针相对浮层左上角的偏移（拖动期间保持不变）。 */
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  /** 拖动真源（事件处理器不依赖渲染后的 state，避免首帧 pointermove 丢事件）。 */
  const draggingRef = useRef(false)
  /** 复位动画真源（同步取消：动画期间再次上锁不能被残留的 transitionend 拉回）。 */
  const resettingRef = useRef(false)
  /** 复位后的自动收起计时（到点关闭详情；null = 无计时）。 */
  const resetCloseTimerRef = useRef<number | null>(null)
  const popupId = useId()

  const clearResetCloseTimer = useCallback((): void => {
    if (resetCloseTimerRef.current !== null) {
      window.clearTimeout(resetCloseTimerRef.current)
      resetCloseTimerRef.current = null
    }
  }, [])

  const clearTimers = useCallback((): void => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const closeDetail = useCallback((): void => {
    setDetail(null)
    setSticky(false)
    setLocked(false)
    setPosition(null)
    setDragging(false)
    setResetting(false)
    draggingRef.current = false
    resettingRef.current = false
    clearResetCloseTimer()
  }, [clearResetCloseTimer])

  /** 复位完成后延时自动收起；重复调度会覆盖上一次计时。 */
  const scheduleResetClose = useCallback((): void => {
    clearResetCloseTimer()
    resetCloseTimerRef.current = window.setTimeout(() => {
      resetCloseTimerRef.current = null
      closeDetail()
    }, RESET_AUTO_CLOSE_MS)
  }, [clearResetCloseTimer, closeDetail])

  /** 浮层根节点：既供内容组件挂载，也供拖动 / 边界测量读取。 */
  const setPopupRef = useCallback((node: HTMLDivElement | null): void => {
    popupRef.current = node
  }, [])

  /**
   * 内容区上下沿（视口坐标）：上沿 = 标题栏底边，下沿 = 状态栏顶边。
   *
   * 按实际元素位置实测，而非把 CSS 高度（shell.css `.titlebar` 42px、
   * statusbar.css `.statusbar` 36px）复制进 TS：窗口布局 / 高度调整时自动跟随。
   * 元素缺失时回退到视口顶 / 底，等价于改动前的整视口边界。
   */
  const measureContentArea = useCallback((): { top: number; bottom: number } => {
    const titlebar = document.querySelector('.titlebar')
    const statusbar = document.querySelector('.statusbar')
    return {
      top: titlebar?.getBoundingClientRect().bottom ?? 0,
      bottom: statusbar?.getBoundingClientRect().top ?? window.innerHeight
    }
  }, [])

  /** 把固定坐标限制在窗口内容区内（避开标题栏 / 状态栏；拖出边界 / 窗口缩小后回 clamp）。 */
  const clampPosition = useCallback(
    (left: number, top: number): DragPosition => {
      const node = popupRef.current
      const width = node?.offsetWidth ?? 0
      const height = node?.offsetHeight ?? 0
      const area = measureContentArea()
      return {
        left: Math.min(Math.max(0, left), Math.max(0, window.innerWidth - width)),
        // 可用高度不足弹窗高度（极端窄窗）时贴内容区上沿：标题区仍可见可拖，
        // 宁可溢出内容区底部，也不让浮层整体没入标题栏。
        top: Math.min(Math.max(area.top, top), Math.max(area.top, area.bottom - height))
      }
    },
    [measureContentArea]
  )

  /**
   * 读取弹层「跟随锚点」时的自然坐标：临时清空 fixed 内联定位，量完立即还原。
   *
   * 只在解锁事件里同步调用（同一事件内还原，不会产生可见闪烁），
   * 这样无需把 CSS 的 8px 间距 / 尺寸规则复制到 TS；返回原始坐标、不做边界 clamp，
   * 保证动画终点与回落到绝对定位后的实际位置完全一致。
   *
   * 还原后必须再强制一次样式重算：测量时浏览器已把「绝对定位 + left/top: auto」
   * 记为过渡起点，而 `auto` 不能插值，会让随后的复位直接跳变；重算后起点回到
   * 「固定定位 + 当前拖动坐标」，left/top 才能从数值过渡到数值。
   */
  const measureAnchorPosition = useCallback((): DragPosition | null => {
    const node = popupRef.current
    if (node === null) return null
    const saved = {
      position: node.style.position,
      left: node.style.left,
      top: node.style.top,
      right: node.style.right,
      bottom: node.style.bottom
    }
    node.style.position = ''
    node.style.left = ''
    node.style.top = ''
    node.style.right = ''
    node.style.bottom = ''
    const rect = node.getBoundingClientRect()
    node.style.position = saved.position
    node.style.left = saved.left
    node.style.top = saved.top
    node.style.right = saved.right
    node.style.bottom = saved.bottom
    // 强制同步重算，把还原后的固定定位（当前拖动坐标）确立为过渡起点。
    node.getBoundingClientRect()
    return { left: rect.left, top: rect.top }
  }, [])

  // 卸载清理挂起的显示 / 隐藏 / 自动收起计时（避免对已卸载组件 setState）。
  useEffect(
    () => () => {
      clearTimers()
      clearResetCloseTimer()
    },
    [clearTimers, clearResetCloseTimer]
  )

  // 打开期间：Esc / 点外部关闭；锁定态两者都不生效（唯一退出路径是先解锁）。
  useEffect(() => {
    if (detail === null) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !locked) closeDetail()
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (locked) return
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        closeDetail()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [detail, locked, closeDetail])

  // 锁定态窗口缩放：把固定坐标 clamp 回可视区（位置为空时 no-op）。
  useEffect(() => {
    if (!locked) return undefined
    const onResize = (): void => {
      setPosition((prev) => (prev === null ? null : clampPosition(prev.left, prev.top)))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [locked, clampPosition])

  const handleMouseEnter = (): void => {
    // 重新移入：取消复位后的自动收起（用户回来继续看），此后的移出按主动离开处理。
    clearResetCloseTimer()
    clearTimers()
    if (detail !== null) return
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null
      setDetail(getLiveSnapshot())
    }, POPOVER_SHOW_DELAY)
  }

  const handleMouseLeave = (): void => {
    clearTimers()
    if (detail === null || sticky || locked) return
    // 复位期间 / 等待自动收起的窗口内，指针是被移动的弹窗「甩出」而非主动离开：
    // 不提前关闭，交给自动收起计时。
    if (resettingRef.current || resetCloseTimerRef.current !== null) return
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      closeDetail()
    }, POPOVER_HIDE_DELAY)
  }

  const handleTriggerClick = (): void => {
    // 锁定态没有「点胶囊关闭」路径：必须经锁图标解锁后再走正常关闭。
    if (locked) return
    clearTimers()
    // 主动点击胶囊转为粘住 / 关闭：取消复位后的自动收起。
    clearResetCloseTimer()
    if (detail === null) {
      setDetail(getLiveSnapshot())
      setSticky(true)
      return
    }
    // 悬停已经展开时，点击转为粘住；已粘住的再次点击才关闭（与锁定的「常驻」区分）。
    if (!sticky) {
      setSticky(true)
      return
    }
    closeDetail()
  }

  const handleToggleLock = (): void => {
    clearTimers()
    // 再次上锁 / 重新解锁都以本次操作为准，先撤掉上一次的自动收起计时。
    clearResetCloseTimer()
    if (locked) {
      // 解锁：立即恢复 hover 模式；位置先平滑回到锚点，transitionend 后再回落绝对定位。
      // 起点取真实渲染坐标（拖动 / clamp 后的实际位置），终点取绝对定位的自然坐标。
      const node = popupRef.current
      const current = node === null ? null : node.getBoundingClientRect()
      const target = measureAnchorPosition()
      setLocked(false)
      setSticky(false)
      setDragging(false)
      draggingRef.current = false
      if (
        current === null ||
        target === null ||
        (Math.abs(target.left - current.left) < 0.5 && Math.abs(target.top - current.top) < 0.5)
      ) {
        // 零位移（锁定后没动过 / 又拖回原位）或测量失败：没有可过渡的距离，直接复位。
        // 判定依据是真实坐标差而非「本次是否拖动过」——固定定位下只要有位移就会走动画。
        resettingRef.current = false
        setResetting(false)
        setPosition(null)
        // 零位移没有过渡事件：解锁即视为复位完成，直接开始自动收起计时。
        scheduleResetClose()
        return
      }
      resettingRef.current = true
      setResetting(true)
      setPosition(target)
      return
    }
    const node = popupRef.current
    if (node === null) return
    // 复位动画期间再次上锁：就地停在当前视觉位置（取消动画，不跳回拖拽点）；
    // 常态上锁则从当前锚点位置无缝切到 fixed，同一次事件内写入位置与锁定态。
    const rect = node.getBoundingClientRect()
    resettingRef.current = false
    setResetting(false)
    setPosition({ left: rect.left, top: rect.top })
    setLocked(true)
  }

  /**
   * 复位过渡结束：位置已到锚点，撤掉 fixed 与过渡类，交还给绝对定位（同一位置，无视觉变化）。
   *
   * left / top 各派发一次 transitionend：只认第一次（两轴同时长、同时收尾），
   * 立刻把 ref 置 false，第二次与子元素（锁按钮）的过渡事件都被上面的守卫忽略。
   * 两轴坐标相同（零位移）时不会派发事件，那种情况已在解锁分支直接复位。
   */
  const handleResetTransitionEnd = (event: ReactTransitionEvent<HTMLDivElement>): void => {
    if (!resettingRef.current) return
    if (event.target !== event.currentTarget) return
    if (event.propertyName !== 'left' && event.propertyName !== 'top') return
    // 归位完成：开始自动收起计时（期间重新移入会取消）。
    resettingRef.current = false
    setResetting(false)
    setPosition(null)
    scheduleResetClose()
  }

  const handleDragPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!locked || event.button !== 0) return
    // 标题区内的按钮（锁图标）不参与拖动。
    if (event.target instanceof Element && event.target.closest('button')) return
    const node = popupRef.current
    if (node === null) return
    const rect = node.getBoundingClientRect()
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    draggingRef.current = true
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handleDragPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    setPosition(
      clampPosition(
        event.clientX - dragOffsetRef.current.x,
        event.clientY - dragOffsetRef.current.y
      )
    )
  }

  const handleDragPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const value = Math.max(0, chars)
  const showSpeed = value >= SPEED_MIN_CHARS && speed > 0

  return (
    <div
      ref={rootRef}
      className="st-pill-wrap"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={`st-pill-btn st-item st-session-trigger${detail !== null ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={detail !== null}
        aria-controls={detail !== null ? popupId : undefined}
        aria-label={t('writingSession.openAria')}
        aria-description={t('writingSession.title')}
        onClick={handleTriggerClick}
      >
        <Trans
          i18nKey={showSpeed ? 'writingSession.summary' : 'writingSession.charsOnly'}
          ns="status"
          values={{
            chars: value.toLocaleString('en-US'),
            speed: speed.toLocaleString('en-US')
          }}
          components={{ b: <b /> }}
        />
      </button>

      {detail !== null ? (
        <WritingSessionDetail
          id={popupId}
          stats={{ ...detail, chars: value }}
          locked={locked}
          onToggleLock={handleToggleLock}
          elementRef={setPopupRef}
          position={position}
          dragging={dragging}
          resetting={resetting}
          onDragPointerDown={handleDragPointerDown}
          onDragPointerMove={handleDragPointerMove}
          onDragPointerUp={handleDragPointerUp}
          onResetTransitionEnd={handleResetTransitionEnd}
        />
      ) : null}
    </div>
  )
}

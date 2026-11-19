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
 * 解锁复位的 hover 宽限（ms）。
 *
 * 复位动画把弹窗从拖动位置移回状态栏上方，指针相对弹窗的位置随之改变；
 * 鼠标若因此落到弹窗外，浏览器会派发 `mouseleave`，但这是「被移走的弹窗甩出」
 * 而非主动离开，不能当成关闭意图。复位期间与结束后这段时间内忽略该事件；
 * 重新移入会立即结束宽限，此后的移出按主动离开处理。
 *
 * 取值依据：复位过渡为 `--dur-slow`（240ms），宽限取 300ms 略大于「甩出」窗口，
 * 同时落在 200–400ms 的合理区间，不会明显拖慢日常移出关闭。
 */
const RESET_LEAVE_GRACE_MS = 300

/**
 * 状态栏「本次码字」胶囊：书架页与写作页共用（挂在外壳 `StatusBar` 内）。
 *
 * 数据来自 `shell/writingSession`（模块级 store）：首次出现正增量后才渲染，
 * 之后一直保留；净增字数为负时展示 0。不足 `SPEED_MIN_CHARS` 字只显示字数，
 * 避免「首字 → 天文时速」的误导。
 *
 * 胶囊同时是详情浮层的触发器（`.st-popup` 向上展开，避免状态栏贴底被裁切）：
 * - 悬停 260ms 打开 / 移出 120ms 关闭（`popoverTiming`）；
 * - 点击打开后为「粘住」态：移出仍显示，点外部 / Esc 关闭；
 * - 浮层内锁定后常驻：移出 / 点外部 / Esc 均不关闭，必须先点锁图标解锁；
 * - 锁定后浮层切到 `position: fixed`，标题区成为拖动把手；解锁复位回锚点并恢复 hover，
 *   复位期间与结束后 300ms 内忽略 hover 移出（指针会被归位的弹窗「甩出」）。
 * 打开时用 `getLiveSnapshot()` 现算总时长 / 空闲时长，不引入常驻定时器。
 */
export default function WritingSessionStats() {
  const { t } = useTranslation('status')
  const { visible, chars, speed } = useWritingSession()
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
  /** mouseleave 宽限截止时间（`performance.now()` 基准；0 = 无宽限）。 */
  const leaveGraceUntilRef = useRef(0)
  const popupId = useId()

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
    leaveGraceUntilRef.current = 0
  }, [])

  /** 浮层根节点：既供内容组件挂载，也供拖动 / 边界测量读取。 */
  const setPopupRef = useCallback((node: HTMLDivElement | null): void => {
    popupRef.current = node
  }, [])

  /** 把固定坐标限制在窗口可视区内（拖出边界 / 窗口缩小后回 clamp）。 */
  const clampPosition = useCallback((left: number, top: number): DragPosition => {
    const node = popupRef.current
    const width = node?.offsetWidth ?? 0
    const height = node?.offsetHeight ?? 0
    return {
      left: Math.min(Math.max(0, left), Math.max(0, window.innerWidth - width)),
      top: Math.min(Math.max(0, top), Math.max(0, window.innerHeight - height))
    }
  }, [])

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

  // 卸载清理挂起的显示 / 隐藏计时（避免对已卸载组件 setState）。
  useEffect(() => () => clearTimers(), [clearTimers])

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
    // 重新移入：解锁宽限立即失效，此后的移出按主动离开处理（日常 hover 手感不受影响）。
    leaveGraceUntilRef.current = 0
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
    // 复位期间 / 刚归位的宽限期内，指针是被移动的弹窗「甩出」而非主动离开：不关。
    if (resettingRef.current || performance.now() < leaveGraceUntilRef.current) return
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      closeDetail()
    }, POPOVER_HIDE_DELAY)
  }

  const handleTriggerClick = (): void => {
    // 锁定态没有「点胶囊关闭」路径：必须经锁图标解锁后再走正常关闭。
    if (locked) return
    clearTimers()
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
        return
      }
      resettingRef.current = true
      // 动画期间即进入宽限（覆盖整段 240ms 过渡）；transitionend 会再延长一段。
      leaveGraceUntilRef.current = performance.now() + RESET_LEAVE_GRACE_MS
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
    leaveGraceUntilRef.current = 0
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
    // 归位后再留一段宽限：此时指针已被弹窗甩出，立即按移出处理会让弹窗刚复位就消失。
    leaveGraceUntilRef.current = performance.now() + RESET_LEAVE_GRACE_MS
    resettingRef.current = false
    setResetting(false)
    setPosition(null)
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

  if (!visible) return null

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

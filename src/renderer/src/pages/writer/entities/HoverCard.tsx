import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
// 跨域复用档案域的胶囊纯函数（entities → dossier）：别名胶囊按模块 + 分类取色
// （函数级依赖，不引入 dossier 组件；上提到共享层时此处随之改路径即可）。
import { entityChipClass } from '../dossier/relationChip'
import { HoverPopupShell } from '../../../components/HoverPopupShell'
import { CARD_WIDTH } from '../../../components/popoverGeometry'
import { POPOVER_HIDE_DELAY, POPOVER_SHOW_DELAY } from '../../../components/popoverTiming'
import { EntityCardRelations } from './EntityCardRelations'
import { resolveBodyParagraphs } from './entityCardBody'
// 详情 LRU 缓存已迁出（`entityDetailCache.ts`）：容量淘汰 + 显式失效两条出口，无 TTL。
import { cacheGet, cacheSet } from './entityDetailCache'
import type { EntityDetail } from './entityDetailCache'

/* ---------- 计时器工具 ---------- */

/** 清空挂起的计时器（`null` 视为空闲）。 */
function clearTimer(ref: { current: number | null }): void {
  if (ref.current === null) return
  window.clearTimeout(ref.current)
  ref.current = null
}

export interface HoverAnchor {
  /** 锚点元素的视口矩形（悬停瞬间快照，滚动后失效）。 */
  rect: DOMRect
  entityId: number
  /** 显式锚点元素（可选）：关系 chip 等场景直接传入；缺省按 `span[data-entity-id]` 反查正文高亮。 */
  anchorEl?: HTMLElement | null
}

/** 解析锚点元素：同一实体多处高亮时取距悬停矩形最近者；显式 `anchorEl` 只认该元素。 */
function resolveAnchorElement(anchor: HoverAnchor): HTMLElement | null {
  if (anchor.anchorEl !== undefined) {
    return anchor.anchorEl?.isConnected ? anchor.anchorEl : null
  }
  const nodes = document.querySelectorAll<HTMLElement>(`span[data-entity-id="${anchor.entityId}"]`)
  let best: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const rect = node.getBoundingClientRect()
    const distance = Math.abs(rect.top - anchor.rect.top) + Math.abs(rect.left - anchor.rect.left)
    if (distance < bestDistance) {
      bestDistance = distance
      best = node
    }
  }
  return best
}

/* ---------- 悬停弹窗组件 ---------- */

interface HoverCardProps {
  anchor: HoverAnchor | null
  /** 鼠标离开高亮区（含弹窗）后的关闭回调。 */
  onClose: () => void
  /** 鼠标进入卡片时触发（可选）：上层借此取消自身的隐藏定时器（如关系胶囊的 120ms 隐藏）。 */
  onPointerEnter?: () => void
  /** 鼠标离开卡片时触发（可选）：上层借此重启自身的隐藏定时器，与内部延迟关闭并行。 */
  onPointerLeave?: () => void
  /** 关系胶囊是否可 hover 展开对端详情（默认 true）；嵌套层传 false。 */
  relationsExpandable?: boolean
  /** 嵌套层级：关系胶囊展开出的卡片传 true，层级提升到 `--z-popover-nested`。 */
  nested?: boolean
}

/** 实体悬停弹窗：fixed 定位 + 视口边界翻转；数据经 LRU 缓存，未命中走 `worldEntity:get`。 */
export function HoverCard({
  anchor,
  onClose,
  onPointerEnter,
  onPointerLeave,
  relationsExpandable = true,
  nested = false
}: HoverCardProps) {
  const { t } = useTranslation('entities')
  const { t: tCommon } = useTranslation('common')
  const [detail, setDetail] = useState<EntityDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  // Shell 根节点回调 ref：Shell 只回调节点，ref 写入留在本组件（内容宽 ResizeObserver 用）。
  const setCardRef = useCallback((node: HTMLDivElement | null): void => {
    cardRef.current = node
  }, [])
  // 锚点 span 活元素（挂载时按「与悬停快照最近」解析）：交给 HoverPopupShell 作连通性跟随，
  // 断开时 Shell 回退 `anchor.rect` 快照。属于「怎么拿到锚点」，故留在本组件内。
  const resolvedAnchorEl = useMemo(() => (anchor ? resolveAnchorElement(anchor) : null), [anchor])
  // 「弹窗 → 高亮」往返余量：鼠标离开弹窗后延迟关闭
  const closeTimerRef = useRef<number | null>(null)
  // 卡片内容宽实测值：关系行容量按此重测（滚动条出现 / 消失也会改变它）
  const [contentWidth, setContentWidth] = useState(CARD_WIDTH)
  // 关系胶囊展开出的对端详情锚点（带父实体 id：换实体后旧锚点自动失效）
  const [nestedHover, setNestedHover] = useState<{
    anchor: HoverAnchor
    parentId: number
  } | null>(null)
  // 「胶囊 → 嵌套卡」往返余量：显示延迟 / 隐藏延迟各一套
  const nestedShowTimerRef = useRef<number | null>(null)
  const nestedHideTimerRef = useRef<number | null>(null)

  // 详情随 anchor 加载：所有 setState 均在异步边界内（react-hooks/set-state-in-effect）
  useEffect(() => {
    if (!anchor) return undefined
    const { entityId } = anchor
    let cancelled = false
    const cached = cacheGet(entityId)
    Promise.resolve()
      .then(() => {
        if (cancelled) return
        if (cached !== undefined) {
          setDetail(cached)
          setLoading(false)
          return
        }
        setLoading(true)
        return window.api.worldEntity.get(entityId)
      })
      .then((result) => {
        if (cancelled || result === undefined) return
        cacheSet(entityId, result)
        setDetail(result)
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [anchor])

  // 卸载时清理挂起关闭 / 嵌套显示计时
  useEffect(() => {
    return () => {
      clearTimer(closeTimerRef)
      clearTimer(nestedShowTimerRef)
      clearTimer(nestedHideTimerRef)
    }
  }, [])

  /** 取消本卡的延迟关闭：本卡 / 嵌套卡 / 「+N」浮窗进入时共用（父卡先关会连带卸载嵌套卡）。 */
  const cancelRootClose = useCallback((): void => {
    clearTimer(closeTimerRef)
  }, [])

  /** 重启本卡的延迟关闭：离开卡片 / 嵌套卡 / 浮窗时共用同一计时器。 */
  const scheduleRootClose = useCallback((): void => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(onClose, POPOVER_HIDE_DELAY)
    onPointerLeave?.()
  }, [onClose, onPointerLeave])

  const clearNestedTimers = useCallback((): void => {
    clearTimer(nestedShowTimerRef)
    clearTimer(nestedHideTimerRef)
  }, [])

  /** 卡片根节点进入（本卡与嵌套卡共用）：取消本卡关闭与嵌套卡隐藏计时，并通知上层取消 chip 隐藏。 */
  const handleRootEnter = useCallback((): void => {
    cancelRootClose()
    clearNestedTimers()
    onPointerEnter?.()
  }, [cancelRootClose, clearNestedTimers, onPointerEnter])

  /** 关系胶囊 hover 进入：260ms 后展开对端详情；换对端时先撤旧卡，避免延迟窗口内显示上一条。 */
  const handleChipEnter = useCallback(
    (el: HTMLElement, peerId: number): void => {
      clearNestedTimers()
      // 自指关系（主进程正常不会产出）不展开，避免同一实体叠卡
      if (detail === null || peerId === detail.id) return
      const parentId = detail.id
      setNestedHover(null)
      nestedShowTimerRef.current = window.setTimeout(() => {
        nestedShowTimerRef.current = null
        if (!el.isConnected) return
        setNestedHover({
          anchor: { rect: el.getBoundingClientRect(), entityId: peerId, anchorEl: el },
          parentId
        })
      }, POPOVER_SHOW_DELAY)
    },
    [clearNestedTimers, detail]
  )

  /** 离开关系胶囊：延迟收起嵌套卡，给「胶囊 → 本卡 → 嵌套卡」的往返留余量。 */
  const handleChipLeave = useCallback((): void => {
    clearNestedTimers()
    nestedHideTimerRef.current = window.setTimeout(() => {
      nestedHideTimerRef.current = null
      setNestedHover(null)
    }, POPOVER_HIDE_DELAY)
  }, [clearNestedTimers])

  /** 关闭嵌套卡（其自身鼠标离开 120ms 后回调）。 */
  const closeNested = useCallback((): void => {
    clearNestedTimers()
    setNestedHover(null)
  }, [clearNestedTimers])

  // 卡片内容宽实测（含滚动条占宽变化）：关系行按此重测容量
  useEffect(() => {
    const card = cardRef.current
    if (!card || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width === undefined) return
      setContentWidth(Math.round(width))
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [anchor])

  /** 视觉重定位（实测口径）统一由 HoverPopupShell 负责：本组件只声明内容变化键（详情 / 加载态会改变卡片高度）。 */
  const contentKey = `${detail !== null ? detail.id : 'none'}|${loading ? 'loading' : 'idle'}`

  if (!anchor) return null

  // 正文逐段渲染：bodyJson 优先，未富文本化时回退单段 body（解析见 entityCardBody）。
  const bodyParagraphs = detail !== null ? resolveBodyParagraphs(detail) : []

  // 经 HoverPopupShell portal 挂到 body：脱离 `.ep-view` 的 transform / overflow 链后按视口坐标定位。
  const cardNode = (
    <HoverPopupShell
      anchorRect={anchor.rect}
      anchorEl={resolvedAnchorEl}
      elementRef={setCardRef}
      className={`entity-card${nested ? ' entity-card--nested' : ''}`}
      width={CARD_WIDTH}
      contentKey={contentKey}
      onPointerEnter={handleRootEnter}
      onPointerLeave={scheduleRootClose}
    >
      {detail ? (
        <>
          {/* 名字在前、模块胶囊贴右：名字是卡片主标题，DOM 顺序同步屏幕阅读器朗读顺序。 */}
          <div className="entity-card-head">
            <span className="entity-card-name">{detail.name}</span>
            {/* `chip-m-*` 让徽标跟随数据库模块色（--chip-bg / --chip-fg），与胶囊、正文高亮同口径。 */}
            <span
              className={`entity-card-type entity-card-${detail.entityType} chip-m-${detail.entityType}`}
            >
              {t(`type.${detail.entityType}`)}
            </span>
          </div>
          {detail.aliases.length > 0 && (
            <div className="entity-card-aliases">
              <span className="entity-card-label">{t('aliases')}</span>
              <span className="entity-card-chips">
                {detail.aliases.map((alias) => (
                  <span
                    key={alias}
                    className={`entity-card-chip chip-pill ${entityChipClass(detail.entityType, detail.presetKey)}`}
                  >
                    {alias}
                  </span>
                ))}
              </span>
            </div>
          )}
          {bodyParagraphs.length > 0 ? (
            <div className="entity-card-desc">
              {bodyParagraphs.map((paragraph, index) => (
                <p key={`p-${index}`} className="entity-card-para">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}
          {detail.relations.length > 0 && (
            <EntityCardRelations
              relations={detail.relations}
              layoutKey={contentWidth}
              expandable={relationsExpandable}
              onChipEnter={handleChipEnter}
              onChipLeave={handleChipLeave}
              onMoreItemEnter={handleChipEnter}
              onMoreItemLeave={handleChipLeave}
              onPopupEnter={cancelRootClose}
              onPopupLeave={scheduleRootClose}
            />
          )}
        </>
      ) : loading ? (
        <div className="entity-card-loading">{tCommon('loading')}</div>
      ) : (
        <div className="entity-card-loading">{t('notFound')}</div>
      )}
    </HoverPopupShell>
  )

  // 嵌套卡只在本卡详情仍属同一父实体时渲染（换实体后旧锚点自动失效）
  const nestedAnchor =
    nestedHover !== null && detail !== null && nestedHover.parentId === detail.id
      ? nestedHover.anchor
      : null

  return (
    <>
      {cardNode}
      {relationsExpandable && nestedAnchor !== null ? (
        <HoverCard
          anchor={nestedAnchor}
          onClose={closeNested}
          // 进入嵌套卡：取消父卡关闭；离开：重启父卡关闭（避免父卡先关而连带卸载嵌套卡）
          onPointerEnter={handleRootEnter}
          onPointerLeave={scheduleRootClose}
          // 展开只允许一层：嵌套层的关系行仅展示，「+N」不展开
          relationsExpandable={false}
          nested
        />
      ) : null}
    </>
  )
}

export default HoverCard

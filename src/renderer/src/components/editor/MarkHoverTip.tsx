import { useCallback, useLayoutEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { HoverPopupShell } from '../HoverPopupShell'
import { registerAboveAnchorPopover } from '../popoverStack'
import type { MarkHoverState } from './useMarkHover'
import '../../styles/components/tooltip.css'

export interface MarkHoverTipProps {
  /** 悬停状态（`useEditorMarkHover` / `useMarkHover` 的返回值）；null = 不渲染。 */
  tip: MarkHoverState | null
}

/**
 * 正文标记的悬停提示：三行结构化浮层，替代浏览器原生 `title` 气泡。
 *
 * 内容为通用的 `MarkHoverContent`（`heading` / `status` / `description`），伏笔与
 * 违禁词等标记共用；本组件只负责排版与定位，不关心内容来源。
 *
 * - 定位复用 `HoverPopupShell`（portal 到 body + fixed + 视口避让 + 滚动 / 缩放跟随），
 *   `placement="above"` + `align="left"`：底边贴标记顶边上方（间隔 10px）、左缘贴锚点左缘；
 *   上方不足时由 `above` 的兜底翻到标记下方；
 * - **与实体悬停卡上下堆叠**：本提示永远紧贴标记上方，实体卡再叠到本提示上方（层间间隔 8px，
 *   见 `STACKED_POPOVER_GAP`）。为此本组件把自己登记进 `popoverStack`（贴锚点上方的浮窗），
 *   实体卡据此按本提示实测高度向上让位 —— 两者同时出现时「实体卡 → 8px → 提示 → 10px → 标记行」，
 *   互不遮挡；
 * - **`pointer-events: none`**（`.wf-mark-tooltip`）：浮层不承接鼠标，否则会在
 *   「span → 浮层」之间来回触发 mouseover / mouseout 造成闪烁，并干扰正文选区；
 *   也因此第 3 行过长时**不能**内滚，改由 CSS `line-clamp` 截断（见 `tooltip.css`）；
 * - 三行：第 1 行 `伏笔：名字`（强调）、第 2 行状态 / 位置（次要色）、
 *   第 3 行描述（最弱色；空串不渲染）；
 * - 显隐与延迟全由 `useEditorMarkHover`（伏笔经 `useMarkHover` 薄封装）控制，本组件只在
 *   有状态时渲染，不做开合计时；
 * - 内容由调用方在数据层组好（伏笔取插件 state 条目的 `tip`，违禁词取命中词 + 类别），
 *   本组件不查任何数据源。
 */
export function MarkHoverTip({ tip }: MarkHoverTipProps): ReactElement | null {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  // Shell 根节点回调 ref：登记表要拿同一个 DOM 节点（不套包裹元素）。
  const setNodeRef = useCallback((node: HTMLDivElement | null): void => {
    nodeRef.current = node
  }, [])

  // 登记为「贴锚点上方的浮窗」：实体悬停卡据此让位。
  // 依赖 `tip`：换标记 / 换内容时重测；卸载（tip = null）时 node 已为 null，由上一次的
  // cleanup 注销（React 先跑旧 cleanup 再跑新 effect）。
  useLayoutEffect(() => {
    const node = nodeRef.current
    if (node === null) return undefined
    return registerAboveAnchorPopover(node)
  }, [tip])

  if (tip === null) return null
  const { heading, status, description } = tip.content

  return (
    <HoverPopupShell
      anchorRect={tip.rect}
      anchorEl={tip.anchorEl}
      placement="above"
      align="left"
      elementRef={setNodeRef}
      role="tooltip"
      className="wf-mark-tooltip"
      contentKey={`${heading}\u0000${status}\u0000${description}`}
    >
      <div className="wf-mark-tooltip__heading">{heading}</div>
      <div className="wf-mark-tooltip__status">{status}</div>
      {description === '' ? null : <div className="wf-mark-tooltip__desc">{description}</div>}
    </HoverPopupShell>
  )
}

export default MarkHoverTip

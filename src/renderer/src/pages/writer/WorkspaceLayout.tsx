import { useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import Splitter from './Splitter'

/* 分隔条 clamp 边界与默认宽（宽度仅在本次运行内保留，不落库） */
const SIDE_MIN = 180
const SIDE_MAX = 480
const SIDE_DEFAULT = 280
const RIGHT_MIN = 450
const RIGHT_MAX = 850
/* 右栏默认 550：右栏可见的最小视口 1241px（断点 ≤1240px 隐藏）下，中栏约 303px
   （活动栏固定时），仍高于 .editor-pane 的 280px 下限。默认 550 保证中栏 ≥300px 的
   理论阈值为 550 + 300 + 280 + 16 + 64 + 28 = 1238px（活动栏固定时；悬浮时 1174px），
   断点取 1240px，留 2px 余量。 */
const RIGHT_DEFAULT = 550

export interface WorkspaceLayoutProps {
  /**
   * 左栏元素（页面创建的 `<SidePane />`）。
   * 页面不重渲染时引用不变，本组件重渲染（拖拽逐帧）会因 element 引用相同而跳过其子树。
   */
  left: ReactNode
  /** 中栏元素（页面创建的 `<EditorPane />`），引用稳定性同上。 */
  center: ReactNode
  /** 右栏元素（页面创建的 `<RightPane />`），引用稳定性同上。 */
  right: ReactNode
  /** 左栏是否自动收起（无实体左栏的模块）：收起时左分隔条同步禁用。 */
  leftHidden?: boolean
  /** 右栏是否隐藏（标题栏偏好 / 窄窗）：隐藏时右分隔条同步禁用。 */
  rightHidden?: boolean
  /** 左栏元素引用（供左分隔条读取起始宽）。 */
  sideRef: RefObject<HTMLElement | null>
  /** 右栏元素引用（供右分隔条读取起始宽）。 */
  rightRef: RefObject<HTMLElement | null>
}

/**
 * 三栏布局外壳：持有左右两栏宽度 state，渲染 `.workspace` 容器 + 三栏位置 + 两个分隔条。
 *
 * 性能要点（缩小重渲染作用域）：宽度 state 从页面下沉到本组件，拖拽逐帧只重渲染本组件，
 * 页面（及其全部 hooks、右栏编辑器 / 大纲树等）不参与；`left` / `center` / `right` 由页面
 * 以 element 形式传入，本组件重渲染时引用不变，React 直接跳过三栏子树的 reconcile。
 *
 * 宽度下发：本组件把宽度写进 `.workspace` 的自定义属性（React `style` prop，state 为唯一
 * 真源），`.sidepane` / `.rightpane` 以 `var(--wf-side-width)` / `var(--wf-right-width)`
 * 消费——宽度变更无需重渲染三栏，且不绕过 React（无命令式 DOM 写入）。
 *
 * 栏内容不在本组件内创建：三栏的 props / 数据全部由页面持有，本组件只负责布局与宽度。
 */
export function WorkspaceLayout({
  left,
  center,
  right,
  leftHidden = false,
  rightHidden = false,
  sideRef,
  rightRef
}: WorkspaceLayoutProps) {
  const [sideWidth, setSideWidth] = useState(SIDE_DEFAULT)
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT)

  const style = {
    '--wf-side-width': `${sideWidth}px`,
    '--wf-right-width': `${rightWidth}px`
  } as CSSProperties

  return (
    <div className="workspace" style={style}>
      {left}

      <Splitter
        side="left"
        targetRef={sideRef}
        min={SIDE_MIN}
        max={SIDE_MAX}
        value={sideWidth}
        defaultValue={SIDE_DEFAULT}
        onChange={setSideWidth}
        hidden={leftHidden}
      />

      {center}

      <Splitter
        side="right"
        targetRef={rightRef}
        min={RIGHT_MIN}
        max={RIGHT_MAX}
        value={rightWidth}
        defaultValue={RIGHT_DEFAULT}
        onChange={setRightWidth}
        hidden={rightHidden}
      />

      {right}
    </div>
  )
}

export default WorkspaceLayout

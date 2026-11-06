import { useRef } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useRightPaneVisibility } from '../../shell/rightPaneVisibility'
import { useWorkspaceWidths } from '../../shell/useWorkspaceWidths'
import {
  RIGHT_DEFAULT,
  RIGHT_MAX,
  RIGHT_MIN,
  SIDE_DEFAULT,
  SIDE_MAX,
  SIDE_MIN
} from '../../shell/workspaceWidths'
import Splitter from './Splitter'

/* 分隔条 clamp 边界与默认宽集中在 `shell/workspaceWidths`（writer.css 的 px 兜底
   与之同名同值）：宽度经 `useWorkspaceWidths` 落库到 settings，重启后恢复。 */

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
 * 初始宽度：左栏 300px、右栏 600px（中栏 `flex: 1` 自适应）。用户拖拽后经
 * `useWorkspaceWidths` 防抖落库，下次启动恢复；双击分隔条复位到默认值。
 * 视口过窄时两栏按比例收缩（只影响渲染值，不覆盖已保存偏好）。
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
  const workspaceRef = useRef<HTMLDivElement>(null)
  // 窄窗断点（≤1240px）下 writer.css 强制隐藏右栏：视口预算按「实际不可见」计算。
  const { narrow } = useRightPaneVisibility()
  const { sideWidth, rightWidth, setSideWidth, setRightWidth } = useWorkspaceWidths({
    containerRef: workspaceRef,
    leftHidden,
    rightHidden: rightHidden || narrow
  })

  const style = {
    '--wf-side-width': `${sideWidth}px`,
    '--wf-right-width': `${rightWidth}px`
  } as CSSProperties

  return (
    <div className="workspace" ref={workspaceRef} style={style}>
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

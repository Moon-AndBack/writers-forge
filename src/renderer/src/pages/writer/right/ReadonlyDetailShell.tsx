/**
 * 右栏只读总览的**详情壳**（灵感 / 实体两个页签共用，AGENTS §9）。
 *
 * 结构：面板纵向 flex（滚动区 + 底部返回栏），值块统一落在
 * `.wf-readonly-detail__fields on-soft` 软底块内——与灵感编辑态的字段块同观感，
 * 区块样式见 `styles/writer-right-panels.css`（本节壳规则已上提）。
 *
 * 本组件只做布局：不渲染 Input / 保存条 / 删除 / 确认框，唯一操作是「返回」。
 *
 * 伏笔只读详情**不迁入**本壳：它复用 `.foreshadow-panel` 与伏笔编辑面板同款结构
 * （锚点块 `ForeshadowAnchorBlock` 等域内块），属不可调和的域差异，故按 AGENTS §9
 * 例外登记后保持独立实现。
 */
import type { MouseEventHandler, ReactElement, ReactNode } from 'react'
import { Button } from '../../../components/ui'

export interface ReadonlyDetailShellProps {
  /** 返回按钮文案（调用方取本域 i18n）。 */
  backLabel: string
  /** 返回列表。 */
  onBack: () => void
  /** 根容器鼠标移入（实体悬停事件委托；仅实体详情需要）。 */
  onMouseOver?: MouseEventHandler<HTMLDivElement>
  /** 根容器鼠标移出（同上）。 */
  onMouseLeave?: MouseEventHandler<HTMLDivElement>
  /** 字段区块（标题 / 类别 / 别名 / 正文等）。 */
  children: ReactNode
}

/** 只读详情壳：滚动字段区 + 底部返回栏。 */
export function ReadonlyDetailShell({
  backLabel,
  onBack,
  onMouseOver,
  onMouseLeave,
  children
}: ReadonlyDetailShellProps): ReactElement {
  return (
    <div className="wf-readonly-detail" onMouseOver={onMouseOver} onMouseLeave={onMouseLeave}>
      <div className="wf-readonly-detail__scroll">
        <div className="wf-readonly-detail__fields on-soft">{children}</div>
      </div>
      <div className="wf-readonly-detail__bar">
        <Button variant="secondary" className="wf-btn--on-soft" onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </div>
  )
}

export default ReadonlyDetailShell

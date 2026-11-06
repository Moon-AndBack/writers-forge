import type { ReactNode } from 'react'

/**
 * 拖拽把手配置：域内已绑定行数据（章 / 条目），外壳只做渲染与事件转接。
 * 图标由调用方传入——共享层不反向依赖 `pages/writer/`。
 */
export interface TreeRowGrip {
  title: string
  icon: ReactNode
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
}

/**
 * 树行公共外壳：根容器 → 圆点 → 域内前导内容 → 名字区 → 徽标 → 操作槽 → 可选把手。
 *
 * 只承载**结构**，不承载内容：名字渲染、前缀段、徽标、内联改名输入框均由域内以
 * ReactNode 传入。类名一律由 `classPrefix` 拼出，现有 CSS 零改动。
 *
 * 占位线不在此组装：外壳恒为单 `div`，章行的 `drop-line` 兄弟节点仍由其包装层
 * 用 Fragment 拼装（避免把 `.chapters-list` 的 `gap` 作用到占位线上）。
 */
export interface TreeRowItemProps {
  /** 行数据 id（选中 / 注册回调透传）。 */
  id: number
  /** 根类前缀：拼出现有 CSS 类名（`chapter` | `outline-chapter`）。 */
  classPrefix: 'chapter' | 'outline-chapter'
  /** 是否当前选中行。 */
  active: boolean
  /** 是否正在被拖拽（半透明视觉）。 */
  dragging?: boolean
  /** 域内状态类，按序拼在 `is-active` 之后、`is-dragging` 之前（章：is-draft / is-special）。 */
  stateClasses?: readonly string[]
  /** 追加在 `is-dragging` 之后的状态类（大纲：is-nested / has-grip）。 */
  afterDraggingClasses?: readonly string[]
  /** 行元素引用回调（拖拽命中判定用；缺省不注册）。 */
  registerRow?: (id: number, element: HTMLElement | null) => void
  /** 选中行。 */
  onSelect: (id: number) => void
  /** 圆点之后、名字之前的域内内容（章：前缀段 + `●`）；大纲不传。 */
  leading?: ReactNode
  /** 名字区（普通态 / 改名态由域内渲染）。 */
  nameNode: ReactNode
  /** 行尾徽标（章：草稿徽标）；大纲不传。 */
  badge?: ReactNode
  /** 操作按钮（域内组装），由外壳包进 `{prefix}-actions` 并阻断冒泡。 */
  actions: ReactNode
  /**
   * 拖拽把手：不传则不渲染（大纲置顶区无把手）。
   * `has-grip` 由域内按「是否存在把手」追加到 `afterDraggingClasses`，
   * 保持章节行根类不含该类（改动前即如此）。
   */
  grip?: TreeRowGrip
}

export default function TreeRowItem({
  id,
  classPrefix,
  active,
  dragging = false,
  stateClasses,
  afterDraggingClasses,
  registerRow,
  onSelect,
  leading,
  nameNode,
  badge,
  actions,
  grip
}: TreeRowItemProps) {
  const classes = [
    classPrefix,
    active ? 'is-active' : '',
    ...(stateClasses ?? []),
    dragging ? 'is-dragging' : '',
    ...(afterDraggingClasses ?? [])
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={registerRow ? (element) => registerRow(id, element) : undefined}
      className={classes}
      onClick={() => onSelect(id)}
    >
      <span className={`${classPrefix}-dot`} />
      {leading}
      {nameNode}
      {badge}
      <span className={`${classPrefix}-actions`} onClick={(event) => event.stopPropagation()}>
        {actions}
      </span>
      {grip && (
        <span
          className={`${classPrefix}-grip`}
          title={grip.title}
          onPointerDown={grip.onPointerDown}
          onPointerMove={grip.onPointerMove}
          onPointerUp={grip.onPointerUp}
          onPointerCancel={grip.onPointerCancel}
        >
          {grip.icon}
        </span>
      )}
    </div>
  )
}

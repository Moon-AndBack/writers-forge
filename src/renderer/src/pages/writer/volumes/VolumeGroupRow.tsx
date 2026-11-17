import type { ReactNode } from 'react'
import { IconButton } from '../../../components/ui'
import { TrashIcon } from '../../../components/icons'
import { ChevronIcon, PencilIcon, PlusIcon } from '../icons'

/** 卷行操作组中的单个动作（新建 / 改名 / 删除共用形状）。 */
export interface VolumeGroupRowAction {
  /** 无障碍标签与 tooltip 文案。 */
  label: string
  /** 点击回调；展开 / 建项等副作用由调用方在回调内完成。 */
  onClick: () => void
  /** 禁用（如卷内章数已达上限）。 */
  disabled?: boolean
}

export interface VolumeGroupRowActions {
  /** 新建子项（章 / 条目），渲染在操作组最左。 */
  add?: VolumeGroupRowAction
  /** 新建子项之后的自定义入口（如「新建特殊章」），点击行为完全由调用方持有。 */
  extra?: ReactNode
  /** 进入内联改名。 */
  rename?: VolumeGroupRowAction
  /** 删除（固定 danger 色）。 */
  delete?: VolumeGroupRowAction
}

export interface VolumeGroupRowProps {
  /** 外层容器类名（`vol` / `nonvol-group`）；`is-open` 由 `expanded` 自动追加。 */
  className: string
  /** 行头附加类名（如 `is-drop-target`、`nonvol-group-head`）。 */
  headClassName?: string
  /** 行容器上的 `data-volume-id`（章节侧跨卷拖拽定位用）。 */
  dataVolumeId?: number
  /** 编号前缀（如「卷X」）；空串不渲染前缀与分隔点。 */
  prefix: string
  /** 名段显示名（空值回退由调用方完成）；空串不渲染名段。 */
  name: string
  /** 名段类名，缺省 `vol-name`（分组用 `nonvol-group-name`）。 */
  nameClassName?: string
  /** 计数（章数 / 条目数）。 */
  count: number
  /** 是否展开（驱动 `is-open` 与 `aria-expanded`）。 */
  expanded: boolean
  /**
   * 行激活：鼠标点击与键盘 Enter / Space 共用。
   * 折叠切换（章节侧）或「切编辑 + 展开 / 收起 / 展开」三态（大纲侧）由调用方决定。
   */
  onActivate: () => void
  /**
   * 独立箭头按钮：提供时箭头包成按钮，点击只切换折叠（不冒泡到行）；
   * 省略则箭头为裸图标，点击冒泡到行头（章节侧口径）。
   */
  toggleButton?: { label: string; onToggle: () => void }
  /** 行内 hover 操作组；全部缺省时不渲染（系统「未分卷」卡）。 */
  actions?: VolumeGroupRowActions
  /** 是否处于内联改名态（改名时行点击 / 键盘不触发激活）。 */
  renaming: boolean
  /** 改名草稿值。 */
  draftName: string
  /** 改名草稿变更。 */
  onDraftNameChange: (value: string) => void
  /** 改名输入的无障碍标签。 */
  renameAriaLabel: string
  /** 提交改名（Enter / 失焦）。 */
  onCommitRename: () => void
  /** 取消改名（Escape）。 */
  onCancelRename: () => void
  /** 行头之后的子内容（章列表 / 条目列表 / 分组子项），容器结构由调用方保持。 */
  children?: ReactNode
}

/**
 * 卷行通用组件：章节卷区、大纲卷区、大纲分组区共用。
 *
 * 共享部分：行头（`role="button"` + `tabIndex` + `aria-expanded`）、鼠标点击后 blur
 * 规避（`detail > 0` 只对鼠标生效，键盘合成的 click 不 blur）、Enter / Space 激活、
 * 折叠箭头、前缀 + `●` + 名段、计数、hover 操作组、内联改名输入、子内容插槽。
 *
 * 差异全部由数据 / 回调 / children 表达：行激活语义走 `onActivate`，箭头形态走
 * `toggleButton`，操作组走 `actions`，名段类名走 `nameClassName`，外层类名与子内容
 * 容器由调用方保持（CSS 依赖原 DOM 结构）。
 */
export default function VolumeGroupRow({
  className,
  headClassName,
  dataVolumeId,
  prefix,
  name,
  nameClassName = 'vol-name',
  count,
  expanded,
  onActivate,
  toggleButton,
  actions,
  renaming,
  draftName,
  onDraftNameChange,
  renameAriaLabel,
  onCommitRename,
  onCancelRename,
  children
}: VolumeGroupRowProps) {
  const hasActions =
    actions !== undefined &&
    (actions.add !== undefined ||
      actions.extra !== undefined ||
      actions.rename !== undefined ||
      actions.delete !== undefined)

  return (
    <div className={`${className}${expanded ? ' is-open' : ''}`} data-volume-id={dataVolumeId}>
      <div
        className={`vol-head${headClassName ? ` ${headClassName}` : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={(event) => {
          // 鼠标点击后移除行焦点：本行（tabIndex=0）与行内操作按钮都在
          // .vol-head 内，点击后焦点残留会让 :focus-within 持续命中，
          // 鼠标移出后按钮组 / 计数隐藏、卷名让位均不恢复。
          // 用 detail>0 只对鼠标点击 blur——键盘 Enter/Space 合成的
          // click（detail===0）不 blur，保留键盘可达性。
          if (event.detail > 0) event.currentTarget.blur()
          if (renaming) return
          onActivate()
        }}
        onKeyDown={(event) => {
          if (renaming) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onActivate()
          }
        }}
      >
        {toggleButton ? (
          // 独立箭头按钮：仅折叠切换（点击不冒泡），行点击走 onActivate。
          <button
            type="button"
            className="nonvol-group-arrow"
            aria-label={toggleButton.label}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation()
              toggleButton.onToggle()
            }}
          >
            <ChevronIcon className="vol-arrow" />
          </button>
        ) : (
          <ChevronIcon className="vol-arrow" />
        )}
        {renaming ? (
          <input
            className="vol-rename"
            type="text"
            value={draftName}
            autoFocus
            spellCheck={false}
            aria-label={renameAriaLabel}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onDraftNameChange(event.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onCommitRename()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                onCancelRename()
              }
            }}
          />
        ) : (
          <>
            {/* 卷名段（前缀「卷X」+ ● + 名段）：纯展示，点击冒泡到 .vol-head；
                改名仅由行内 hover 铅笔按钮进入内联重命名。 */}
            {prefix !== '' && <span className="vol-prefix">{prefix}</span>}
            {/* 卷行分隔点：与章行「●」分隔符一致（纯装饰，斜体前缀段与正体名段之间）。 */}
            {prefix !== '' && (
              <span className="vol-sep" aria-hidden="true">
                ●
              </span>
            )}
            {name !== '' && <span className={nameClassName}>{name}</span>}
          </>
        )}
        <span className="vol-count">{count}</span>

        {hasActions && (
          <span className="vol-actions" onClick={(event) => event.stopPropagation()}>
            {actions.add && (
              <IconButton
                size="sm"
                className="row-act"
                label={actions.add.label}
                tooltipPlacement="top"
                disabled={actions.add.disabled}
                onClick={(event) => {
                  // 鼠标点击后 blur：本按钮无弹窗接焦，焦点残留会让
                  // .vol-head:focus-within 持续命中（移出后按钮组不隐藏）。
                  // detail>0 限定鼠标；键盘触发不 blur 保持可达性。
                  if (event.detail > 0) event.currentTarget.blur()
                  actions.add?.onClick()
                }}
              >
                <PlusIcon width={14} />
              </IconButton>
            )}
            {actions.extra}
            {actions.rename && (
              <IconButton
                size="sm"
                className="row-act"
                label={actions.rename.label}
                tooltipPlacement="top"
                onClick={() => actions.rename?.onClick()}
              >
                <PencilIcon />
              </IconButton>
            )}
            {actions.delete && (
              <IconButton
                size="sm"
                className="row-act"
                tone="danger"
                label={actions.delete.label}
                tooltipPlacement="top"
                onClick={() => actions.delete?.onClick()}
              >
                <TrashIcon />
              </IconButton>
            )}
          </span>
        )}
      </div>

      {children}
    </div>
  )
}

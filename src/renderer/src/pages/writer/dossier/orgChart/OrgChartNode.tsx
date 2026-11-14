import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { OrgChartNode as OrgChartNodeModel } from '../orgChart'

/** 递归人数：直接成员 + 全部后代的直接成员。 */
function countMembers(node: OrgChartNodeModel): number {
  return (
    node.members.length + node.children.reduce((total, child) => total + countMembers(child), 0)
  )
}

/** 势力 / 组织图标（卡片左侧，颜色跟随层级色条）。 */
function OrgIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 21h18" />
      <path d="M6 21V8l6-4 6 4v13" />
      <path d="M10 21v-5h4v5" />
    </svg>
  )
}

/** 折叠箭头（展开时朝下，收起时朝右）。 */
function ToggleIcon(): ReactElement {
  return (
    <svg
      className="org-chart__toggle-icon"
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export interface OrgChartNodeProps {
  node: OrgChartNodeModel
  /** 层级深度（0 起；仅用于色条明度，超过 3 按 3 处理）。 */
  depth: number
  collapsed: ReadonlySet<number>
  onToggle: (id: number) => void
}

/**
 * 组织架构递归节点：势力卡片 + 成员胶囊 + 子节点级联。
 *
 * 卡片左侧色条按层级取 `--brand` 的不同混色比例；成员胶囊复用全局
 * `chip-pill`（角色模块色），`reversed` 的关系方向以 `↺` + title 提示。
 * 折叠按钮只隐藏子树，人数始终按递归口径显示。
 */
export default function OrgChartNode({
  node,
  depth,
  collapsed,
  onToggle
}: OrgChartNodeProps): ReactElement {
  const { t } = useTranslation('dossier')
  const name = node.name.trim() === '' ? t('unnamed') : node.name
  const memberCount = countMembers(node)
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const meta = [node.subType.trim(), t('orgChart.memberCount', { count: memberCount })]
    .filter((part) => part !== '')
    .join(' · ')

  return (
    <div className="org-chart__node" data-depth={Math.min(depth, 3)}>
      <div className="org-chart__card" data-org-node-id={node.id}>
        <span className="org-chart__icon" aria-hidden="true">
          <OrgIcon />
        </span>
        <div className="org-chart__main">
          <div className="org-chart__name">{name}</div>
          <div className="org-chart__meta">{meta}</div>
        </div>
        {node.members.length > 0 ? (
          <div className="org-chart__members">
            {node.members.map((member) => (
              <span
                key={member.id}
                className="chip-pill chip-m-character org-chart__member"
                title={member.reversed === true ? t('orgChart.reversed') : undefined}
              >
                {member.name.trim() === '' ? t('unnamed') : member.name}
                {member.reversed === true ? (
                  <span className="org-chart__member-mark" aria-hidden="true">
                    ↺
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        {hasChildren ? (
          <div className="org-chart__footer">
            <button
              type="button"
              className="org-chart__toggle"
              aria-expanded={!isCollapsed}
              aria-label={
                isCollapsed
                  ? t('orgChart.expand', { count: node.children.length })
                  : t('orgChart.collapse', { count: node.children.length })
              }
              title={
                isCollapsed
                  ? t('orgChart.expand', { count: node.children.length })
                  : t('orgChart.collapse', { count: node.children.length })
              }
              onClick={() => onToggle(node.id)}
            >
              <ToggleIcon />
              <span>{t('orgChart.childrenCount', { count: node.children.length })}</span>
            </button>
          </div>
        ) : null}
      </div>
      {hasChildren && !isCollapsed ? (
        <div className="org-chart__children">
          {node.children.map((child) => (
            <OrgChartNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { EntityStyleCard, IconButton, Tag } from '../../../../components/ui'
import type { OrgChartNode as OrgChartNodeModel } from '../orgChart'
import { entityChipClass } from '../relationChip'

/** 递归人数：直接成员 + 全部后代的直接成员。 */
function countMembers(node: OrgChartNodeModel): number {
  return (
    node.members.length + node.children.reduce((total, child) => total + countMembers(child), 0)
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
  collapsed: ReadonlySet<number>
  onToggle: (id: number) => void
}

/**
 * 组织架构递归节点：程序卡（通用 `EntityStyleCard`）+ 成员胶囊 + 子节点级联。
 *
 * 卡片与设定档案卡同口径：14×16 内衬、单行省略标题、子类胶囊 + 人数、底部成员
 * 胶囊行；折叠收进标题行右侧 22×22 图标按钮。卡片根保留 `data-org-node-id`，
 * 供 `useOrgChartLines` 按 DOM 实测位置生成连线。
 */
export default function OrgChartNode({
  node,
  collapsed,
  onToggle
}: OrgChartNodeProps): ReactElement {
  const { t } = useTranslation('dossier')
  const name = node.name.trim() === '' ? t('unnamed') : node.name
  const memberCount = countMembers(node)
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const toggleLabel = isCollapsed
    ? t('orgChart.expand', { count: node.children.length })
    : t('orgChart.collapse', { count: node.children.length })

  return (
    <div className="org-chart__node">
      <EntityStyleCard
        className="org-chart__card"
        readonly
        cardProps={{ 'data-org-node-id': node.id }}
        head={<h3 className="wf-entity-card__title">{name}</h3>}
        actions={
          hasChildren ? (
            <IconButton
              className="org-chart__toggle"
              size="sm"
              label={toggleLabel}
              aria-expanded={!isCollapsed}
              onClick={() => onToggle(node.id)}
            >
              <ToggleIcon />
            </IconButton>
          ) : undefined
        }
        meta={
          <>
            {node.subType.trim() !== '' ? (
              <Tag
                tone="neutral"
                className={`chip-pill ${entityChipClass(node.entityType, node.presetKey)}`}
              >
                {node.subType}
              </Tag>
            ) : null}
            <span className="org-chart__count">
              {t('orgChart.memberCount', { count: memberCount })}
            </span>
          </>
        }
        chips={
          node.members.length > 0
            ? node.members.map((member) => (
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
              ))
            : undefined
        }
      />
      {hasChildren && !isCollapsed ? (
        <div className="org-chart__children">
          {node.children.map((child) => (
            <OrgChartNode key={child.id} node={child} collapsed={collapsed} onToggle={onToggle} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

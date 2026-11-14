import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../../components/EmptyState'
import { LoadErrorState } from '../../../../components/LoadErrorState'
import { buildOrgChart } from '../orgChart'
import type { OrgChartConflict, OrgChartNode, OrgChartResult } from '../orgChart'
import OrgChart from './OrgChart'

/** 组织架构只关心这四类关系：层级两码 + 平级 + 归属（成员）。 */
const ORG_REF_CODES = ['superior', 'subordinate', 'peer', 'belongs_to']

export interface OrgChartViewProps {
  /** 当前书籍 id。 */
  bookId: string
}

/**
 * 势力组织架构视图：拉取势力 / 世界观实体与全书关系，交给 `buildOrgChart` 推导，
 * 冲突（环 / 方向 / 多父）以可折叠提示条呈现，孤儿势力单列在主树下方。
 *
 * 数据源：
 * - `worldEntity:list(bookId, 'faction' | 'worldview' | 'character')`：组织节点 + 成员名
 *   （`belongs_to` 两端都需要实体行才能认定成员，角色行只用于取名称）；
 * - `worldEntity:listRefsByBook(bookId, 四码)`：refs-only，不 JOIN 正文，避免 IPC 过大。
 *
 * 视图每次切入时挂载并重新拉取（关系可能在卡片视图里刚改过）；失败时给出重试。
 */
export default function OrgChartView({ bookId }: OrgChartViewProps): ReactElement {
  const { t } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')
  const [result, setResult] = useState<OrgChartResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(false)
      setResult(null)
      try {
        const [factions, worldviews, characters, refs] = await Promise.all([
          window.api.worldEntity.list(bookId, 'faction'),
          window.api.worldEntity.list(bookId, 'worldview'),
          window.api.worldEntity.list(bookId, 'character'),
          window.api.worldEntity.listRefsByBook(bookId, ORG_REF_CODES)
        ])
        if (cancelled) return
        const entities = [...factions, ...worldviews, ...characters].map((row) => ({
          id: row.id,
          entityType: row.entityType,
          name: row.name,
          subType: row.subType
        }))
        setResult(buildOrgChart(entities, refs))
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bookId, attempt])

  // 冲突行里的实体名：树上的组织节点已覆盖全部实体 id（含被舍弃的副父）。
  const nameById = useMemo(() => {
    const names = new Map<number, string>()
    if (!result) return names
    const walk = (nodes: readonly OrgChartNode[]): void => {
      for (const node of nodes) {
        names.set(node.id, node.name)
        walk(node.children)
      }
    }
    walk(result.roots)
    walk(result.orphans)
    return names
  }, [result])

  const retry = (): void => setAttempt((value) => value + 1)
  const isEmpty = result !== null && result.roots.length === 0 && result.orphans.length === 0

  const conflictLine = (conflict: OrgChartConflict): string => {
    const names = conflict.entityIds.map((id) => {
      const name = nameById.get(id)
      return name === undefined || name.trim() === '' ? `#${id}` : name
    })
    if (conflict.kind === 'multi-parent') {
      return t('orgChart.conflicts.multiParentLine', {
        child: names[0] ?? '',
        parents: names.slice(1).join(' / ')
      })
    }
    const kind =
      conflict.kind === 'direction'
        ? t('orgChart.conflicts.direction')
        : t('orgChart.conflicts.cycle')
    return t('orgChart.conflicts.line', {
      kind,
      names: names.join(conflict.kind === 'cycle' ? ' → ' : ' / ')
    })
  }

  return (
    <div className="org-chart-view">
      {result !== null && result.conflicts.length > 0 ? (
        <details className="org-chart-conflicts">
          <summary>{t('orgChart.conflicts.title', { count: result.conflicts.length })}</summary>
          <p className="org-chart-conflicts__hint">{t('orgChart.conflicts.hint')}</p>
          <ul className="org-chart-conflicts__list">
            {result.conflicts.map((conflict, index) => (
              <li
                key={`${conflict.kind}-${conflict.refIds.join('-')}-${index}`}
                className="org-chart-conflicts__item"
              >
                <span>{conflictLine(conflict)}</span>
                {conflict.refIds.length > 0 ? (
                  <span className="org-chart-conflicts__refs">
                    {t('orgChart.conflicts.refs', { ids: conflict.refIds.join(', ') })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="org-chart-view__stage">
        {loading ? (
          <div className="dossier-detail__empty">{tCommon('loading')}</div>
        ) : error ? (
          <LoadErrorState onRetry={retry} />
        ) : result === null || isEmpty ? (
          <EmptyState title={t('orgChart.emptyTitle')} description={t('orgChart.emptyDesc')} />
        ) : (
          <OrgChart roots={result.roots} orphans={result.orphans} />
        )}
      </div>
    </div>
  )
}

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { OrgChartNode as OrgChartNodeModel } from '../orgChart'
import OrgChartNode from './OrgChartNode'
import { useOrgChartLines } from './useOrgChartLines'
import { useOrgChartTransform } from './useOrgChartTransform'

function ZoomOutIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  )
}

function ZoomInIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function FitIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export interface OrgChartProps {
  roots: readonly OrgChartNodeModel[]
  orphans: readonly OrgChartNodeModel[]
}

/**
 * 势力组织架构画布：可拖拽平移、滚轮 / 按钮缩放、适应画布。
 *
 * 画布用单个 `transform`（translate + scale）承载全部节点；SVG 层铺在卡片下方，
 * 折线由 `useOrgChartLines` 按 DOM 实测位置生成。折叠状态保存在本容器，
 * 切换后子节点卸载、连线随之重测。
 */
export default function OrgChart({ roots, orphans }: OrgChartProps): ReactElement {
  const { t } = useTranslation('dossier')
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set<number>())
  const fittedRef = useRef(false)

  const toggle = useCallback((id: number): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const { canvasStyle, panning, handlers, zoomIn, zoomOut, fit, percent } = useOrgChartTransform(
    viewportRef,
    canvasRef
  )
  const lines = useOrgChartLines(canvasRef, roots, orphans, collapsed)

  // 首次挂载后按内容居中缩放；之后由缩放控件 / 滚轮接管，不因折叠抖动视野。
  useLayoutEffect(() => {
    if (fittedRef.current) return
    const frame = requestAnimationFrame(() => {
      fit()
      fittedRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [fit])

  return (
    <div
      ref={viewportRef}
      className={`org-chart${panning ? ' is-panning' : ''}`}
      role="group"
      aria-label={t('orgChart.canvasLabel')}
      {...handlers}
    >
      <div ref={canvasRef} className="org-chart__canvas" style={canvasStyle}>
        <svg className="org-chart__lines" aria-hidden="true" focusable="false">
          {lines.map((line) => (
            <path key={line.key} d={line.d} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="org-chart__forest">
          {roots.map((node) => (
            <OrgChartNode
              key={node.id}
              node={node}
              depth={0}
              collapsed={collapsed}
              onToggle={toggle}
            />
          ))}
        </div>
        {orphans.length > 0 ? (
          <section className="org-chart__orphans" aria-label={t('orgChart.orphans')}>
            <div className="org-chart__orphans-head">
              <span className="org-chart__orphans-title">{t('orgChart.orphans')}</span>
              <span className="org-chart__orphans-hint">{t('orgChart.orphanHint')}</span>
            </div>
            <div className="org-chart__orphans-list">
              {orphans.map((node) => (
                <OrgChartNode
                  key={node.id}
                  node={node}
                  depth={0}
                  collapsed={collapsed}
                  onToggle={toggle}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="org-chart__zoom" role="group" aria-label={t('orgChart.zoomLabel')}>
        <button
          type="button"
          className="org-chart__zoom-btn"
          aria-label={t('orgChart.zoomOut')}
          title={t('orgChart.zoomOut')}
          onClick={zoomOut}
        >
          <ZoomOutIcon />
        </button>
        <span className="org-chart__zoom-value" aria-live="polite">
          {t('orgChart.zoomPercent', { percent })}
        </span>
        <button
          type="button"
          className="org-chart__zoom-btn"
          aria-label={t('orgChart.zoomIn')}
          title={t('orgChart.zoomIn')}
          onClick={zoomIn}
        >
          <ZoomInIcon />
        </button>
        <button
          type="button"
          className="org-chart__zoom-btn"
          aria-label={t('orgChart.fit')}
          title={t('orgChart.fit')}
          onClick={fit}
        >
          <FitIcon />
        </button>
      </div>
    </div>
  )
}

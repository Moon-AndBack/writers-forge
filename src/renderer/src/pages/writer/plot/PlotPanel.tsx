import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/EmptyState'
import { IconButton, Select } from '../../../components/ui'
import { PencilIcon } from '../icons'
import { TrashIcon } from '../../../components/icons'
import type { TimelineEntry } from '../timeline/timelineOrigin'
import { useConfirm } from '../chapters/useConfirm'
import PlotLineDialog, { type PlotLineDialogInput } from './PlotLineDialog'
import {
  getPlotLineColorValue,
  normalizePlotLineColor,
  normalizePlotLineType,
  plotLineLabel,
  type PlotLineRow,
  type PlotSceneRow,
  type UpdatePlotLinePatch
} from './plotTree'

export interface PlotPanelProps {
  /** 未删除剧情线（后端顺序：`sortOrder, id`）。 */
  lines: PlotLineRow[]
  /** 全书未删除场景（用于统计各线节点数）。 */
  scenes: PlotSceneRow[]
  /** 当前选中剧情线 id（页面层持有，与中栏 / 右栏共享）。 */
  activeLineId: number | null
  /** 剧情线选中回调。 */
  onSelectLine: (id: number) => void
  /** 更新剧情线（`name` / `lineType` / `lineColor` 三字段补丁，经 `updateLine` 落库）。 */
  onUpdateLine: (id: number, patch: UpdatePlotLinePatch) => void
  /** 软删除剧情线（含其下场景）。 */
  onDeleteLine: (id: number) => void
  /** 时间线列表（顶部下拉切换用）。 */
  timelines: TimelineEntry[]
  /** 当前选中时间线 id。 */
  activeTimelineId: string | null
  /** 切换时间线回调。 */
  onSelectTimeline: (id: string) => void
}

/**
 * 剧情线列表面板（受控）：单级剧情线行。
 * - 行：配置色块 + 线名 + 节点数 + hover 操作（编辑 / 删除；
 *   编辑弹 `PlotLineDialog` 三字段弹窗，经 `updateLine` 落库）；
 * - 新建入口在标题栏（`PlotActivityActions` → `PlotLineDialog` 三字段弹窗落库）；
 * - **无特殊卷 / 特殊章、无编号、无 pin / 状态**；仅 CRUD，无拖拽。
 */
export default function PlotPanel({
  lines,
  scenes,
  activeLineId,
  onSelectLine,
  onUpdateLine,
  onDeleteLine,
  timelines,
  activeTimelineId,
  onSelectTimeline
}: PlotPanelProps) {
  const { t } = useTranslation('plot')
  const { t: tTimeline } = useTranslation('timeline')
  // 编辑态：正在编辑的剧情线行（null = 未开弹窗；弹窗三字段初始值取自该行）。
  const [editingLine, setEditingLine] = useState<PlotLineRow | null>(null)
  const confirm = useConfirm()

  // 各线节点数（仅统计，不做排序）。
  const countOf = useCallback(
    (lineId: number): number => scenes.filter((scene) => scene.lineId === lineId).length,
    [scenes]
  )

  // 打开编辑弹窗（标题 / 类型 / 颜色三字段，初始值取自该行）。
  const openEdit = useCallback((line: PlotLineRow): void => {
    setEditingLine(line)
  }, [])

  // 编辑弹窗提交：仅将变化字段组补丁经 `updateLine` 落库；
  // 空名视为未改名（后端 name 须非空），全无变化则不落库。
  const handleEditSubmit = useCallback(
    (input: PlotLineDialogInput): void => {
      const line = editingLine
      if (!line) return
      const patch: UpdatePlotLinePatch = {}
      const nextName = input.name.trim()
      if (nextName !== '' && nextName !== line.name) patch.name = nextName
      if (input.lineType !== line.lineType) patch.lineType = input.lineType
      if (input.lineColor !== line.lineColor) patch.lineColor = input.lineColor
      const changed =
        patch.name !== undefined || patch.lineType !== undefined || patch.lineColor !== undefined
      if (changed) onUpdateLine(line.id, patch)
    },
    [editingLine, onUpdateLine]
  )

  // 新建入口已迁标题栏（`PlotActivityActions` → `PlotLineDialog`），本面板不再承接入点。

  const requestDelete = useCallback(
    (line: PlotLineRow): void => {
      confirm.request(
        {
          title: t('dialog.deleteLine.title'),
          message: t('dialog.deleteLine.message', { name: plotLineLabel(line, t('unnamedLine')) }),
          confirmText: t('dialog.deleteLine.confirm')
        },
        () => onDeleteLine(line.id)
      )
    },
    [confirm, onDeleteLine, t]
  )

  return (
    <div className="pane-body">
      <div className="pane-scroll">
        <div className="plot-timeline-switcher">
          <Select
            value={activeTimelineId ?? ''}
            onChange={onSelectTimeline}
            options={timelines.map((entry) => ({
              value: entry.id,
              label: entry.name.trim() !== '' ? entry.name : tTimeline('defaultName')
            }))}
            placeholder={tTimeline('timelineSelect.placeholder')}
            ariaLabel={tTimeline('timelineSelect.label')}
            emptyText={tTimeline('emptyTitle')}
          />
        </div>
        {lines.length === 0 ? (
          /* 空态：无任何剧情线时居中提示；引导文案指路标题栏「新建剧情线」入口。 */
          <EmptyState
            compact
            icon={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                width={30}
              >
                <path d="M6 3v12" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            }
            title={t('emptyTitle')}
            description={t('emptyDesc')}
          />
        ) : (
          <div className="plot-line-list pane-region">
            {lines.map((line) => {
              const active = line.id === activeLineId
              // 行首色块：取该线配置色（非法 key 归一回退首色），选中态描边光晕同色。
              const lineColor = getPlotLineColorValue(normalizePlotLineColor(line.lineColor))
              return (
                <div
                  key={line.id}
                  className={`plot-line${active ? ' is-active' : ''}`}
                  onClick={() => onSelectLine(line.id)}
                >
                  <span
                    className="plot-line-dot"
                    style={
                      active
                        ? {
                            backgroundColor: lineColor,
                            opacity: 1,
                            boxShadow: `0 0 0 4px ${lineColor}24`
                          }
                        : { backgroundColor: lineColor, opacity: 1 }
                    }
                  />
                  {/* 线名段：纯展示，点击冒泡到行触发选中；
                      编辑由行内 hover 铅笔按钮弹三字段弹窗。 */}
                  <span className="plot-line-name">{plotLineLabel(line, t('unnamedLine'))}</span>
                  <span className="plot-line-count">{countOf(line.id)}</span>

                  {/* 行内 hover 操作：编辑 + 删除。 */}
                  <span className="plot-line-actions" onClick={(event) => event.stopPropagation()}>
                    <IconButton
                      size="sm"
                      className="row-act"
                      label={t('rename')}
                      tooltipPlacement="top"
                      onClick={() => openEdit(line)}
                    >
                      <PencilIcon />
                    </IconButton>
                    <IconButton
                      size="sm"
                      className="row-act"
                      tone="danger"
                      label={t('deleteLine')}
                      tooltipPlacement="top"
                      onClick={() => requestDelete(line)}
                    >
                      <TrashIcon />
                    </IconButton>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editingLine && (
        /* 编辑弹窗：三字段初始值取自该行（非法 key 归一），提交经 `updateLine` 落库。 */
        <PlotLineDialog
          initial={{
            name: editingLine.name,
            lineType: normalizePlotLineType(editingLine.lineType),
            lineColor: normalizePlotLineColor(editingLine.lineColor)
          }}
          title={t('editDialog.title')}
          onClose={() => setEditingLine(null)}
          onSubmit={handleEditSubmit}
        />
      )}

      {confirm.node}
    </div>
  )
}

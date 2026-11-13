import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Editor } from '@tiptap/core'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/EmptyState'
import { PlusIcon } from '../icons'
import { useConfirm } from '../chapters/useConfirm'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import PlotActivityActions from './PlotActivityActions'
import PlotLineDialog, { type PlotLineDialogInput } from './PlotLineDialog'
import { usePlotEditor } from './plotEditorContext'
import SceneNodeDialog, { type SceneNodeDialogInput } from './SceneNodeDialog'
import { SceneCard } from './SceneCard'
import {
  getPlotLineColorValue,
  normalizePlotLineColor,
  plotSceneTime,
  type CreatePlotLineOptions,
  type CreatePlotSceneInput,
  type PlotEraLabels,
  type PlotLineRow,
  type PlotSceneRow,
  type UpdatePlotScenePatch
} from './plotTree'
import { useSceneContentWidth } from './useSceneContentWidth'

export interface PlotTimelineProps {
  /** 当前选中剧情线；null = 未选中 / 无线（渲染空态）。 */
  line: PlotLineRow | null
  /** 当前选中剧情线下的场景（已按绝对年优先、未定年沉底排序，由 `scenesOfLine` 派生）。 */
  scenes: PlotSceneRow[]
  /** 当前选中场景 id（页面层持有，与右栏编辑器共享）。 */
  activeSceneId: number | null
  /** 场景选中回调。 */
  onSelectScene: (id: number) => void
  /** 新建场景节点（弹窗填时间 + 标题后调用；落库统一追加到线末尾并选中新节点）。 */
  onAddScene: (input?: CreatePlotSceneInput) => void
  /** 更新场景补丁（时间 / 标题改动即时落库）。 */
  onUpdateScene: (id: number, patch: UpdatePlotScenePatch) => void
  /** 软删除场景节点（卡内删除按钮经二次确认后调用）。 */
  onDeleteScene: (id: number) => void
  /** 书籍 id（实体匹配 / 胶囊按书隔离）。 */
  bookId?: string
  /** 当前所属时间线名称（新建剧情线弹窗只读展示）。 */
  activeTimelineName?: string
  /** 当前所属时间线 id（新建剧情线继承）。 */
  activeTimelineId?: string | null
  /** 当前所属时间线起点（新建剧情线继承）。 */
  timelineOrigin?: string
  /** 新建剧情线（三字段弹窗提交；缺省名 →「新剧情线」），成功后页面层自动选中新线。 */
  onCreateLine?: (name?: string, options?: CreatePlotLineOptions) => Promise<PlotLineRow | null>
}

/**
 * 剧情时间轴中栏：纵向时间线（时间列 + 节点圆点列 + 内容卡列）。
 *
 * - **逐场景一行**：每个场景独占一行（时间列显示该场景自身时间，经 `plotSceneTime`
 *   派生）；不再按年合并（只读时间线视图仍走 `groupScenesByYear`，本组件不用）；
 * - 每卡：标题 + 描述 + **正文自动匹配的实体胶囊**（实时、不落库），点击选中；标题旁「铅笔」
 *   开节点弹窗改标题、「垃圾桶」二次确认后删除该节点，时间列可点开同一弹窗改时间；
 * - **胶囊正文来源**：活动场景取正文编辑器**实时文本**（未保存草稿也即时反映），其余场景取
 *   持久化摘要 `scene.description`；匹配经 `entities.match` 防抖调用（见 `usePlotBodyEntities`）；
 * - 线底部「＋」缝（sticky 钉滚动区底部常显）开空节点弹窗（填时间 + 标题后创建）；
 * - 空态：无线走独立空态；无线下节点仍保留底部缝（场景唯一入口）。
 */
export default function PlotTimeline({
  line,
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onUpdateScene,
  onDeleteScene,
  bookId = '',
  activeTimelineName,
  activeTimelineId,
  timelineOrigin,
  onCreateLine
}: PlotTimelineProps) {
  const { t } = useTranslation('plot')
  // 卡内删除按钮的二次确认（集中一个弹窗实例，避免每卡各挂一个 Modal）。
  const confirm = useConfirm()
  // 胶囊悬停实体信息卡（事件委托在壳的胶囊容器，弹窗经 portal 挂 body）。
  const hover = useEntityHover()
  // 中栏根引用 + 内容列可用宽（仅作布局签名，变化时触发卡内胶囊重测）。
  const timelineRef = useRef<HTMLDivElement>(null)
  const layoutKey = useSceneContentWidth(timelineRef, line !== null)
  // 「新建剧情线」弹窗开关（标题栏「＋」按钮触发，弹窗经 Modal portal 挂 body）。
  const [createOpen, setCreateOpen] = useState(false)
  // 节点弹窗：`createNode` = 新建（空表单）；`nodeTarget` 非空 = 编辑该场景时间 / 标题。
  const [createNode, setCreateNode] = useState(false)
  const [nodeTarget, setNodeTarget] = useState<PlotSceneRow | null>(null)
  // 正文编辑器实例（经共享上下文）：用于取**未保存草稿**的实时正文，驱动活动场景胶囊即时刷新。
  const editor = usePlotEditor()?.editor ?? null
  // 实时正文快照（与所属编辑器实例一起存：切换场景 / 换编辑器后旧快照自动失效）。
  const [liveSnapshot, setLiveSnapshot] = useState<{ editor: Editor; text: string } | null>(null)
  // 订阅编辑器 `update`：同步实时正文纯文本（与 `PlotBodyEditor` 落库摘要同口径）。
  useEffect(() => {
    if (!editor) return undefined
    const sync = (): void => setLiveSnapshot({ editor, text: editor.state.doc.textContent })
    editor.on('update', sync)
    return () => {
      editor.off('update', sync)
    }
  }, [editor])
  // 活动场景正文：优先用实时快照；编辑器尚未发过 `update`（或无快照 / 快照属旧实例）时
  // 直接读当前文档文本，避免首帧空胶囊。
  const liveBodyText =
    editor === null
      ? ''
      : liveSnapshot?.editor === editor
        ? liveSnapshot.text
        : editor.state.doc.textContent
  // 当前选中线的配置色（非法 key 归一回退首色），经 `--line-color` 行内透传给纵线 / 圆点。
  const lineColor = line ? getPlotLineColorValue(normalizePlotLineColor(line.lineColor)) : null
  const timelineStyle = (lineColor ? { '--line-color': lineColor } : undefined) as
    CSSProperties | undefined
  // 结构化时间纪元标签（`plotSceneTime` 派生每卡时间文案用）。
  const eraLabels = useMemo<PlotEraLabels>(
    () => ({
      bc: t('timeEra.bc'),
      zero: t('timeEra.zero'),
      ad: t('timeEra.ad'),
      yearUnit: t('timeYearUnit')
    }),
    [t]
  )

  // 弹窗三字段提交：落库（页面层自动选中新线），关弹窗由 Dialog 内部处理。
  const handleCreateLine = (input: PlotLineDialogInput): void => {
    void onCreateLine?.(input.name, {
      lineType: input.lineType,
      lineColor: input.lineColor,
      timelineId: activeTimelineId ?? 'default',
      defaultOrigin: timelineOrigin ?? ''
    })
  }

  const closeNodeDialog = (): void => {
    setCreateNode(false)
    setNodeTarget(null)
  }

  // 节点弹窗提交：编辑 → 仅落变更字段；新建 → 直接创建（时间 + 标题）。
  const handleNodeSubmit = (input: SceneNodeDialogInput): void => {
    if (nodeTarget) {
      const patch = buildNodePatch(nodeTarget, input)
      if (Object.keys(patch).length > 0) onUpdateScene(nodeTarget.id, patch)
      return
    }
    onAddScene({
      timeEra: input.timeEra,
      timeYear: input.timeYear,
      timeDesc: input.timeDesc,
      title: input.title
    })
  }

  const nodeDialogOpen = createNode || nodeTarget !== null

  // 卡内删除按钮：二次确认后软删除该节点（文案复用 `dialog.deleteScene.*`）。
  const requestDeleteScene = useCallback(
    (id: number): void => {
      confirm.request(
        {
          title: t('dialog.deleteScene.title'),
          message: t('dialog.deleteScene.message'),
          confirmText: t('dialog.deleteScene.confirm')
        },
        () => onDeleteScene(id)
      )
    },
    [confirm, onDeleteScene, t]
  )

  return (
    <>
      {/* 标题栏按钮组（剧情模块专属）：新建剧情线入口。 */}
      <PlotActivityActions onAdd={() => setCreateOpen(true)} />
      {/* 「新建剧情线」弹窗：标题栏按钮触发，三字段（名称 / 类型 / 颜色）+ 落库。 */}
      {createOpen && (
        <PlotLineDialog
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreateLine}
          timelineName={activeTimelineName}
        />
      )}
      {/* 「节点」弹窗：新建（空表单）与编辑（回显该场景）共用。 */}
      {nodeDialogOpen && (
        <SceneNodeDialog
          key={nodeTarget ? `edit-${nodeTarget.id}` : 'create'}
          title={nodeTarget ? t('nodeDialog.editTitle') : t('nodeDialog.createTitle')}
          initial={
            nodeTarget
              ? {
                  timeEra: nodeTarget.timeEra,
                  timeYear: nodeTarget.timeYear,
                  timeDesc: nodeTarget.timeDesc,
                  title: nodeTarget.title
                }
              : undefined
          }
          onClose={closeNodeDialog}
          onSubmit={handleNodeSubmit}
        />
      )}
      {/* 卡内删除确认弹窗节点（集中挂载；由卡内「垃圾桶」按钮触发）。 */}
      {confirm.node}
      {/* 胶囊悬停实体信息卡（数据走 `entities.get`，经 LRU 缓存）。 */}
      <HoverCard
        anchor={hover.anchor}
        onClose={hover.close}
        onPointerEnter={hover.cancelHide}
        onPointerLeave={hover.onMouseLeave}
      />
      <div className="editor-scroll">
        <div className="editor-inner is-full">
          {line === null ? (
            <EmptyState
              title={t('timeline.emptyLineTitle')}
              description={t('timeline.emptyLineDesc')}
            />
          ) : (
            <div className="plot-timeline" ref={timelineRef} style={timelineStyle}>
              {scenes.length === 0 ? (
                <div className="plot-timeline-empty">{t('timeline.emptyNodes')}</div>
              ) : (
                scenes.map((scene) => (
                  <SceneRow
                    key={scene.id}
                    scene={scene}
                    active={scene.id === activeSceneId}
                    layoutKey={layoutKey}
                    eraLabels={eraLabels}
                    bookId={bookId}
                    bodyText={
                      scene.id === activeSceneId && editor ? liveBodyText : scene.description
                    }
                    onSelect={onSelectScene}
                    onEditNode={setNodeTarget}
                    charHover={hover}
                    onDeleteScene={requestDeleteScene}
                  />
                ))
              )}

              {/* 线底部唯一「＋」缝（sticky 钉滚动区底部常显）：开空节点弹窗新建。 */}
              <GapRow
                onAddScene={() => setCreateNode(true)}
                label={t('timeline.addNode')}
                isBottom
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * 构建节点弹窗**仅变更字段**补丁（时间三字段 + 标题逐字段比对，未变更不下发）。
 * 空对象 = 无改动（调用方据此跳过落库）。
 */
function buildNodePatch(scene: PlotSceneRow, input: SceneNodeDialogInput): UpdatePlotScenePatch {
  const patch: UpdatePlotScenePatch = {}
  if (input.timeEra !== scene.timeEra) patch.timeEra = input.timeEra
  if (input.timeYear !== scene.timeYear) patch.timeYear = input.timeYear
  if (input.timeDesc !== scene.timeDesc) patch.timeDesc = input.timeDesc
  if (input.title !== scene.title) patch.title = input.title
  return patch
}

interface SceneRowProps {
  scene: PlotSceneRow
  active: boolean
  /** 布局签名（可用宽 key），下传至场景卡触发胶囊重测。 */
  layoutKey: number
  /** 结构化时间纪元标签（`plotSceneTime` 派生时间文案用）。 */
  eraLabels: PlotEraLabels
  /** 归属书 id（实体匹配按书隔离）。 */
  bookId: string
  /** 实体匹配用正文纯文本（活动场景 = 编辑器实时文本，其余 = 持久化摘要）。 */
  bodyText: string
  onSelect: (id: number) => void
  /** 打开节点弹窗（改该场景时间 / 标题）。 */
  onEditNode: (scene: PlotSceneRow) => void
  /** 胶囊悬停委托（壳的胶囊容器级 `onMouseOver` / `onMouseLeave` + 信息卡锚点）。 */
  charHover: ReturnType<typeof useEntityHover>
  /** 删除该场景节点（经卡内删除按钮二次确认后调用）。 */
  onDeleteScene: (id: number) => void
}

/** 场景行：一场景一行（时间列该场景自身时间 + 单圆点 + 内容列单卡）；时间列可点开节点弹窗。 */
function SceneRow({
  scene,
  active,
  layoutKey,
  eraLabels,
  bookId,
  bodyText,
  onSelect,
  onEditNode,
  charHover,
  onDeleteScene
}: SceneRowProps) {
  const { t } = useTranslation('plot')
  const timeLabel = plotSceneTime(scene, t('undatedScene'), eraLabels)

  return (
    <div className={`plot-row${active ? ' is-active' : ''}`}>
      <div className="plot-col-time">
        <button
          type="button"
          className="plot-time-text plot-time-edit"
          title={t('timeline.editTime')}
          aria-label={t('timeline.editTime')}
          onClick={() => onEditNode(scene)}
        >
          {timeLabel}
        </button>
      </div>
      <div className="plot-col-node">
        <span className="plot-dot" />
      </div>
      <div className="plot-col-content">
        <SceneCard
          scene={scene}
          active={active}
          layoutKey={layoutKey}
          bookId={bookId}
          bodyText={bodyText}
          onSelect={onSelect}
          onEditNode={onEditNode}
          charHover={charHover}
          onDeleteScene={onDeleteScene}
        />
      </div>
    </div>
  )
}

interface GapRowProps {
  onAddScene: () => void
  label: string
  /** 禁用态（显式声明；有线默认启用，无线走空态不渲染本行，以“缺席”代替禁用）。 */
  disabled?: boolean
  /** 线底部唯一缝：加 `is-bottom`（sticky 钉滚动区底部常显，不透明底遮挡纵线）。 */
  isBottom?: boolean
}

/** 线底部「＋」缝（开空节点弹窗新建；仅有线渲染，无线空态不渲染）。 */
function GapRow({ onAddScene, label, disabled = false, isBottom = false }: GapRowProps) {
  return (
    <div className={`plot-gap-row${isBottom ? ' is-bottom' : ''}`}>
      <div className="plot-col-time" />
      <div className="plot-col-node">
        <button
          type="button"
          className="plot-add-node"
          title={label}
          aria-label={label}
          disabled={disabled}
          onClick={onAddScene}
        >
          <PlusIcon width={12} />
        </button>
      </div>
      <div className="plot-col-content" />
    </div>
  )
}

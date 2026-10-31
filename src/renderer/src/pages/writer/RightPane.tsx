import { useState } from 'react'
import type { ReactElement, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { WriterModule } from '../../shell/activityBar'
import type { VolumeRow } from './chapters/chapterTree'
import ConfirmDialog from './ConfirmDialog'
import DossierDetail from './dossier/DossierDetail'
import type { DossierBundle, DossierModule } from './dossier/dossierTree'
import type { OutlineItemRow } from './outline/outlineTree'
import PlotEditor from './plot/PlotEditor'
import type { PlotLineRow, PlotSceneRow, UpdatePlotScenePatch } from './plot/plotTree'
import { ModulePlaceholder } from './right/ModulePlaceholder'
import { AiPanel } from './right/AiPanel'
import { OutlineRightPanel } from './right/OutlineRightPanel'
import { PlotFilterPanel } from './right/PlotFilterPanel'
import { RightPaneTabs, type RightPaneTab } from './right/RightPaneTabs'
import { TimelineRightPanel } from './right/TimelineRightPanel'
import type { TimelineEntry } from './timeline/timelineOrigin'

/** 调用方未传保存入口时的占位 ref（仅保证必填契约，编辑器写入无副作用）。 */
const EMPTY_SAVE_REF: RefObject<(() => void) | null> = { current: null }

/** 静态映射可承载的模块：排除章节（大纲 / 剧情 / AI 三页签）、大纲（剧情筛选面板）、剧情
 *  （节点正文编辑器）、时间线（props 单独渲染）与设定档案五域（右栏详情单独渲染）。 */
type StaticPanelModule = Exclude<
  WriterModule,
  'chapters' | 'outline' | 'plot' | 'timeline' | DossierModule
>

const PANELS: Record<StaticPanelModule, () => ReactElement> = {
  foreshadow: () => <ModulePlaceholder id="foreshadow" />,
  inspiration: () => <ModulePlaceholder id="inspiration" />
}

/**
 * 写作页右栏：按模块渲染对应 `.rp-view`（面板头 `.pane-head` + 内容 `.rp-body`；
 * 设定档案五域视图不设面板头，改由中栏承载模块标题）。
 *
 * - **章节模块**：右栏为「大纲 / 剧情 / AI」三页签（页签条 + 大纲面板 + 剧情面板 + AI 面板）。
 *   剧情页签走 `PlotFilterPanel`（时间线 + 剧情线双下拉筛选 + 只读时间轴卡片 + 悬停正文浮窗），
 *   与大纲模块右栏同款面板，只是多一层页签条。三个面板**始终挂载**，只用 `hidden` 切换显隐，
 *   列表滚动位置不因页签切换丢失；页签状态只在章节模块内记忆（`chapterTab`，默认「大纲」）。
 *   AI 页签挂载 `AiPanel`（模型 / 功能下拉 + 快捷结果 / 对话两种模式，结果可回插正文），
 *   惰性加载：`active` 仅在页签可见时为真，不可见时不发起任何模型 / 会话请求。
 * - **大纲模块**：右栏直接挂载同一 `PlotFilterPanel`（无页签条）：时间线 + 剧情线双下拉筛选 +
 *   只读时间轴卡片 + 实体胶囊 + 悬停正文浮窗，点击只选中，不提供正文编辑器。
 * - **剧情模块**：右栏为节点正文富文本编辑器（`PlotEditor`：正文 + 底部保存条；
 *   未保存切换由 `ConfirmDialog` 两态确认）。
 * - 面板常驻，`is-active` 控制显示；宽度由页面 state 控制内联 `style.width`；
 *   显隐由标题栏「隐藏/显示右栏」按钮的偏好驱动（`hidden` → `.is-hidden`）。
 */
export function RightPane({
  module,
  width,
  paneRef,
  hidden = false,
  bookId,
  chapterId = null,
  outlineVolumes,
  outlineItems,
  activeVolumeId = null,
  plotAllLines,
  plotScenes,
  activePlotLineId = null,
  timelines,
  plotLine = null,
  plotScene = null,
  onUpdatePlotScene,
  plotDirty = false,
  onPlotDirtyChange,
  plotSaveRef,
  plotSwitchPending = false,
  onResolvePlotSwitch,
  timelineScene = null,
  activeTimelineId = null,
  onTimelineOriginChange,
  dossier = null
}: {
  module: WriterModule
  width: number
  paneRef: RefObject<HTMLElement | null>
  /** 是否隐藏（标题栏面板开关的偏好；隐藏时挂 `.is-hidden`）。 */
  hidden?: boolean
  /** 书籍 id（路由参数）；时间线起点按书键读写。 */
  bookId?: string
  /** 当前选中章节 id（AI 面板按章加载会话；null = 未选中章节）。 */
  chapterId?: number | null
  /** 大纲页可见卷（与左栏同源）。 */
  outlineVolumes: VolumeRow[]
  /** 未删除大纲条目（与左栏同源）。 */
  outlineItems: OutlineItemRow[]
  /** 当前正在编辑的卷 id（章节模块 = 选中章所属卷；大纲模块 = 选中的正文卷）。 */
  activeVolumeId?: number | null
  /** 全书未删除剧情线（页面层 `plot.allLines`；章节「剧情」页签与大纲模块右栏跨时间线筛选用）。 */
  plotAllLines: PlotLineRow[]
  /** 全书剧情场景（页面层 `plot.scenes`）。 */
  plotScenes: PlotSceneRow[]
  /** 当前选中剧情线 id（剧情面板下拉默认值 / 卡片高亮）。 */
  activePlotLineId?: number | null
  /** 全书时间线（剧情面板时间线下拉选项）。 */
  timelines: TimelineEntry[]
  /** 当前选中剧情线（仅作编辑器上下文提示）。 */
  plotLine?: PlotLineRow | null
  /** 当前选中剧情场景；null = 未选中（渲染空态）。 */
  plotScene?: PlotSceneRow | null
  /** 保存剧情场景补丁（手动保存，仅变更字段；返回写入 promise 供「保存中」态）。 */
  onUpdatePlotScene?: (id: number, patch: UpdatePlotScenePatch) => void | Promise<void>
  /** 剧情节点是否有未保存改动（保存按钮禁用态）。 */
  plotDirty?: boolean
  /** 剧情节点脏态上报（编辑器草稿与场景行比对结果）。 */
  onPlotDirtyChange?: (dirty: boolean) => void
  /** 保存入口（编辑器挂载时写入；切换确认「保存」据此落库）。 */
  plotSaveRef?: RefObject<(() => void) | null>
  /** 是否有挂起的剧情切换（有改动时暂缓，弹两态确认）。 */
  plotSwitchPending?: boolean
  /** 结算挂起的剧情切换：`save=true` 先保存再切换，`false` 丢弃草稿直接切换。 */
  onResolvePlotSwitch?: (save: boolean) => void
  /** 时间线选中场景（只读详情）；null = 未选中（渲染空态）。 */
  timelineScene?: PlotSceneRow | null
  /** 当前选中时间线 id（右栏 origin 面板跟随切换）。 */
  activeTimelineId?: string | null
  /** origin 保存成功后回调（供页面层同步中栏显示）。 */
  onTimelineOriginChange?: (origin: string) => void
  /** 设定档案五域装配包（仅活动模块为五域之一时非空；详情面板消费）。 */
  dossier?: DossierBundle | null
}) {
  // 面板标题 / aria / 分段按钮为固定标签（i18n）；面板内容为演示数据或子组件（不译）。
  const { t } = useTranslation('writer')
  const { t: tCommon } = useTranslation('common')
  const { t: tPlot } = useTranslation('plot')
  const { t: tDossier } = useTranslation('dossier')

  // 章节模块页签独立记忆（默认「大纲」）；三个面板始终挂载。
  const [chapterTab, setChapterTab] = useState<RightPaneTab>('outline')

  return (
    <aside
      ref={paneRef}
      className={`rightpane${hidden ? ' is-hidden' : ''}`}
      style={{ width }}
      aria-label={t('rightPaneAria')}
      aria-hidden={hidden || undefined}
    >
      {/* 章节模块：右栏内「大纲 | 剧情 | AI」三页签；三面板常驻，切页签不卸载。 */}
      <div className={`rp-view${module === 'chapters' ? ' is-active' : ''}`} data-view="chapters">
        <RightPaneTabs value={chapterTab} onChange={setChapterTab} />
        <div className="rp-tabpanel" hidden={chapterTab !== 'outline'}>
          <OutlineRightPanel
            volumes={outlineVolumes}
            items={outlineItems}
            activeVolumeId={activeVolumeId}
          />
        </div>
        <div className="rp-tabpanel" hidden={chapterTab !== 'plot'}>
          <PlotFilterPanel
            lines={plotAllLines}
            scenes={plotScenes}
            timelines={timelines}
            activeTimelineId={activeTimelineId}
            activeLineId={activePlotLineId}
            bookId={bookId ?? ''}
          />
        </div>
        {/* AI 页签：模型 / 功能下拉 + 快捷结果或对话列表，结果可回插正文。
            `active` 仅在页签可见时为真（惰性加载）；面板本身常驻，切页签不丢状态。 */}
        <div className="rp-tabpanel" hidden={chapterTab !== 'ai'}>
          <AiPanel bookId={bookId ?? ''} chapterId={chapterId} active={chapterTab === 'ai'} />
        </div>
      </div>

      {/* 大纲模块：右栏挂载与章节「剧情」页签同款的面板（不带页签条）：
          双下拉筛选 + 只读时间轴卡片 + 实体胶囊 + 悬停正文浮窗。
          不补页签条占位，首张卡直接从栏级 8px 内衬起排。 */}
      <div className={`rp-view${module === 'outline' ? ' is-active' : ''}`} data-view="outline">
        <PlotFilterPanel
          lines={plotAllLines}
          scenes={plotScenes}
          timelines={timelines}
          activeTimelineId={activeTimelineId}
          activeLineId={activePlotLineId}
          bookId={bookId ?? ''}
        />
      </div>

      {/* 剧情模块：右栏为选中节点的正文富文本编辑器（底部手动保存）。 */}
      <div className={`rp-view${module === 'plot' ? ' is-active' : ''}`} data-view="plot">
        <div className="rp-body">
          <PlotEditor
            line={plotLine}
            scene={plotScene}
            dirty={plotDirty}
            onUpdateScene={onUpdatePlotScene ?? (() => undefined)}
            onDirtyChange={onPlotDirtyChange ?? (() => undefined)}
            saveRef={plotSaveRef ?? EMPTY_SAVE_REF}
          />
        </div>
        {/* 切换守卫（两态：保存 / 不保存）；Esc / 遮罩视为「不保存」，与取消同义。 */}
        <ConfirmDialog
          open={plotSwitchPending}
          title={tPlot('dialog.unsavedSwitch.title')}
          message={tPlot('dialog.unsavedSwitch.message')}
          confirmText={tCommon('save')}
          cancelText={tPlot('dialog.unsavedSwitch.discard')}
          tone="default"
          onConfirm={() => onResolvePlotSwitch?.(true)}
          onClose={() => onResolvePlotSwitch?.(false)}
        />
      </div>

      {/* 独立时间线：起点说明 + 可编辑起点（按书键经 settings 读写）+ 选中场景只读详情。 */}
      <div className={`rp-view${module === 'timeline' ? ' is-active' : ''}`} data-view="timeline">
        <div className="pane-head">
          <span className="pane-title">{t('right.timeline')}</span>
        </div>
        <TimelineRightPanel
          bookId={bookId}
          scene={timelineScene}
          activeTimelineId={activeTimelineId}
          onOriginChange={onTimelineOriginChange}
        />
      </div>

      {/* 设定档案五域详情面板：五域（含境界体系）统一按 module 参数化复用 `DossierDetail`
          （上段子类字段 + 下段富文本正文 + 底部保存条）。 */}
      {dossier ? (
        <div className="rp-view is-active" data-view={dossier.module}>
          {/* 设定档案视图不设面板头（模块标题由中栏承载）：`.rp-body--no-head`
              把顶部内衬由 8px 补到 12px，避免详情卡贴栏顶。 */}
          <div className="rp-body rp-body--no-head">
            <DossierDetail
              module={dossier.module}
              detail={dossier.detail}
              detailPending={dossier.detailPending}
              dirty={dossier.dirty}
              onUpdate={dossier.onUpdate}
              onDirtyChange={dossier.onDirtyChange}
              saveRef={dossier.saveRef}
            />
          </div>
          {/* 未保存确认（两态：保存并切换 / 不保存）；Esc / 遮罩视为「不保存」。
              与设定库条目一致，文案走 dossier 专属 key（条目口径）。 */}
          <ConfirmDialog
            open={dossier.switchPending}
            title={tDossier('dialog.unsavedSwitch.title')}
            message={tDossier('dialog.unsavedSwitch.message')}
            confirmText={tCommon('save')}
            cancelText={tDossier('dialog.unsavedSwitch.discard')}
            tone="default"
            onConfirm={() => dossier.onResolveSwitch(true)}
            onClose={() => dossier.onResolveSwitch(false)}
          />
        </div>
      ) : null}

      {(Object.keys(PANELS) as StaticPanelModule[]).map((id) => {
        const Panel = PANELS[id]
        return (
          <div key={id} className={`rp-view${module === id ? ' is-active' : ''}`} data-view={id}>
            <div className="pane-head">
              <span className="pane-title">{t(`right.${id}`)}</span>
            </div>
            <div className="rp-body">
              <Panel />
            </div>
          </div>
        )
      })}
    </aside>
  )
}

export default RightPane

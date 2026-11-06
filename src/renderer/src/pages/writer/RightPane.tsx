import { useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../components/ui'
import type { RichTextBodyValue } from '../../components/editor/useRichTextBodyEditor'
import type { WriterModule } from '../../shell/activityBar'
import type { ChapterRow, VolumeRow } from './chapters/chapterTree'
import ConfirmDialog from './ConfirmDialog'
import DossierDetail from './dossier/DossierDetail'
import type { DossierBundle } from './dossier/dossierTree'
import ForeshadowPanel from './foreshadow/ForeshadowPanel'
import type { ForeshadowBundle } from './foreshadow/foreshadowTree'
import InspirationPanel from './inspiration/InspirationPanel'
import type { InspirationBundle } from './inspiration/inspirationTree'
import type { OutlineItemRow } from './outline/outlineTree'
import PlotEditor from './plot/PlotEditor'
import type { PlotLineRow, PlotSceneRow, UpdatePlotScenePatch } from './plot/plotTree'
import { AiPanel } from './right/AiPanel'
import { ForeshadowOverviewPanel } from './right/ForeshadowOverviewPanel'
import { InspirationOverviewPanel } from './right/InspirationOverviewPanel'
import { OutlineRightPanel } from './right/OutlineRightPanel'
import { PlotFilterPanel } from './right/PlotFilterPanel'
import { RightPaneTabs, type RightPaneTab } from './right/RightPaneTabs'
import { TimelineRightPanel } from './right/TimelineRightPanel'
import type { TimelineEntry } from './timeline/timelineOrigin'

/** 调用方未传保存入口时的占位 ref（仅保证必填契约，编辑器写入无副作用）。 */
const EMPTY_SAVE_REF: RefObject<(() => void | Promise<boolean>) | null> = { current: null }

/**
 * 写作页右栏：按模块渲染对应 `.rp-view`（内容统一为 `.rp-body`；各模块均不设面板头，
 * 模块标题由中栏承载，首块直接从栏级内衬起排）。
 *
 * - **章节模块**：右栏为「大纲 / 剧情 / 伏笔 / AI / 灵感」五页签（页签条 + 大纲面板 +
 *   剧情面板 + 伏笔总览面板 + AI 面板 + 灵感总览面板）。
 *   剧情页签走 `PlotFilterPanel`（时间线 + 剧情线双下拉筛选 + 只读时间轴卡片 + 悬停正文浮窗），
 *   与大纲模块右栏同款面板，只是多一层页签条。五个面板**始终挂载**，只用 `hidden` 切换显隐，
 *   列表滚动位置不因页签切换丢失；页签状态只在章节模块内记忆（`chapterTab`，默认「大纲」）。
 *   AI 页签挂载 `AiPanel`（模型 / 功能下拉 + 快捷结果 / 对话两种模式，结果可回插正文），
 *   惰性加载：`active` 仅在页签可见时为真，不可见时不发起任何模型 / 会话请求。
 *   伏笔页签挂载 `ForeshadowOverviewPanel`（全书伏笔按派生状态分组的只读卡片总览），
 *   同样惰性加载，且切离章节模块时不拉数据。
 *   灵感页签挂载 `InspirationOverviewPanel`（全书灵感平铺的只读卡片总览，点卡片在右栏内
 *   展开只读详情），同样惰性加载，且切离章节模块时不拉数据。
 * - **大纲模块**：右栏直接挂载同一 `PlotFilterPanel`（无页签条）：时间线 + 剧情线双下拉筛选 +
 *   只读时间轴卡片 + 实体胶囊 + 悬停正文浮窗，点击只选中，不提供正文编辑器。
 * - **剧情模块**：右栏为节点正文富文本编辑器（`PlotEditor`：正文 + 底部保存条；
 *   未保存切换由 `ConfirmDialog` 两态确认）。
 * - **伏笔模块**：右栏为详情表单（名称 / 描述 / 状态 + 只读锚点 + 底部保存条；
 *   不设面板头，可编辑块吸收剩余高度；未保存切换同样两态确认）。
 * - **灵感模块**：右栏为详情表单（标题 / 纯文本正文 / 标签 + 底部保存条与删除入口；
 *   不设面板头，正文 textarea 吸收剩余高度；未保存切换同样两态确认）。
 * - 面板常驻，`is-active` 控制显示；宽度由 `WorkspaceLayout` 经 `--wf-right-width`
 *   下发（本栏内联 `style.width` 消费，拖拽改宽不触发本栏重渲染）；
 *   显隐由标题栏「隐藏/显示右栏」按钮的偏好驱动（`hidden` → `.is-hidden`）。
 */
export function RightPane({
  module,
  paneRef,
  hidden = false,
  bookId,
  chapterId = null,
  chapters,
  volumes,
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
  plotConfirming = false,
  plotDraftResetKey = 0,
  onResolvePlotSwitch,
  timelineScene = null,
  timelineOriginSelected = false,
  activeTimelineId = null,
  onUpdateTimelineDescription,
  timelineFlushRef,
  dossier = null,
  foreshadow = null,
  inspiration = null
}: {
  module: WriterModule
  paneRef: RefObject<HTMLElement | null>
  /** 是否隐藏（标题栏面板开关的偏好；隐藏时挂 `.is-hidden`）。 */
  hidden?: boolean
  /** 书籍 id（路由参数）；时间线起点按书键读取。 */
  bookId?: string
  /** 当前选中章节 id（AI 面板按章加载会话；null = 未选中章节）。 */
  chapterId?: number | null
  /** 未删除章（伏笔右栏解析章节锚点目标）。 */
  chapters: readonly ChapterRow[]
  /** 章节页可见卷（伏笔右栏补全「卷 · 章」完整位置）。 */
  volumes: readonly VolumeRow[]
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
  /** 保存剧情场景补丁（手动保存，仅变更字段；返回写入 promise 供「保存中」态 / 关闭前 flush 判定成败）。 */
  onUpdatePlotScene?: (id: number, patch: UpdatePlotScenePatch) => void | Promise<boolean>
  /** 剧情节点是否有未保存改动（保存按钮禁用态）。 */
  plotDirty?: boolean
  /** 剧情节点脏态上报（编辑器草稿与场景行比对结果）。 */
  onPlotDirtyChange?: (dirty: boolean) => void
  /** 保存入口（编辑器挂载时写入；切换确认「保存」/ 关闭前 flush 据此落库）。 */
  plotSaveRef?: RefObject<(() => void | Promise<boolean>) | null>
  /** 是否有挂起的剧情切换（有改动时暂缓，弹两态确认）。 */
  plotSwitchPending?: boolean
  /** 剧情切换保存结算中（确认弹框据此禁用按钮）。 */
  plotConfirming?: boolean
  /** 草稿重置键：递增即重挂 `PlotEditor`，把草稿回退到场景行值。 */
  plotDraftResetKey?: number
  /**
   * 结算挂起的剧情切换：`save=true` 先保存再切换，`false` 丢弃草稿直接切换。
   * 返回是否已切换：保存失败为 `false`（不切换、脏态保留）。
   */
  onResolvePlotSwitch?: (save: boolean) => void | Promise<boolean>
  /** 时间线选中场景（只读详情）；null = 未选中场景。 */
  timelineScene?: PlotSceneRow | null
  /** 是否选中时间线元年卡（true = 右栏只显示起点编辑卡；false 时按 `timelineScene` 显示详情 / 空态）。 */
  timelineOriginSelected?: boolean
  /** 当前选中时间线 id（右栏 origin 面板跟随切换）。 */
  activeTimelineId?: string | null
  /** 写回当前选中时间线的起点描述（右栏「起点」卡保存；入参为编辑器归一值）。 */
  onUpdateTimelineDescription: (value: RichTextBodyValue) => Promise<boolean>
  /** 时间线起点卡关闭前 flush 入口（页面层聚合调用）。 */
  timelineFlushRef?: RefObject<(() => Promise<void>) | null>
  /** 设定档案五域装配包（仅活动模块为五域之一时非空；详情面板消费）。 */
  dossier?: DossierBundle | null
  /** 伏笔装配包（仅活动模块为伏笔时非空；详情面板消费）。 */
  foreshadow?: ForeshadowBundle | null
  /** 灵感装配包（仅活动模块为灵感时非空；详情面板消费）。 */
  inspiration?: InspirationBundle | null
}) {
  // 面板标题 / aria / 分段按钮为固定标签（i18n）；面板内容为演示数据或子组件（不译）。
  const { t } = useTranslation('writer')
  const { t: tCommon } = useTranslation('common')
  const { t: tPlot } = useTranslation('plot')
  const { t: tDossier } = useTranslation('dossier')
  const { t: tForeshadow } = useTranslation('foreshadow')
  const { t: tInspiration } = useTranslation('inspiration')

  // 域内切条目的「保存」失败提示：不切换、脏态保留，可直接再点一次重试。
  const { show: showSaveFailed, node: saveFailedToast } = useToast()

  // 章节模块页签独立记忆（默认「大纲」）；三个面板始终挂载。
  const [chapterTab, setChapterTab] = useState<RightPaneTab>('outline')

  return (
    <aside
      ref={paneRef}
      className={`rightpane${hidden ? ' is-hidden' : ''}`}
      style={{ width: 'var(--wf-right-width)' }}
      aria-label={t('rightPaneAria')}
      aria-hidden={hidden || undefined}
    >
      {/* 章节模块：右栏内「大纲 | 剧情 | 伏笔 | AI | 灵感」五页签；五面板常驻，切页签不卸载。 */}
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
        {/* 伏笔页签：全书伏笔按派生状态分组的只读卡片总览。
            `active` 仅在「章节模块 + 伏笔页签可见」时为真（惰性加载，切离章节模块即停拉）；
            面板常驻，切页签不丢滚动位置。数据由面板自行拉取（不启用 `useForeshadowBundle`，
            避免顺带挂载伏笔详情面板）。 */}
        <div className="rp-tabpanel" hidden={chapterTab !== 'foreshadow'}>
          <ForeshadowOverviewPanel
            bookId={bookId ?? ''}
            active={module === 'chapters' && chapterTab === 'foreshadow'}
            chapters={chapters}
            volumes={volumes}
            outlineItems={outlineItems}
          />
        </div>
        {/* AI 页签：模型 / 功能下拉 + 快捷结果或对话列表，结果可回插正文。
            `active` 仅在页签可见时为真（惰性加载）；面板本身常驻，切页签不丢状态。 */}
        <div className="rp-tabpanel" hidden={chapterTab !== 'ai'}>
          <AiPanel bookId={bookId ?? ''} chapterId={chapterId} active={chapterTab === 'ai'} />
        </div>
        {/* 灵感页签：全书灵感平铺的只读卡片总览，点卡片在右栏内展开只读详情。
            `active` 仅在「章节模块 + 灵感页签可见」时为真（惰性加载，切离章节模块即停拉）；
            面板常驻，切页签不丢滚动位置。数据由面板自行拉取（不启用 `useInspirationBundle`，
            后者仅在灵感模块激活时返回值）。 */}
        <div className="rp-tabpanel" hidden={chapterTab !== 'inspiration'}>
          <InspirationOverviewPanel
            bookId={bookId ?? ''}
            active={module === 'chapters' && chapterTab === 'inspiration'}
          />
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
            key={`${plotScene?.id}-${plotDraftResetKey}`}
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
          confirming={plotConfirming}
          onConfirm={() => {
            void Promise.resolve(onResolvePlotSwitch?.(true)).then((switched) => {
              if (switched === false) showSaveFailed(tCommon('saveFailed'))
            })
          }}
          onClose={() => {
            void onResolvePlotSwitch?.(false)
          }}
        />
      </div>

      {/* 独立时间线：不设面板头（模块标题由中栏承载）——`.rp-body--no-head` 补顶部内衬。
          按选中项只显示一张卡：选中起点 →「起点」编辑卡；选中场景 → 该场景只读详情；
          都没选 → 现有空态（样式见 writer-timeline.css）。 */}
      <div className={`rp-view${module === 'timeline' ? ' is-active' : ''}`} data-view="timeline">
        <TimelineRightPanel
          bookId={bookId}
          activeTimelineId={activeTimelineId}
          onUpdateDescription={onUpdateTimelineDescription}
          flushRef={timelineFlushRef}
          scene={timelineScene}
          originSelected={timelineOriginSelected}
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
              与设定库条目一致，文案走 dossier 专属 key（条目口径）。
              「保存」等落库结果：失败则不切换、脏态保留，关框后 toast 提示可重试。 */}
          <ConfirmDialog
            open={dossier.switchPending}
            title={tDossier('dialog.unsavedSwitch.title')}
            message={tDossier('dialog.unsavedSwitch.message')}
            confirmText={tCommon('save')}
            cancelText={tDossier('dialog.unsavedSwitch.discard')}
            tone="default"
            confirming={dossier.confirming}
            onConfirm={() => {
              void dossier.onResolveSwitch(true).then((switched) => {
                if (!switched) showSaveFailed(tCommon('saveFailed'))
              })
            }}
            onClose={() => {
              void dossier.onResolveSwitch(false)
            }}
          />
        </div>
      ) : null}

      {/* 伏笔详情面板：名称 / 描述 / 状态（草稿态 + 底部保存条）+ 只读锚点信息 + 删除确认。
          条件挂载（活动模块为伏笔时），选中项 / 草稿真源在页面层装配包。 */}
      {foreshadow ? (
        <div className="rp-view is-active" data-view="foreshadow">
          {/* 不设面板头（模块标题由中栏承载）：`.rp-body--no-head` 补顶部内衬，
              删掉标题栏让出的高度由可编辑块吸收（见 writer-foreshadow.css）。 */}
          <div className="rp-body rp-body--no-head">
            <ForeshadowPanel
              bundle={foreshadow}
              chapters={chapters}
              volumes={volumes}
              outlineItems={outlineItems}
            />
          </div>
          {/* 域内切换未保存确认（两态：保存并切换 / 不保存）；Esc / 遮罩视为「不保存」。 */}
          <ConfirmDialog
            open={foreshadow.switchPending}
            title={tForeshadow('dialog.unsavedSwitch.title')}
            message={tForeshadow('dialog.unsavedSwitch.message')}
            confirmText={tCommon('save')}
            cancelText={tForeshadow('dialog.unsavedSwitch.discard')}
            tone="default"
            confirming={foreshadow.confirming}
            onConfirm={() => {
              void foreshadow.onResolveSwitch(true).then((switched) => {
                if (!switched) showSaveFailed(tCommon('saveFailed'))
              })
            }}
            onClose={() => {
              void foreshadow.onResolveSwitch(false)
            }}
          />
        </div>
      ) : null}

      {/* 灵感详情面板：标题 / 正文 / 标签（草稿态 + 底部保存条与删除） + 删除 / 切换确认。
          条件挂载（活动模块为灵感时），选中项 / 草稿真源在页面层装配包。 */}
      {inspiration ? (
        <div className="rp-view is-active" data-view="inspiration">
          {/* 不设面板头（模块标题由中栏承载）：`.rp-body--no-head` 补顶部内衬，
              正文 textarea 吸收剩余高度（见 writer-inspiration.css）。 */}
          <div className="rp-body rp-body--no-head">
            <InspirationPanel bundle={inspiration} />
          </div>
          {/* 域内切换未保存确认（两态：保存并切换 / 不保存）；Esc / 遮罩视为「不保存」。 */}
          <ConfirmDialog
            open={inspiration.switchPending}
            title={tInspiration('dialog.unsavedSwitch.title')}
            message={tInspiration('dialog.unsavedSwitch.message')}
            confirmText={tCommon('save')}
            cancelText={tInspiration('dialog.unsavedSwitch.discard')}
            tone="default"
            confirming={inspiration.confirming}
            onConfirm={() => {
              void inspiration.onResolveSwitch(true).then((switched) => {
                if (!switched) showSaveFailed(tCommon('saveFailed'))
              })
            }}
            onClose={() => {
              void inspiration.onResolveSwitch(false)
            }}
          />
        </div>
      ) : null}

      {/* 域内切换「保存」失败提示：剧情 / 设定档案 / 伏笔 / 灵感共用，toast 走 portal，位置不影响视觉。 */}
      {saveFailedToast}
    </aside>
  )
}

export default RightPane

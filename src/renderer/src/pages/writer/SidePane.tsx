import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { WriterModule } from '../../shell/activityBar'
import ChaptersPanel from './chapters/ChaptersPanel'
import type { ChapterPin, ChapterRow, VolumeRow } from './chapters/chapterTree'
import type { CreateChapterInput } from './chapters/useChapterTree'
import OutlinePanel from './outline/OutlinePanel'
import type { OutlineItemRow, OutlineSelection } from './outline/outlineTree'
import PlotPanel from './plot/PlotPanel'
import type { PlotLineRow, PlotSceneRow, UpdatePlotLinePatch } from './plot/plotTree'
import TimelinePanel from './timeline/TimelinePanel'
import { countPlotLinesByTimeline } from './timeline/timelinePlotCounts'
import type { TimelineEntry } from './timeline/timelineOrigin'

interface SidePaneProps {
  /** 当前书籍 id（面板以 `key={bookId}` 重挂载，切书重置卷 / 分组展开态）。 */
  bookId?: string
  /** 当前激活模块。 */
  module: WriterModule
  /** 左栏元素引用（供分隔条读取起始宽）。 */
  paneRef: React.RefObject<HTMLElement | null>
  /** 是否自动收起（无实体左栏的模块）。 */
  autoHidden: boolean
  /** 章节未删除卷（共享卷池；含自定义卷，后端顺序：自定义卷置顶）。 */
  volumes: VolumeRow[]
  /** 未删除章（后端顺序：按卷分组、组内 pin 段序）。 */
  chapters: ChapterRow[]
  /** 当前选中章节 id（页面层持有，与中栏编辑器共享）。 */
  activeChapterId: number | null
  /** 章节选中回调（传章节 id）。 */
  onSelectChapter: (id: number) => void
  /** 新建章（`volumeId` 必填；特殊章带前段 + 名）。 */
  onCreateChapter: (input: CreateChapterInput) => void
  /** 重命名卷：写 `title` 名段（`custom` 卷整名必填，`normal` 卷名段可空）。 */
  onRenameVolume: (id: number, title: string) => void
  /** 软删除卷（整卷入回收站）。 */
  onDeleteVolume: (id: number) => void
  /** 软删除章。 */
  onDeleteChapter: (id: number) => void
  /** 特殊章置顶 / 置底切换。 */
  onSetChapterPin: (id: number, pin: ChapterPin) => void
  /** 同段内重排章（松手落库）。 */
  onReorderChapter: (id: number, targetIndex: number) => void
  /** 卷内普通章是否达上限（「新建章」禁用）。 */
  isVolumeFull: (volumeId: number) => boolean
  /** 大纲页可见卷（`kind IN ('normal','group')`；供卷 / 分组行渲染）。 */
  outlineVolumes: VolumeRow[]
  /** 大纲未删除条目（`scope='entry'`）。 */
  outlineItems: OutlineItemRow[]
  /** 当前大纲编辑选中态（页面层持有，与中栏编辑器共享）。 */
  activeOutlineSelection: OutlineSelection | null
  /** 大纲编辑目标打开回调（条目 / 分组 / 卷行点击 → 中栏编辑）。 */
  onOpenOutlineTarget: (selection: OutlineSelection) => void
  /** 重命名大纲卷 / 分组（走共享卷通道，写 `title` 名段）。 */
  onRenameOutlineVolume: (id: number, title: string) => void
  /** 软删除大纲卷（含其下章）。 */
  onDeleteOutlineVolume: (id: number) => void
  /** 在大纲卷 / 分组下新建条目（纯自定义名）。 */
  onCreateOutlineChapter: (volumeId: number) => void
  /** 重命名大纲条目（走条目通道）。 */
  onRenameOutlineItem: (id: number, title: string) => void
  /** 软删除大纲条目 / 条目级操作（走条目通道）。 */
  onDeleteOutlineChapter: (id: number) => void
  /** 大纲章同卷内重排（松手落库）。 */
  onReorderOutlineChapter: (id: number, targetIndex: number) => void
  /** 在指定分组容器下新建条目。 */
  onCreateOutlineEntryInGroup: (groupId: number) => void
  /** 剧情未删除剧情线（后端顺序：`sortOrder, id`）。 */
  plotLines: PlotLineRow[]
  /** 全书未删除剧情线（不过滤时间线；用于左栏时间线删除禁用计数）。 */
  allPlotLines: PlotLineRow[]
  /** 全书未删除剧情场景（用于统计各线节点数）。 */
  plotScenes: PlotSceneRow[]
  /** 当前选中剧情线 id（页面层持有，与中栏 / 右栏共享）。 */
  activePlotLineId: number | null
  /** 剧情线选中回调。 */
  onSelectPlotLine: (id: number) => void
  /** 更新剧情线（三字段补丁，经 `updateLine` 落库）。 */
  onUpdatePlotLine: (id: number, patch: UpdatePlotLinePatch) => void
  /** 软删除剧情线（含其下场景）。 */
  onDeletePlotLine: (id: number) => void
  /** 时间线列表（左栏）。 */
  timelineEntries: TimelineEntry[]
  /** 当前选中时间线 id。 */
  activeTimelineId: string | null
  /** 时间线选中回调。 */
  onSelectTimeline: (id: string) => void
  /** 重命名时间线（写 `name`，空名回退默认名）。 */
  onRenameTimeline: (id: string, name: string) => Promise<boolean>
  /** 删除时间线（至少保留一条；返回是否成功）。 */
  onDeleteTimeline: (id: string) => Promise<boolean>
}

/**
 * 写作页左栏：按模块渲染对应 `.sp-panel`（仅 `.pane-body` 正文，无面板标题）。
 * 面板全部常驻（与原型一致），由 `is-active` 控制显示 / 动画；
 * 宽度由页面 state 控制内联 `style.width`，无实体左栏的模块 `is-auto-hidden`。
 * 章节树面板已拆分至 `chapters/ChaptersPanel.tsx`（v2：卷章双段 / 拖拽 / 弹窗）。
 */
export function SidePane({
  bookId,
  module,
  paneRef,
  autoHidden,
  volumes,
  chapters,
  activeChapterId,
  onSelectChapter,
  onCreateChapter,
  onRenameVolume,
  onDeleteVolume,
  onDeleteChapter,
  onSetChapterPin,
  onReorderChapter,
  isVolumeFull,
  outlineVolumes,
  outlineItems,
  activeOutlineSelection,
  onOpenOutlineTarget,
  onRenameOutlineVolume,
  onDeleteOutlineVolume,
  onCreateOutlineChapter,
  onRenameOutlineItem,
  onDeleteOutlineChapter,
  onReorderOutlineChapter,
  onCreateOutlineEntryInGroup,
  plotLines,
  allPlotLines,
  plotScenes,
  activePlotLineId,
  onSelectPlotLine,
  onUpdatePlotLine,
  onDeletePlotLine,
  timelineEntries,
  activeTimelineId,
  onSelectTimeline,
  onRenameTimeline,
  onDeleteTimeline
}: SidePaneProps) {
  const { t } = useTranslation('writer')
  const classes = `sidepane${autoHidden ? ' is-auto-hidden' : ''}`
  // 左栏时间线删除禁用：按全书剧情线一次性聚合每条时间线的条数（不逐行发 IPC）。
  // 数据源自页面层 `plot.allLines`，剧情线增删后自动重算，无需额外刷新时机。
  const plotLineCounts = useMemo(() => countPlotLinesByTimeline(allPlotLines), [allPlotLines])
  // 章节面板弹窗（新建卷等）挂载引用：仅保证 paneRef 透传（面板内部自持状态）。
  const panelRef = useRef<HTMLDivElement | null>(null)

  return (
    <aside
      ref={paneRef}
      className={classes}
      style={{ width: autoHidden ? 0 : 'var(--wf-side-width)' }}
      aria-label={t('sidePaneAria')}
    >
      <div
        ref={panelRef}
        className={`sp-panel${module === 'chapters' ? ' is-active' : ''}`}
        data-view="chapters"
      >
        <ChaptersPanel
          key={bookId ?? ''}
          bookId={bookId}
          volumes={volumes}
          chapters={chapters}
          activeChapterId={activeChapterId}
          onSelectChapter={onSelectChapter}
          onCreateChapter={onCreateChapter}
          onRenameVolume={onRenameVolume}
          onDeleteVolume={onDeleteVolume}
          onDeleteChapter={onDeleteChapter}
          onSetChapterPin={onSetChapterPin}
          onReorderChapter={onReorderChapter}
          isVolumeFull={isVolumeFull}
        />
      </div>

      <div className={`sp-panel${module === 'outline' ? ' is-active' : ''}`} data-view="outline">
        <OutlinePanel
          key={bookId ?? ''}
          bookId={bookId}
          volumes={outlineVolumes}
          chapters={outlineItems}
          activeSelection={activeOutlineSelection}
          onOpenTarget={onOpenOutlineTarget}
          onRenameVolume={onRenameOutlineVolume}
          onDeleteVolume={onDeleteOutlineVolume}
          onCreateChapter={onCreateOutlineChapter}
          onRenameChapter={onRenameOutlineItem}
          onDeleteChapter={onDeleteOutlineChapter}
          onReorderChapter={onReorderOutlineChapter}
          onCreateEntryInGroup={onCreateOutlineEntryInGroup}
        />
      </div>

      <div className={`sp-panel${module === 'plot' ? ' is-active' : ''}`} data-view="plot">
        <PlotPanel
          lines={plotLines}
          scenes={plotScenes}
          activeLineId={activePlotLineId}
          onSelectLine={onSelectPlotLine}
          onUpdateLine={onUpdatePlotLine}
          onDeleteLine={onDeletePlotLine}
          timelines={timelineEntries}
          activeTimelineId={activeTimelineId}
          onSelectTimeline={onSelectTimeline}
        />
      </div>

      <div className={`sp-panel${module === 'timeline' ? ' is-active' : ''}`} data-view="timeline">
        <TimelinePanel
          timelines={timelineEntries}
          activeId={activeTimelineId}
          onSelect={onSelectTimeline}
          onRename={onRenameTimeline}
          onDelete={onDeleteTimeline}
          plotLineCounts={plotLineCounts}
        />
      </div>
    </aside>
  )
}

export default SidePane

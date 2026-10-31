import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { WriterModule } from '../../shell/activityBar'
import PlaceholderView from './PlaceholderView'
import ChaptersView from './chapters/ChaptersView'
import ChaptersTrashView from './chapters/ChaptersTrashView'
import { useChapterLabels } from './chapters/useChapterLabels'
import {
  volumeNameLabel,
  type ChapterRow,
  type ChapterStatus,
  type CreateVolumeInput,
  type RenameChapterPatch,
  type VolumeRow
} from './chapters/chapterTree'
import OutlineEditor from './outline/OutlineEditor'
import {
  type OutlineEditorTarget,
  type OutlineItemRow,
  type OutlineSelection
} from './outline/outlineTree'
import type { OutlineVolumeContentRef } from './outline/useOutlineVolumes'
import PlotTimeline from './plot/PlotTimeline'
import TimelineView from './timeline/TimelineView'
import type {
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineRow,
  PlotSceneRow,
  UpdatePlotScenePatch
} from './plot/plotTree'
import DossierView from './dossier/DossierView'
import type { DossierBundle } from './dossier/dossierTree'

export interface EditorPaneProps {
  /** 当前激活模块。 */
  module: WriterModule
  /** 书籍 id（路由参数），透传给章节视图做实体匹配。 */
  bookId?: string
  /** 当前选中章节行（页面层共享状态）。 */
  chapter: ChapterRow | null
  /** 同书全部未删除章（特殊 → 普通切换时预判组内编号）。 */
  chapters: ChapterRow[]
  /** 状态切换回调（两态）。 */
  onStatusChange: (id: number, status: ChapterStatus) => void
  /** 编辑头章节名落库回调（字段直映射）。 */
  onRenameChapter: (id: number, patch: RenameChapterPatch) => void
  /** 搜索命中跳转到其它章：切换页面选中章。 */
  onSelectChapter: (id: number) => void
  /** 正文替换后回调（刷新章节树等）。 */
  onContentChanged: (chapterIds: number[]) => void
  /** 新建卷（创建弹窗提交；页面层调共享卷源 `createVolume`）。 */
  onCreateVolume: (input: CreateVolumeInput) => void
  /** 切换回收站视图。 */
  onToggleTrash: () => void
  /** 回收站视图是否打开。 */
  trashOpen: boolean
  /** 回收站视图内还原 / 彻底删除后回调（页面刷新章节树）。 */
  onTrashChanged: () => void
  /** 大纲回收站视图内还原 / 彻底删除后回调（页面刷新大纲树）。 */
  onOutlineTrashChanged: () => void
  /** 大纲卷回收站还原卷后回调（页面重取大纲卷与卷纲载体）。 */
  onOutlineVolumesRefresh: () => void
  /** 新建非卷单条目（创建弹窗提交；`name` 可空 = 空名条目；页面层调共享章源）。 */
  onCreateOutlineNonVolumeChapter: (name: string) => void
  /** 新建非卷分组（创建弹窗提交；`name` 可空 = 默认名分组；页面层调共享章源）。 */
  onCreateOutlineGroup: (name: string) => void
  /** 大纲条目重命名（编辑头题名提交：条目；走条目通道）。 */
  onRenameOutlineChapter: (id: number, title: string) => void
  /** 大纲卷 / 分组重命名（编辑头题名提交：卷 / 分组；走共享卷通道，写 `title` 名段）。 */
  onRenameOutlineVolume: (id: number, title: string) => void
  /** 当前大纲编辑选中态（页面层共享，与左栏大纲树一致）。 */
  outlineSelection?: OutlineSelection | null
  /** 大纲页可见卷（`kind IN ('normal','group')`；供卷 / 分组目标解析）。 */
  outlineVolumes?: VolumeRow[]
  /** 各承载卷纲的卷（正文卷 / 分组）的卷纲载体行（`volumeId → 卷纲行 id`），供卷 / 分组目标解析 `contentId`。 */
  outlineVolumeRows?: OutlineVolumeContentRef[]
  /** 大纲未删除条目（按 id 查选中条目）。 */
  outlineItems?: OutlineItemRow[]
  /** 当前选中剧情线（页面层共享，与左栏剧情线列表一致）。 */
  plotLine?: PlotLineRow | null
  /** 当前选中线下的场景（组内 `sortOrder, id` 升序）。 */
  plotScenes?: PlotSceneRow[]
  /** 当前选中剧情场景 id（页面层共享，与右栏编辑器一致）。 */
  activePlotSceneId?: number | null
  /** 剧情场景选中回调。 */
  onSelectPlotScene?: (id: number) => void
  /** 新建剧情场景节点（节点弹窗提交时间 + 标题后追加到当前线末尾）。 */
  onAddPlotScene?: (input?: CreatePlotSceneInput) => void
  /** 更新剧情场景补丁（中栏时间 / 标题改动即时落库）。 */
  onUpdatePlotScene?: (id: number, patch: UpdatePlotScenePatch) => void
  /** 软删除剧情场景节点（中栏卡内删除按钮经二次确认后调用）。 */
  onDeletePlotScene?: (id: number) => void
  /** 新建剧情线（三字段弹窗提交；剧情视图标题栏入口落库用）。 */
  onCreatePlotLine?: (name?: string, options?: CreatePlotLineOptions) => Promise<PlotLineRow | null>
  /** 时间线选中场景 id（页面层持有，与右栏只读详情共享）。 */
  timelineSelectedSceneId?: number | null
  /** 时间线场景选中回调（页面层包装：选中 + 隐藏时自动展开右栏）。 */
  onSelectTimelineScene?: (id: number) => void
  /** 当前选中时间线的 origin（中栏显示）。 */
  timelineOrigin?: string
  /** 当前激活时间线名称（新建剧情线弹窗只读展示用）。 */
  activeTimelineName?: string
  /** 当前激活时间线 id（新建剧情线继承用）。 */
  activeTimelineId?: string | null
  /** 新建时间线入口（标题栏按钮）；缺省则不渲染。 */
  onCreateTimeline?: (name: string, origin?: string) => void | Promise<unknown>
  /** 设定档案五域装配包（仅活动模块为五域之一时非空；中栏卡片视图消费）。 */
  dossier?: DossierBundle | null
}

/** 骨架阶段占位视图的模块（顺序与模块栏「伏笔 / 灵感」一致）。 */
const PLACEHOLDER_MODULES: readonly WriterModule[] = ['foreshadow', 'inspiration']

/**
 * 写作页中栏：按模块渲染对应 `.ep-view`（常驻，`is-active` 控制显示）。
 *
 * 章节视图已拆分至 `chapters/ChaptersView.tsx`（Tiptap 正文 + 持久化 + 实体高亮）；
 * 大纲视图为 `outline/OutlineEditor.tsx`（选中大纲章 → 编辑其关联文档正文）；
 * 剧情 / 时间线各有独立视图；设定档案五域（世界观 / 角色 / 势力 / 境界体系 / 物品功法）
 * 复用 `dossier/DossierView.tsx`（卡片网格，按 module 参数化）；伏笔 / 灵感仍为占位。
 */
export function EditorPane({
  module,
  bookId,
  chapter,
  chapters,
  onStatusChange,
  onRenameChapter,
  onSelectChapter,
  onContentChanged,
  onCreateVolume,
  onToggleTrash,
  trashOpen,
  onTrashChanged,
  onOutlineTrashChanged,
  onOutlineVolumesRefresh,
  onCreateOutlineNonVolumeChapter,
  onCreateOutlineGroup,
  onRenameOutlineChapter,
  onRenameOutlineVolume,
  outlineSelection,
  outlineVolumes,
  outlineVolumeRows,
  outlineItems,
  plotLine = null,
  plotScenes = [],
  activePlotSceneId = null,
  onSelectPlotScene,
  onAddPlotScene,
  onUpdatePlotScene,
  onDeletePlotScene,
  onCreatePlotLine,
  timelineSelectedSceneId = null,
  onSelectTimelineScene,
  timelineOrigin,
  activeTimelineName,
  activeTimelineId,
  onCreateTimeline,
  dossier = null
}: EditorPaneProps) {
  // 占位模块显示名走 `module` i18n 命名空间（键即模块 id），随界面语言切换。
  const { t: tModule } = useTranslation('module')
  const labels = useChapterLabels()
  // 编辑目标解析：由 `OutlineSelection` 查行派生（未选中 / 目标已删除 / 卷缺失 → null）。
  const outlineTarget = useMemo<OutlineEditorTarget | null>(() => {
    if (!outlineSelection || !outlineVolumes) return null
    if (outlineSelection.kind === 'volume') {
      const volume = outlineVolumes.find((row) => row.id === outlineSelection.id)
      if (!volume || volume.kind !== 'normal' || volume.deletedAt !== null) return null
      // 正文档的正文载体 = 其卷纲行（`scope='volume'`）；分组容器同走卷纲行（见下 group 分支）。
      const ref = outlineVolumeRows?.find((row) => row.volumeId === volume.id)
      return {
        kind: 'volume',
        id: volume.id,
        contentId: ref?.id ?? null,
        title: volumeNameLabel(volume),
        prefix: labels.volumePrefixLabel(volume),
        // 「最后编辑」时间源 = 卷纲载体行（正文保存随之刷新）；无卷纲行 → null。
        updatedAt: ref?.updatedAt ?? null
      }
    }
    if (outlineSelection.kind === 'group') {
      const group = outlineVolumes.find((row) => row.id === outlineSelection.id)
      if (!group || group.kind !== 'group' || group.deletedAt !== null) return null
      // 分组容器同样承载卷纲正文：正文载体 = 其卷纲行（`scope='volume'`，与正文卷同逻辑）；
      // 分组无「卷X」编号前缀（`kind !== 'normal'` → prefix 恒空）。
      const ref = outlineVolumeRows?.find((row) => row.volumeId === group.id)
      return {
        kind: 'group',
        id: group.id,
        contentId: ref?.id ?? null,
        title: group.title,
        prefix: '',
        updatedAt: ref?.updatedAt ?? null
      }
    }
    // 条目：编辑头只显示条目标题（不显示所属卷编号前缀）；大纲条目为纯自定义名。
    const item = outlineItems?.find((row) => row.id === outlineSelection.id)
    if (!item) return null
    return {
      kind: 'entry',
      id: item.id,
      contentId: item.id,
      title: item.title,
      prefix: '',
      // 条目「最后编辑」时间源 = 条目行自身 `updated_at`。
      updatedAt: item.updatedAt
    }
  }, [outlineSelection, outlineVolumes, outlineVolumeRows, outlineItems, labels])

  return (
    <main className="editor-pane">
      {/* 章节视图常驻（有 props 与编辑器生命周期）；回收站打开时仅以 is-active 隐藏，
          保持标题栏按钮组注册不中断（关闭回收站后可立即切回编辑器）。 */}
      <div
        className={`ep-view${module === 'chapters' && !trashOpen ? ' is-active' : ''}`}
        data-view="chapters"
      >
        <ChaptersView
          bookId={bookId}
          chapter={chapter}
          chapters={chapters}
          onStatusChange={onStatusChange}
          onRenameChapter={onRenameChapter}
          onSelectChapter={onSelectChapter}
          onContentChanged={onContentChanged}
          onCreateVolume={onCreateVolume}
          onToggleTrash={onToggleTrash}
          trashOpen={trashOpen}
        />
      </div>

      {/* 回收站视图（章节模块内切换；替代编辑器区）；仅打开时挂载，避免后台空跑 */}
      <div
        className={`ep-view ep-trash${module === 'chapters' && trashOpen ? ' is-active' : ''}`}
        data-view="trash"
      >
        {module === 'chapters' && trashOpen ? (
          <ChaptersTrashView bookId={bookId ?? ''} onChanged={onTrashChanged} />
        ) : null}
      </div>

      {/* 大纲视图：编辑目标（条目 / 分组 / 卷）→ 编辑其正文载体（条目行 / 卷纲行，
          经 `contentId` 绑定；分组容器同走其卷纲行）。常驻挂载以保留编辑器生命周期；未选中时由
          OutlineEditor 渲染空态。 */}
      <div className={`ep-view${module === 'outline' ? ' is-active' : ''}`} data-view="outline">
        <OutlineEditor
          target={outlineTarget}
          onCommitTitle={(resolved, title) => {
            if (resolved.kind === 'entry') {
              onRenameOutlineChapter(resolved.id, title)
            } else {
              // 卷 / 分组均走共享卷通道（写 `title` 名段）。
              onRenameOutlineVolume(resolved.id, title)
            }
          }}
          onCreateVolume={(title) => onCreateVolume({ kind: 'normal', title })}
          bookId={bookId}
          onTrashChanged={onOutlineTrashChanged}
          onRefreshVolumes={onOutlineVolumesRefresh}
          onCreateNonVolumeChapter={onCreateOutlineNonVolumeChapter}
          onCreateGroup={onCreateOutlineGroup}
        />
      </div>

      {/* 剧情视图：选中剧情线 → 编排场景时间轴（纵向）；未选中线时由 PlotTimeline 渲染空态。
          常驻挂载保持选择状态；剧情域仅 CRUD，无拖拽。 */}
      <div className={`ep-view${module === 'plot' ? ' is-active' : ''}`} data-view="plot">
        <PlotTimeline
          line={plotLine}
          scenes={plotScenes}
          activeSceneId={activePlotSceneId}
          onSelectScene={onSelectPlotScene ?? (() => undefined)}
          onAddScene={onAddPlotScene ?? (() => undefined)}
          onUpdateScene={onUpdatePlotScene ?? (() => undefined)}
          onDeleteScene={onDeletePlotScene ?? (() => undefined)}
          bookId={bookId}
          activeTimelineName={activeTimelineName}
          activeTimelineId={activeTimelineId}
          timelineOrigin={timelineOrigin}
          onCreateLine={onCreatePlotLine}
        />
      </div>

      {/* 独立时间线视图：一条主时间线只读线（起点默认元年，按书键回读；卡选中进右栏只读详情）。 */}
      <div className={`ep-view${module === 'timeline' ? ' is-active' : ''}`} data-view="timeline">
        <TimelineView
          bookId={bookId}
          origin={timelineOrigin}
          activeTimelineId={activeTimelineId}
          onCreateTimeline={onCreateTimeline}
          selectedSceneId={timelineSelectedSceneId}
          onSelectScene={onSelectTimelineScene}
        />
      </div>

      {/* 设定档案五域（世界观 / 角色 / 势力 / 境界体系 / 物品功法）：中栏卡片网格，按 module 参数化复用。
          仅活动模块为五域之一时挂载（`dossier` 由页面层按活动模块组装），避免后台空跑。 */}
      {dossier ? (
        <div className="ep-view is-active" data-view={dossier.module}>
          <DossierView key={dossier.module} bundle={dossier} />
        </div>
      ) : null}

      {PLACEHOLDER_MODULES.map((id) => (
        <div key={id} className={`ep-view${module === id ? ' is-active' : ''}`} data-view={id}>
          <div className="editor-scroll">
            <div className="editor-inner is-full">
              <PlaceholderView label={tModule(id)} />
            </div>
          </div>
        </div>
      ))}
    </main>
  )
}

export default EditorPane

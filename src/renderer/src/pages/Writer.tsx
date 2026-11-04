import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/ui'
import { RichTextEditorProvider } from '../components/editor/richTextEditorProvider'
import type { RichTextEditorSlots } from '../components/editor/richTextEditorContext'
import { useActivityBar, useRegisterActivityBar } from '../shell/activityBarContext'
import { useRegisterUnsavedSwitchGuard } from '../shell/unsavedSwitchGuard'
import { useRegisterBeforeCloseFlush } from '../shell/beforeCloseFlush'
import { useRightPaneVisibility } from '../shell/rightPaneVisibility'
import EditorPane from './writer/EditorPane'
import { ConfirmDialog } from './writer/ConfirmDialog'
import RightPane from './writer/RightPane'
import SidePane from './writer/SidePane'
import Splitter from './writer/Splitter'
import { hasSidePane } from './writer/data'
import type { CreateVolumeInput } from './writer/chapters/chapterTree'
import { useChapterStatusBar } from './writer/chapters/useChapterStatusBar'
import { useChapterWorkspace } from './writer/chapters/useChapterWorkspace'
import { useVolumes } from './writer/volumes/useVolumes'
import { useOutlineWorkspace } from './writer/outline/useOutlineWorkspace'
import { usePlotWorkspace } from './writer/plot/usePlotWorkspace'
import { usePlotStatusBar } from './writer/plot/usePlotStatusBar'
import { useTimelineStatusBar } from './writer/timeline/useTimelineStatusBar'
import { useTimelineWorkspace } from './writer/timeline/useTimelineWorkspace'
import { useDossierBundle } from './writer/dossier/useDossierBundle'
import { useForeshadowBundle } from './writer/foreshadow/useForeshadowBundle'
import { usePlotTimelineBundle } from './writer/usePlotTimelineBundle'
import { useFlushAllModules } from './writer/useFlushAllModules'
import { useWriterModuleSwitch } from './writer/useWriterModuleSwitch'
import '../styles/writer.css'

/* 分隔条 clamp 边界与默认宽（宽度仅在本次运行内保留，不落库） */
const SIDE_MIN = 180
const SIDE_MAX = 480
const SIDE_DEFAULT = 280
const RIGHT_MIN = 450
const RIGHT_MAX = 850
/* 右栏默认 550：右栏可见的最小视口 1241px（断点 ≤1240px 隐藏）下，中栏约 303px
   （活动栏固定时），仍高于 .editor-pane 的 280px 下限。默认 550 保证中栏 ≥300px 的
   理论阈值为 550 + 300 + 280 + 16 + 64 + 28 = 1238px（活动栏固定时；悬浮时 1174px），
   断点取 1240px，留 2px 余量。 */
const RIGHT_DEFAULT = 550

export interface WriterProps {
  /**
   * 当前写作的书籍 id（来自路由参数 `/write/:bookId`）。
   * 用于透传给编辑器做实体匹配（entities:match 按书隔离）。
   */
  bookId?: string
}

/**
 * 写作页外壳：三栏布局（左栏章节 / 中栏编辑 / 右栏大纲）+ 两个可拖拽分隔条。
 *
 * - 当前模块由外壳活动栏上下文 `useActivityBar().active` 决定；
 * - 三栏宽度由本页 state 持有（受控内联 `style.width`），切换模块不重置；
 * - 无实体左栏的模块（设定档案四域 / 时间线 / 伏笔 / 灵感）收起左栏并隐藏左分隔条；
 * - 章节树 / 正文接真实数据库（`chapters:*` + `documents:*`，见 `writer/chapters/`）；
 * - 章节页专属：标题栏按钮组（新建卷弹窗 / 保存 / 撤销 / 重做 / 搜索 / 回收站）、
 *   中栏回收站视图（`ChaptersTrashView`）、卷 / 章的创建与 hover 操作（v2）。
 */
export default function Writer({ bookId }: WriterProps) {
  // 声明本页需要外壳活动栏（挂载注册、卸载注销）
  useRegisterActivityBar(true)
  const { active, setActive } = useActivityBar()

  const [sideWidth, setSideWidth] = useState(SIDE_DEFAULT)
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT)
  const sideRef = useRef<HTMLElement | null>(null)
  const rightRef = useRef<HTMLElement | null>(null)

  // 共享卷源：章节 / 大纲两域唯一卷读写入口（两页同源渲染，写后同步可见）。
  // 读章节页可见卷（`normal`+`custom`）；大纲页另经 `useOutlineVolumes` 取（含 `group`、排除 `custom`）。
  const { volumes, createVolume, renameVolume, deleteVolume } = useVolumes(bookId ?? '')

  // 章节域装配（章树 + 选中 / 回收站态 + 章节动作）：集中于 useChapterWorkspace。
  const {
    chapters,
    setStatus,
    trashOpen,
    activeChapterId,
    activeChapter,
    isVolumeFull,
    handleSelectChapter,
    handleCreateChapter,
    handleDeleteChapter,
    handleSetChapterPin,
    handleReorderChapter,
    handleToggleTrash,
    handleRenameChapter,
    handleTrashChanged,
    handleContentChanged
  } = useChapterWorkspace(bookId ?? '')

  // 大纲域装配（条目树 + 大纲卷源 + 选中派生 + 大纲动作）：集中于 useOutlineWorkspace；
  // 卷写入口沿用页面层共享卷源（`renameVolume` / `deleteVolume`）。
  const {
    outlineItems,
    outlineVolumes,
    outlineVolumeRows,
    activeOutlineSelection,
    reloadOutlineVolumes,
    handleOpenOutlineTarget,
    handleOutlineTrashChanged,
    handleRenameOutlineVolume,
    handleDeleteOutlineVolume,
    handleCreateOutlineChapter,
    handleCreateOutlineNonVolumeChapter,
    handleCreateOutlineGroup,
    handleCreateOutlineEntryInGroup,
    handleRenameOutlineItem,
    handleDeleteOutlineChapter,
    handleReorderOutlineChapter
  } = useOutlineWorkspace(bookId ?? '', renameVolume, deleteVolume)

  // 剧情树接库：剧情线 / 场景节点 + 增删改（仅 CRUD，无拖拽）。
  // 装配态（数据 + 选中 + 回调）集中于 usePlotWorkspace，避免页面层堆积。
  // 时间线域装配（多时间线列表 + 选中 + origin）：集中于 useTimelineWorkspace。
  // 必须先于剧情装配，以便把当前选中时间线 id 透传给剧情装配做过滤。
  const timeline = useTimelineWorkspace(bookId ?? '')
  const plot = usePlotWorkspace(bookId ?? '', timeline.activeId)
  // 剧情正文聚焦编辑 → 状态栏右下角排版组（无页宽）；未编辑时不注册，外壳回退全局组。
  usePlotStatusBar(plot.editing)

  // 时间线模块状态栏（卡片尺寸控件 ×4 → 状态栏 right 插槽）：模块级注册，外壳按
  // 当前活动模块选区；时间线页右下角以此**替换**外壳全局排版 / 缩放组（去重见 App.tsx）。
  useTimelineStatusBar()

  // 章节模块状态栏（「第X章 共Y章」→ 状态栏 left 插槽）：位置派生 + 模块级注册
  // 集中于 useChapterStatusBar；外壳按当前活动模块选区（`modules[active] ?? page`），
  // 本页无需再自行判断 active。
  useChapterStatusBar({ volumes, chapters, activeChapterId })

  // 右栏大纲主下拉的「当前正在编辑的卷」：
  // - 章节模块 = 选中章所属卷（自定义卷不在大纲下拉选项中，由面板回退默认优先级）；
  // - 大纲模块 = 选中的正文卷；分组 / 条目不算「卷」，保持面板默认优先级。
  const activeOutlineVolumeId = useMemo<number | null>(() => {
    if (active === 'chapters') return activeChapter?.volumeId ?? null
    if (active === 'outline' && activeOutlineSelection?.kind === 'volume') {
      return activeOutlineSelection.id
    }
    return null
  }, [active, activeChapter, activeOutlineSelection])

  const sideHidden = !hasSidePane(active)

  // 右栏显隐：用户偏好由标题栏切换按钮读写（settings 持久化，Provider 在 App 层），
  // 此处消费——隐藏时右栏 `.rightpane.is-hidden` 宽归零、右分隔条同步隐藏
  // （`Splitter hidden` 复用左栏同款禁用逻辑）。窄窗（≤1240px）下 CSS 媒体查询
  // 会额外强制隐藏，与本偏好叠加（见 rightPaneVisibilityProvider 注释）。
  const { hidden: rightPaneHidden, show: showRightPane } = useRightPaneVisibility()

  /* ---------- 章节页动作（左栏 hover / 标题栏按钮组 / 回收站共享） ---------- */

  // 新建卷（弹窗提交）：章节域与大纲域**共用本入口**（写入主进程 `CreateVolumeInput`）。
  const handleCreateVolume = useCallback(
    (input: CreateVolumeInput): void => {
      void createVolume(input)
    },
    [createVolume]
  )

  // 卷重命名：写 `title` 名段（名段由面板层按卷 kind 归一化后传入）。
  const handleRenameVolume = useCallback(
    (id: number, title: string): void => {
      void renameVolume(id, title)
    },
    [renameVolume]
  )

  const handleDeleteVolume = useCallback(
    (id: number): void => {
      void deleteVolume(id)
    },
    [deleteVolume]
  )

  /* ---------- 剧情页动作（左栏剧情线 / 中栏时间轴 / 右栏编辑器共享） ----------
     剧情装配见 usePlotWorkspace；剧情 / 时间线两处选中回调（更新选中 + 右栏隐藏时
     自动展开）收进 usePlotTimelineBundle，与 dossier 的 useDossierBundle 同款透传包。 ---------- */
  // 解构沿用原名，三栏 props 与行为不变。
  const {
    timelineSelectedSceneId: selectedTimelineSceneId,
    timelineScene,
    onSelectPlotScene: handleSelectPlotScene,
    onSelectTimelineScene: handleSelectTimelineScene
  } = usePlotTimelineBundle(plot, rightPaneHidden, showRightPane)

  /* 时间线切换 / 新建是会改变剧情线过滤集的「跨域切换」：本 hook 之外改 `activeId`
     会让右栏表单按 `key={scene.id}` 重挂、草稿静默丢失，因此统一经剧情守卫包一层
     （有未保存草稿 → 挂起并由右栏两态确认，确认后执行；无改动 → 直接执行）。
     同一时间线早退：`Select` 对当前项、`TimelinePanel` 点当前行都会触发 onChange，
     此时无实际变化，不应弹框。 */
  // 先取出稳定成员再进回调依赖，避免整个 `timeline` / `plot` 装配对象入依赖（每次渲染新引用）。
  const { activeId: activeTimelineId, selectTimeline, createTimeline } = timeline
  const { guardSwitch: guardPlotSwitch } = plot
  const handleSelectTimeline = useCallback(
    (id: string): void => {
      if (id === activeTimelineId) return
      guardPlotSwitch(() => selectTimeline(id))
    },
    [activeTimelineId, selectTimeline, guardPlotSwitch]
  )

  // 新建时间线内部同样 `setActiveId`（隐式切换），入参与返回值语义保持原样：
  // 调用方仅 `void` 调用、不消费返回值，故包装后仍以 void 暴露。
  const handleCreateTimeline = useCallback(
    (name: string, origin?: string): void => {
      guardPlotSwitch(() => {
        void createTimeline(name, origin)
      })
    },
    [guardPlotSwitch, createTimeline]
  )

  // 设定档案四域透传包（仅活动模块为四域之一时非空；选中 + 右栏隐藏时自动展开已收进 hook）。
  const dossierBundle = useDossierBundle(active, bookId ?? '', rightPaneHidden, showRightPane)

  // 伏笔透传包（仅活动模块为伏笔时非空；选中 + 右栏隐藏时自动展开已收进 hook）。
  const foreshadowBundle = useForeshadowBundle(active, bookId ?? '', rightPaneHidden, showRightPane)

  /* ---------- 关闭前统一 flush（外壳调用；主进程生命周期接线在下一步） ----------
     各模块未落库内容统一在此聚合落库：章节 / 大纲由中栏常驻视图经 ref 写入落盘入口，
     剧情用右栏表单的保存入口，设定档案 / 伏笔用各自装配包的 `saveDraft`；任一模块失败
     不阻断其它，整体恒 resolve（见 `useFlushAllModules`）。 */
  const chapterFlushRef = useRef<(() => Promise<void>) | null>(null)
  const outlineFlushRef = useRef<(() => Promise<void>) | null>(null)
  const { flushAll, flushModule } = useFlushAllModules({
    chapterFlushRef,
    outlineFlushRef,
    plotSaveRef: plot.saveRef,
    saveDossierDraft: dossierBundle?.saveDraft ?? null,
    saveForeshadowDraft: foreshadowBundle?.saveDraft ?? null
  })
  useRegisterBeforeCloseFlush(flushAll)

  // 设定档案右栏正文编辑器的聚焦态（真源在本页）：右栏 `DossierBodyEditor` 经通用注册表
  // `useRichTextEditor('dossier').reportEditing` 上报，标题栏动作据此切换「新建 / 工具栏」两态。
  const [dossierEditing, setDossierEditing] = useState(false)

  // 富文本编辑器槽位表：编辑器实例由各域右栏自行注册，此处只提供聚焦态真源与上报入口。
  // 剧情取 `usePlotWorkspace`（状态栏 / 切换守卫同源），设定库取本页 state。
  const richTextEditorSlots = useMemo<RichTextEditorSlots>(
    () => ({
      plot: { editing: plot.editing, onEditingChange: plot.reportEditing },
      dossier: { editing: dossierEditing, onEditingChange: setDossierEditing }
    }),
    [plot.editing, plot.reportEditing, dossierEditing]
  )

  /* ---------- 模块切换未保存守卫（活动栏图标 / 筛选浮层发起） ----------
     外壳经 `useRequestSwitch` 把目标模块交给本页裁决：
     同模块 / 无脏 → 直接切；当前模块（五域 / 剧情 / 伏笔）有脏草稿 → 弹两态确认。
     脏态判定、保存 / 放弃分派与章节 / 大纲切走前强制落库均收进
     `useWriterModuleSwitch`；与右栏域内 `switchPending`（切条目）是两个独立场景。 */
  // 保存失败提示（不切换、脏态保留，可重试）。
  const { show: showSaveFailed, node: saveFailedToast } = useToast()
  const { t: tCommon } = useTranslation('common')
  const { t: tModule } = useTranslation('module')

  const switchGuard = useWriterModuleSwitch({
    active,
    setActive,
    plot,
    dossier: dossierBundle,
    foreshadow: foreshadowBundle,
    flushModule,
    onSaveFailed: () => showSaveFailed(tCommon('saveFailed'))
  })
  useRegisterUnsavedSwitchGuard(switchGuard.handleSwitch)

  return (
    <section className="app-view writer-view is-active" data-view="writer">
      {/* 富文本编辑器共享上下文（通用注册表）：右栏编辑器注册 `editor`，标题栏动作
          （`PlotActivityActions` / `DossierActivityActions`）按槽位读取，供聚焦编辑时
          在标题栏左侧渲染富文本工具栏。 */}
      <RichTextEditorProvider bookId={bookId} slots={richTextEditorSlots}>
        <div className="workspace">
          <SidePane
            bookId={bookId}
            module={active}
            width={sideWidth}
            paneRef={sideRef}
            autoHidden={sideHidden}
            volumes={volumes}
            chapters={chapters}
            activeChapterId={activeChapterId}
            onSelectChapter={handleSelectChapter}
            onCreateChapter={handleCreateChapter}
            onRenameVolume={handleRenameVolume}
            onDeleteVolume={handleDeleteVolume}
            onDeleteChapter={handleDeleteChapter}
            onSetChapterPin={handleSetChapterPin}
            onReorderChapter={handleReorderChapter}
            isVolumeFull={isVolumeFull}
            outlineVolumes={outlineVolumes}
            outlineItems={outlineItems}
            activeOutlineSelection={activeOutlineSelection}
            onOpenOutlineTarget={handleOpenOutlineTarget}
            onRenameOutlineVolume={handleRenameOutlineVolume}
            onDeleteOutlineVolume={handleDeleteOutlineVolume}
            onCreateOutlineChapter={handleCreateOutlineChapter}
            onRenameOutlineItem={handleRenameOutlineItem}
            onDeleteOutlineChapter={handleDeleteOutlineChapter}
            onReorderOutlineChapter={handleReorderOutlineChapter}
            onCreateOutlineEntryInGroup={handleCreateOutlineEntryInGroup}
            plotLines={plot.lines}
            plotScenes={plot.scenes}
            activePlotLineId={plot.activeLineId}
            onSelectPlotLine={plot.selectLine}
            onUpdatePlotLine={plot.updateLine}
            onDeletePlotLine={plot.deleteLine}
            timelineEntries={timeline.list}
            activeTimelineId={timeline.activeId}
            onSelectTimeline={handleSelectTimeline}
          />

          <Splitter
            side="left"
            targetRef={sideRef}
            min={SIDE_MIN}
            max={SIDE_MAX}
            value={sideWidth}
            defaultValue={SIDE_DEFAULT}
            onChange={setSideWidth}
            hidden={sideHidden}
          />

          <EditorPane
            module={active}
            bookId={bookId}
            chapter={activeChapter}
            chapters={chapters}
            volumes={volumes}
            onStatusChange={(id, status) => {
              void setStatus(id, status)
            }}
            onRenameChapter={handleRenameChapter}
            onSelectChapter={handleSelectChapter}
            onContentChanged={handleContentChanged}
            onCreateVolume={handleCreateVolume}
            onToggleTrash={handleToggleTrash}
            trashOpen={trashOpen}
            onTrashChanged={handleTrashChanged}
            outlineSelection={activeOutlineSelection}
            outlineVolumes={outlineVolumes}
            outlineVolumeRows={outlineVolumeRows}
            outlineItems={outlineItems}
            onRenameOutlineChapter={handleRenameOutlineItem}
            onRenameOutlineVolume={handleRenameOutlineVolume}
            onOutlineTrashChanged={handleOutlineTrashChanged}
            onOutlineVolumesRefresh={reloadOutlineVolumes}
            onCreateOutlineNonVolumeChapter={handleCreateOutlineNonVolumeChapter}
            onCreateOutlineGroup={handleCreateOutlineGroup}
            plotLine={plot.activeLine}
            plotScenes={plot.activeScenes}
            activePlotSceneId={plot.activeSceneId}
            onSelectPlotScene={handleSelectPlotScene}
            onAddPlotScene={plot.addScene}
            onUpdatePlotScene={plot.updateScene}
            onDeletePlotScene={plot.deleteScene}
            onCreatePlotLine={plot.createLine}
            timelineSelectedSceneId={selectedTimelineSceneId}
            onSelectTimelineScene={handleSelectTimelineScene}
            timelineOrigin={timeline.origin}
            activeTimelineName={timeline.activeEntry?.name}
            activeTimelineId={timeline.activeId}
            onCreateTimeline={handleCreateTimeline}
            dossier={dossierBundle}
            foreshadow={foreshadowBundle}
            chapterFlushRef={chapterFlushRef}
            outlineFlushRef={outlineFlushRef}
          />

          <Splitter
            side="right"
            targetRef={rightRef}
            min={RIGHT_MIN}
            max={RIGHT_MAX}
            value={rightWidth}
            defaultValue={RIGHT_DEFAULT}
            onChange={setRightWidth}
            hidden={rightPaneHidden}
          />

          <RightPane
            module={active}
            width={rightWidth}
            paneRef={rightRef}
            hidden={rightPaneHidden}
            bookId={bookId}
            chapterId={activeChapterId}
            chapters={chapters}
            volumes={volumes}
            plotLine={plot.activeLine}
            plotScene={plot.activeScene}
            onUpdatePlotScene={plot.updateScene}
            plotDirty={plot.dirty}
            onPlotDirtyChange={plot.reportDirty}
            plotSaveRef={plot.saveRef}
            plotSwitchPending={plot.switchPending}
            plotConfirming={plot.confirming}
            plotDraftResetKey={plot.draftResetKey}
            onResolvePlotSwitch={plot.resolveSwitch}
            outlineVolumes={outlineVolumes}
            outlineItems={outlineItems}
            activeVolumeId={activeOutlineVolumeId}
            plotAllLines={plot.allLines}
            plotScenes={plot.scenes}
            activePlotLineId={plot.activeLineId}
            timelines={timeline.list}
            timelineScene={timelineScene}
            activeTimelineId={timeline.activeId}
            onTimelineOriginChange={timeline.updateOrigin}
            dossier={dossierBundle}
            foreshadow={foreshadowBundle}
          />
        </div>
      </RichTextEditorProvider>

      {/* 模块切换未保存守卫确认框（两态：保存并切换 / 放弃并切换）；Esc / 遮罩 = 放弃并切换。
          与右栏域内 `switchPending`（切条目）是两个独立场景，不合并、不互相干扰。 */}
      <ConfirmDialog
        open={switchGuard.pendingModule !== null}
        title={tCommon('unsavedModuleSwitch.title')}
        message={tCommon('unsavedModuleSwitch.message', {
          module: tModule(active),
          target: tModule(switchGuard.pendingModule ?? active)
        })}
        confirmText={tCommon('unsavedModuleSwitch.saveAndSwitch')}
        cancelText={tCommon('unsavedModuleSwitch.discardAndSwitch')}
        tone="default"
        confirming={switchGuard.confirming}
        onConfirm={switchGuard.saveAndSwitch}
        onClose={switchGuard.discardAndSwitch}
      />
      {saveFailedToast}
    </section>
  )
}

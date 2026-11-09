import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/ui'
import { RichTextEditorProvider } from '../components/editor/richTextEditorProvider'
import type { RichTextEditorSlots } from '../components/editor/richTextEditorContext'
import type { RichTextBodyValue } from '../components/editor/useRichTextBodyEditor'
import { useActivityBar, useRegisterActivityBar } from '../shell/activityBarContext'
import type { WriterModule } from '../shell/activityBarModules'
import { useRegisterUnsavedSwitchGuard } from '../shell/unsavedSwitchGuard'
import { useRegisterBeforeCloseFlush } from '../shell/beforeCloseFlush'
import { useRightPaneVisibility } from '../shell/rightPaneVisibility'
import EditorPane from './writer/EditorPane'
import { ConfirmDialog } from './writer/ConfirmDialog'
import RightPane from './writer/RightPane'
import SidePane from './writer/SidePane'
import WorkspaceLayout from './writer/WorkspaceLayout'
import { hasSidePane } from './writer/data'
import type { ChapterStatus, CreateVolumeInput } from './writer/chapters/chapterTree'
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
import { useInspirationBundle } from './writer/inspiration/useInspirationBundle'
import { usePlotTimelineBundle } from './writer/usePlotTimelineBundle'
import { useFlushAllModules } from './writer/useFlushAllModules'
import { useWriterModuleSwitch } from './writer/useWriterModuleSwitch'
import { useWriterShortcuts } from './writer/useWriterShortcuts'
import '../styles/writer.css'

export interface WriterProps {
  /**
   * 当前写作的书籍 id（来自路由参数 `/write/:bookId`）。
   * 用于透传给编辑器做实体匹配（entities:match 按书隔离）。
   */
  bookId?: string
  /**
   * 启动首屏模块（仅由启动重定向经路由 state 传入）：
   * 挂载后应用一次即丢弃，之后用户切换模块 / 重新进入书籍不受影响。
   */
  initialModule?: WriterModule
}

/**
 * 写作页外壳：三栏布局（左栏章节 / 中栏编辑 / 右栏大纲）+ 两个可拖拽分隔条。
 *
 * - 当前模块由外壳活动栏上下文 `useActivityBar().active` 决定；
 * - 三栏宽度由 `WorkspaceLayout` 持有（拖拽逐帧只重渲染该组件，本页不参与），切换模块不重置；
 * - 无实体左栏的模块（设定档案四域 / 时间线 / 伏笔 / 灵感）收起左栏并隐藏左分隔条；
 * - 章节树 / 正文接真实数据库（`chapters:*` + `documents:*`，见 `writer/chapters/`）；
 * - 章节页专属：标题栏按钮组（新建卷弹窗 / 保存 / 撤销 / 重做 / 搜索 / 回收站）、
 *   中栏回收站视图（`ChaptersTrashView`）、卷 / 章的创建与 hover 操作（v2）。
 */
export default function Writer({ bookId, initialModule }: WriterProps) {
  // 声明本页需要外壳活动栏（挂载注册、卸载注销）
  useRegisterActivityBar(true)
  const { active, setActive } = useActivityBar()

  // 启动首屏模块：消费一次后清空 ref，避免后续重渲染 / 模块切换被改回。
  const initialModuleRef = useRef(initialModule)
  useEffect(() => {
    const target = initialModuleRef.current
    if (!target) return
    initialModuleRef.current = undefined
    setActive(target)
  }, [setActive])

  // 三栏宽度 state 下沉到 `WorkspaceLayout`（拖拽逐帧只重渲染布局壳，本页与三栏子树不参与）；
  // 本页只持有两栏元素引用，供分隔条在按下时实测起始宽。
  const sideRef = useRef<HTMLElement | null>(null)
  const rightRef = useRef<HTMLElement | null>(null)

  // 共享卷源：章节 / 大纲两域唯一卷读写入口（两页同源渲染，写后同步可见）。
  // 读章节页可见卷（`normal`+`custom`）；大纲页另经 `useOutlineVolumes` 取（含 `group`、排除 `custom`）。
  const { volumes, createVolume, renameVolume, deleteVolume, reload } = useVolumes(bookId ?? '')

  // 大纲域装配（条目树 + 大纲卷源 + 选中派生 + 大纲动作）：集中于 useOutlineWorkspace；
  // 卷写入口沿用页面层共享卷源；回收站操作另刷新共享卷列表（`reload`）。
  const {
    outlineItems,
    outlineVolumes,
    outlineVolumeRows,
    activeOutlineSelection,
    reloadOutlineVolumes,
    handleOpenOutlineTarget,
    handleOutlineTrashChanged,
    handleRenameOutlineVolume,
    handleDeleteVolume,
    handleCreateOutlineChapter,
    handleCreateOutlineNonVolumeChapter,
    handleCreateOutlineGroup,
    handleCreateOutlineEntryInGroup,
    handleRenameOutlineItem,
    handleDeleteOutlineChapter,
    handleReorderOutlineChapter
  } = useOutlineWorkspace(bookId ?? '', renameVolume, deleteVolume, reload)

  // 章节域装配（章树 + 选中 / 回收站态 + 章节动作）：集中于 useChapterWorkspace；回收站回调另同步卷池。
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
    handleMoveChapter,
    handleToggleTrash,
    handleRenameChapter,
    handleTrashChanged,
    handleContentChanged
  } = useChapterWorkspace(bookId ?? '', handleOutlineTrashChanged)

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

  // 保存失败提示（不切换 / 删除失败 / 脏态保留，可重试）：多处共用同一条 toast。
  const { show: showSaveFailed, node: saveFailedToast } = useToast()
  const { t: tCommon } = useTranslation('common')
  const { t: tModule } = useTranslation('module')
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

  // 章节状态切换（中栏编辑头两态按钮）：包一层以稳定引用——`memo(EditorPane)` 的浅比较
  // 依赖每个回调 prop 的引用稳定，内联箭头函数会让 memo 在每次页面重渲染（数据刷新、
  // 模块切换等）时失效。
  const handleStatusChange = useCallback(
    (id: number, status: ChapterStatus): void => {
      void setStatus(id, status)
    },
    [setStatus]
  )

  /* ---------- 剧情页动作（左栏剧情线 / 中栏时间轴 / 右栏编辑器共享） ----------
     剧情装配见 usePlotWorkspace；剧情 / 时间线两处选中回调（更新选中 + 右栏隐藏时
     自动展开）收进 usePlotTimelineBundle，与 dossier 的 useDossierBundle 同款透传包。 ---------- */
  const {
    timelineSelection,
    timelineOriginSelected,
    timelineScene,
    onSelectPlotScene: handleSelectPlotScene,
    onSelectTimelineOrigin: handleSelectTimelineOrigin,
    onSelectTimelineScene: handleSelectTimelineScene
  } = usePlotTimelineBundle(plot, timeline.activeId, rightPaneHidden, showRightPane)

  // 设定档案四域透传包（仅活动模块为四域之一时非空；选中 + 右栏隐藏时自动展开已收进 hook）。
  const dossierBundle = useDossierBundle(active, bookId ?? '', rightPaneHidden, showRightPane)

  // 伏笔透传包（仅活动模块为伏笔时非空；选中 + 右栏隐藏时自动展开已收进 hook）。
  const foreshadowBundle = useForeshadowBundle(active, bookId ?? '', rightPaneHidden, showRightPane)

  // 灵感透传包（仅活动模块为灵感时非空；选中 + 右栏隐藏时自动展开已收进 hook）。
  const inspirationBundle = useInspirationBundle(
    active,
    bookId ?? '',
    rightPaneHidden,
    showRightPane
  )

  /* ---------- 关闭前统一 flush（外壳调用） ----------
     各模块未落库内容统一在此聚合落库：章节 / 大纲由中栏常驻视图经 ref 写入落盘入口，
     剧情用右栏表单保存入口，设定档案 / 伏笔 / 灵感用 `saveDraft`；任一失败不阻断其它。 */
  const chapterFlushRef = useRef<(() => Promise<void>) | null>(null)
  const outlineFlushRef = useRef<(() => Promise<void>) | null>(null)
  // 时间线起点描述：右栏选中起点（起点卡挂载）时写入补存入口（关窗前统一 flush）。
  const timelineFlushRef = useRef<(() => Promise<void>) | null>(null)
  const { flushAll, flushModule } = useFlushAllModules({
    chapterFlushRef,
    outlineFlushRef,
    plotSaveRef: plot.saveRef,
    saveDossierDraft: dossierBundle?.saveDraft ?? null,
    saveForeshadowDraft: foreshadowBundle?.saveDraft ?? null,
    saveInspirationDraft: inspirationBundle?.saveDraft ?? null,
    timelineFlushRef
  })
  useRegisterBeforeCloseFlush(flushAll)

  /* 时间线切换 / 新建 / 删除都会改 `activeTimelineId`，右栏起点卡随之重建、未提交草稿丢失：
     故统一「先补存（`flushModule('timeline')`，内部已记日志、失败不阻断）再过剧情守卫」。
     补存必须先于 `setActiveId`——`updateDescription` 按闭包捕获的旧 `activeId` 定位目标条目。 */
  // 先取出稳定成员再进回调依赖，避免整个 `timeline` / `plot` 装配对象入依赖（每次渲染新引用）。
  const {
    activeId: activeTimelineId,
    selectTimeline,
    createTimeline,
    renameTimeline,
    removeTimeline
  } = timeline
  const { guardSwitch: guardPlotSwitch } = plot
  const handleSelectTimeline = useCallback(
    async (id: string): Promise<void> => {
      if (id === activeTimelineId) return
      await flushModule('timeline')
      guardPlotSwitch(() => selectTimeline(id))
    },
    [activeTimelineId, selectTimeline, guardPlotSwitch, flushModule]
  )

  // 新建时间线内部同样 `setActiveId`（隐式切换），入参与返回值语义保持原样：
  // 调用方仅 `void` 调用、不消费返回值，故包装后仍以 void 暴露。
  const handleCreateTimeline = useCallback(
    async (name: string, description?: RichTextBodyValue): Promise<void> => {
      await flushModule('timeline')
      guardPlotSwitch(() => {
        // 弹窗已产出富文本归一值（`text` + `json`），原样落库；缺省为空文档。
        void createTimeline(name, description)
      })
    },
    [guardPlotSwitch, createTimeline, flushModule]
  )

  // 时间线重命名：active 不变，不触发剧情切换守卫；结果交回面板做失败提示。
  const handleRenameTimeline = useCallback(
    (id: string, name: string): Promise<boolean> => renameTimeline(id, name).catch(() => false),
    [renameTimeline]
  )

  // 删除时间线：删当前 active 等同隐式切换（先补存 + 剧情守卫）；删其它条目不影响当前上下文，直接执行。
  const handleDeleteTimeline = useCallback(
    async (id: string): Promise<boolean> => {
      const run = (): Promise<boolean> =>
        removeTimeline(id)
          .catch(() => false)
          .then((ok) => {
            if (!ok) showSaveFailed(tCommon('saveFailed'))
            return ok
          })
      if (id !== activeTimelineId) return run()
      await flushModule('timeline')
      guardPlotSwitch(() => {
        void run()
      })
      return true
    },
    [activeTimelineId, guardPlotSwitch, removeTimeline, showSaveFailed, tCommon, flushModule]
  )

  // 设定档案右栏正文编辑器聚焦态（真源在本页）：右栏 `DossierBodyEditor` 经通用注册表上报。
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
     外壳经 `useRequestSwitch` 把目标模块交给本页裁决：同模块 / 无脏 → 直接切，有脏草稿 → 两态确认。
     脏态判定、保存 / 放弃分派与章节 / 大纲切走前强制落库收进 `useWriterModuleSwitch`。 */
  const switchGuard = useWriterModuleSwitch({
    active,
    setActive,
    plot,
    dossier: dossierBundle,
    foreshadow: foreshadowBundle,
    inspiration: inspirationBundle,
    flushModule,
    onSaveFailed: () => showSaveFailed(tCommon('saveFailed'))
  })
  useRegisterUnsavedSwitchGuard(switchGuard.handleSwitch)

  // 写作页全局快捷键（Ctrl+S 保存当前模块 / Ctrl+F 搜索 · 仅章节 · 大纲 / Ctrl+1..9 切模块）。
  // 应用菜单已移除，菜单加速键不可用，快捷键在此注册；Esc 不接管，仍由弹窗 / 搜索浮窗自理。
  useWriterShortcuts({
    active,
    switchModule: switchGuard.handleSwitch,
    saveModule: flushModule
  })

  return (
    <section className="app-view writer-view is-active" data-view="writer">
      {/* 富文本编辑器共享上下文（通用注册表）：右栏编辑器注册 `editor`，标题栏动作
          （`PlotActivityActions` / `DossierActivityActions`）按槽位读取，供聚焦编辑时
          在标题栏左侧渲染富文本工具栏。 */}
      <RichTextEditorProvider bookId={bookId} slots={richTextEditorSlots}>
        <WorkspaceLayout
          left={
            <SidePane
              bookId={bookId}
              module={active}
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
              onMoveChapter={handleMoveChapter}
              isVolumeFull={isVolumeFull}
              outlineVolumes={outlineVolumes}
              outlineItems={outlineItems}
              activeOutlineSelection={activeOutlineSelection}
              onOpenOutlineTarget={handleOpenOutlineTarget}
              onRenameOutlineVolume={handleRenameOutlineVolume}
              onDeleteOutlineVolume={handleDeleteVolume}
              onCreateOutlineChapter={handleCreateOutlineChapter}
              onRenameOutlineItem={handleRenameOutlineItem}
              onDeleteOutlineChapter={handleDeleteOutlineChapter}
              onReorderOutlineChapter={handleReorderOutlineChapter}
              onCreateOutlineEntryInGroup={handleCreateOutlineEntryInGroup}
              plotLines={plot.lines}
              allPlotLines={plot.allLines}
              plotScenes={plot.scenes}
              activePlotLineId={plot.activeLineId}
              onSelectPlotLine={plot.selectLine}
              onUpdatePlotLine={plot.updateLine}
              onDeletePlotLine={plot.deleteLine}
              timelineEntries={timeline.list}
              activeTimelineId={timeline.activeId}
              onSelectTimeline={handleSelectTimeline}
              onRenameTimeline={handleRenameTimeline}
              onDeleteTimeline={handleDeleteTimeline}
            />
          }
          center={
            <EditorPane
              module={active}
              bookId={bookId}
              chapter={activeChapter}
              chapters={chapters}
              volumes={volumes}
              onStatusChange={handleStatusChange}
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
              timelineOriginSelected={timelineOriginSelected}
              timelineSelection={timelineSelection}
              onSelectTimelineOrigin={handleSelectTimelineOrigin}
              onSelectTimelineScene={handleSelectTimelineScene}
              timelineOrigin={timeline.origin}
              timelineDescriptionJson={timeline.descriptionJson}
              activeTimelineName={timeline.activeEntry?.name}
              activeTimelineId={timeline.activeId}
              onCreateTimeline={handleCreateTimeline}
              dossier={dossierBundle}
              foreshadow={foreshadowBundle}
              inspiration={inspirationBundle}
              chapterFlushRef={chapterFlushRef}
              outlineFlushRef={outlineFlushRef}
            />
          }
          right={
            <RightPane
              module={active}
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
              timelineOriginSelected={timelineOriginSelected}
              activeTimelineId={timeline.activeId}
              onUpdateTimelineDescription={timeline.updateDescription}
              timelineFlushRef={timelineFlushRef}
              dossier={dossierBundle}
              foreshadow={foreshadowBundle}
              inspiration={inspirationBundle}
            />
          }
          leftHidden={sideHidden}
          rightHidden={rightPaneHidden}
          sideRef={sideRef}
          rightRef={rightRef}
        />
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

import { Suspense, lazy, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DiagnosticsGate } from './diagnostics/DiagnosticsGate'
import i18n, { ensureWriterNamespaces } from './i18n'
import { resolveLocale } from './i18n/config'
import { useOnboarding } from './onboarding/useOnboarding'
import Bookshelf from './pages/Bookshelf'
import {
  isWriterDefaultView,
  DEFAULT_DEFAULT_VIEW,
  type DefaultView
} from './pages/settings/defaultView'
import { TimelineCardSizeProvider } from './pages/writer/timeline/TimelineCardSizeProvider'
import { DossierFilterProvider } from './pages/writer/dossier/DossierFilterProvider'
import { InspirationFilterProvider } from './pages/writer/inspiration/InspirationFilterProvider'
import { ActivityBar, ActivityBarProvider } from './shell/activityBar'
import { useActivityBar } from './shell/activityBarContext'
import type { WriterModule } from './shell/activityBarModules'
import { ActivityActionsProvider } from './shell/activityActionsProvider'
import { BeforeCloseFlushBridge } from './shell/beforeCloseFlushBridge'
import { BeforeCloseFlushProvider } from './shell/beforeCloseFlushProvider'
import { ActivityPinnedProvider } from './shell/activityPinnedProvider'
import { useActivityPinned } from './shell/activityPinned'
import { RightPaneVisibilityProvider } from './shell/rightPaneVisibilityProvider'
import StatusBar, { StatusBarProvider } from './shell/statusBar'
import { useResolvedStatusBarSlots } from './shell/statusBarContext'
import { TitleBarActionsProvider } from './shell/titleBarActionsProvider'
import { UnsavedSwitchGuardProvider } from './shell/unsavedSwitchGuardProvider'
import TitleBar from './shell/TitleBar'
import PinButton from './shell/statusBarWidgets/PinButton'
import TypographyControls from './shell/statusBarWidgets/TypographyControls'
import ZoomControls from './shell/statusBarWidgets/ZoomControls'
import { TypographyProvider } from './shell/statusBarWidgets/TypographyProvider'
import { useTitleBarOverlay } from './theme/useTitleBarOverlay'
import './styles/shell.css'
import './styles/shell-activity-filter.css'
import './styles/acrylic.css'

/**
 * 路由级懒加载：欢迎页（仅首启）与写作页（含编辑器 / 剧情 / 档案 / 时间线整域子图）
 * 各自拆成独立 chunk，书架首屏不再解析写作域代码。
 * 书架保持静态导入——它是默认首屏，留在入口 chunk 可省一次 chunk 往返与额外占位帧。
 *
 * Writer 额外先加载**写作域语言包**（`chapters` / `dossier` / `entities` / `outline` /
 * `plot` / `timeline` / `writer` 等只在写作页使用的 ns）：入口语言包仅含 core ns，
 * 若先挂载页面再补资源会闪 key，故此处严格串行——写作域资源 resolve 后再请求页面 chunk。
 * locale 取当前 `i18n.language` 并经 `resolveLocale` 规整，
 * 语言切换后再次进入写作页也能拿到与当前语言一致的资源。
 */
const Welcome = lazy(() => import('./pages/Welcome'))
const Writer = lazy(async () => {
  await ensureWriterNamespaces(resolveLocale(i18n.language))
  return import('./pages/Writer')
})

/**
 * 视口占位：引导状态读取中与路由页懒加载期间共用同一视觉，
 * 两段加载态衔接为同一个空 div，不产生白屏或二次加载态跳变。
 */
function ViewportPlaceholder() {
  return <div className="viewport-placeholder" aria-busy="true" />
}

/**
 * 活动栏插槽：仅当有页面注册需要活动栏时渲染（`visible`），
 * 否则书架 / 欢迎等页面下不出现胶囊与模块栏。
 * `key` 随固定态变化重新挂载：内部 shown 展开状态随之复位（对齐原型
 * setActMode 切换时移除 is-shown 的行为），避免取消固定后残留展开面板。
 */
function ActivityBarSlot() {
  const { visible } = useActivityBar()
  const { pinned } = useActivityPinned()

  return visible ? <ActivityBar key={pinned ? 'pinned' : 'float'} /> : null
}

/**
 * 状态栏右侧小部件：排版胶囊 ×4 + 缩放控件（`.st-right`）。
 *
 * 显示条件对齐原型（仅写作视图显示）：`useLocation` 判断 `/write/` 前缀；
 * 保存状态由 Writer 页经 `useSetStatusBar` 注册 left 插槽，与本节点同排
 * 渲染；图钉按钮已移至状态栏最左（见下方 `statusBarLeading`）。
 *
 * 去重：若当前活动模块已自带右下角插槽（`right`，如时间线页的卡片尺寸控件），
 * 则跳过本全局组，避免出现两组控件 / 页宽残留；未注册模块行为不变。
 *
 * 页宽只作用于中栏版心（章节 / 大纲）；其余模块的右栏正文不吃 `--page-width`
 * 入口，故按模块 id 省略该项，字体 / 行距 / 字距 仍在所有模块照常显示。
 */
function StatusBarWidgets() {
  const { pathname } = useLocation()
  const { active } = useActivityBar()
  const { right } = useResolvedStatusBarSlots(active)

  if (!pathname.startsWith('/write/')) return null
  if (right != null) return null

  // 模块 id 逐字取自 `WRITER_MODULES`；非章节 / 大纲（含无 Provider 回退态）都不显示页宽。
  const showPageWidth = active === 'chapters' || active === 'outline'

  return (
    <div className="st-right">
      <TypographyControls showPage={showPageWidth} />
      <ZoomControls />
    </div>
  )
}

/**
 * 状态栏最左小部件：图钉按钮（仅写作视图显示）。
 * 图钉为写作域通用件（仅 /write/ 渲染，写作页各模块共享；书架与设置弹窗无）。
 * 位于左侧插槽（保存状态）之前，满足「图钉（左）→ 保存状态（其右）」的顺序。
 */
function StatusBarLeading() {
  const { pathname } = useLocation()

  if (!pathname.startsWith('/write/')) return null

  return <PinButton />
}

/**
 * 写作页路由包装：从 `/write/:bookId` 读取书籍 id 并传给 `<Writer />`。
 * 无参数（异常路径）时回退渲染书架，与根路由一致。
 * 启动重定向会随路由 state 传入首屏模块（`chapters` / `outline`），仅本次进入生效；
 * 用户从书架正常打开书籍时不带 state，仍按外壳默认模块（章节）进入。
 */
function WriteRoute() {
  const { bookId } = useParams()
  const { state } = useLocation()
  const startupModule = (state as { startupModule?: WriterModule } | null)?.startupModule
  if (!bookId) return <Bookshelf />
  return <Writer bookId={bookId} initialModule={startupModule} />
}

/**
 * 启动首屏重定向：`defaultView` 为章节 / 大纲时，打开**最近编辑的书**并进入写作页。
 *
 * 仅在启动后首次停留在书架（`/`）时尝试一次（`settledRef`），成功后用 `replace`
 * 换掉当前历史项；用户之后自行返回书架不会被再次强制跳转，不干扰后续导航。
 * 无书可开 / 读取失败时静默留在书架（兜底）。
 */
function StartupViewRedirect({
  defaultView,
  enabled
}: {
  defaultView: DefaultView
  enabled: boolean
}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const settledRef = useRef(false)

  useEffect(() => {
    if (!enabled || !isWriterDefaultView(defaultView) || pathname !== '/') return undefined
    if (settledRef.current) return undefined

    let cancelled = false
    void (async () => {
      try {
        const rows = await window.api?.books.list()
        if (cancelled) return
        settledRef.current = true
        // `updatedAt` 为 'YYYY-MM-DD HH:MM:SS.mmm'，字典序即时间序（同书架「最近编辑」）。
        const latest = [...(rows ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        if (!latest) return
        navigate(`/write/${encodeURIComponent(latest.id)}`, {
          replace: true,
          state: { startupModule: defaultView === 'outline' ? 'outline' : 'chapters' }
        })
      } catch {
        if (!cancelled) settledRef.current = true
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, defaultView, pathname, navigate])

  return null
}

/**
 * 应用根组件：一体式窗口外壳。
 * .titlebar / .app-viewport / .statusbar 共用 .shell 的统一桌面底色
 * （默认光斑渐变；开启 Acrylic 透明效果时切换为四主题纯色 @0.8，透出 DWM 材质）；
 * 页面内容渲染于 .app-viewport。
 * `initialActivityPinned` 由 main.tsx 启动预取（`activityBarPinned`）透传给
 * `ActivityPinnedProvider`，首帧即恢复活动栏固定态、避免闪烁；
 * `initialDefaultView` 同样由启动预取（`defaultView`），仅用于首屏重定向。
 */
export default function App({
  initialActivityPinned,
  initialDefaultView = DEFAULT_DEFAULT_VIEW
}: {
  initialActivityPinned?: boolean
  initialDefaultView?: DefaultView
}) {
  // 主题变化时同步系统标题栏 overlay（非 Electron 环境自动跳过）。
  useTitleBarOverlay()

  // 首次启动引导门控：读取 settings 期间先渲染极简占位，避免欢迎页 / 主内容闪烁。
  const { status, complete } = useOnboarding()

  // 路由判据：仅写作视图（/write/*）渲染最左图钉插槽，并给 `.statusbar`
  // 加 `is-writer` 修饰类驱动差异化内边距（右 8 / 左 20）。注意：不能只靠
  // 「元素对象是否传入」判断——`<StatusBarLeading />` 恒为真值，会导致
  // `.st-leading` 容器在所有页面渲染（空 div 既会误触发 :has 判据，又在
  // 状态栏 gap 下产生多余间距）。
  const { pathname } = useLocation()
  const isWriter = pathname.startsWith('/write/')

  return (
    <StatusBarProvider>
      <TitleBarActionsProvider>
        <ActivityPinnedProvider initialPinned={initialActivityPinned}>
          <RightPaneVisibilityProvider>
            <TypographyProvider>
              {/* 时间线卡片尺寸：Provider 挂在外壳层（状态栏控件在 Writer 之外，
                  需与时间线视图共享同一份尺寸状态；口径同 TypographyProvider）。 */}
              <TimelineCardSizeProvider>
                <ActivityBarProvider>
                  {/* 关闭前统一保存：页面（Writer）注册 flush 处理器，外壳统一保存；
                      主进程拦截窗口 close → 通知 → `BeforeCloseFlushBridge` 落盘 → 回执后关窗。
                      桥必须位于 Provider 内层才能取到 flush 处理器。 */}
                  <BeforeCloseFlushProvider>
                    <BeforeCloseFlushBridge />
                    {/* 模块切换未保存守卫：活动栏图标 / 筛选浮层的「切换模块」经
                        `useRequestSwitch` 交由页面注册的守卫裁决（当前仅设定档案右栏有脏草稿
                        时弹两态确认）；无注册者时降级为直接 setActive。 */}
                    <UnsavedSwitchGuardProvider>
                      {/* 设定档案筛选条件：入口在活动栏、消费在中栏，Provider 挂在两者共同祖先
                        （口径同 TimelineCardSizeProvider）；bookId 由 pathname 解析，唯一真源。 */}
                      <DossierFilterProvider>
                        {/* 灵感筛选条件与已用标签：与设定档案同一范式，入口活动栏浮层、消费中栏网格。 */}
                        <InspirationFilterProvider>
                          <ActivityActionsProvider>
                            <div className="shell">
                              <TitleBar settingsLocked={status !== 'done'} />

                              <ActivityBarSlot />

                              <main className="app-viewport">
                                {/* 启动首屏：按 `defaultView` 跳章节 / 大纲；仅启动时尝试一次。 */}
                                <StartupViewRedirect
                                  defaultView={initialDefaultView}
                                  enabled={status === 'done'}
                                />
                                {status === 'loading' ? (
                                  <ViewportPlaceholder />
                                ) : (
                                  /* 路由页懒加载：只包裹路由出口，标题栏 / 活动栏 / 状态栏外壳
                                     首帧即渲染；fallback 与上面的引导占位同款，衔接无跳变。 */
                                  <Suspense fallback={<ViewportPlaceholder />}>
                                    <Routes>
                                      <Route
                                        path="/"
                                        element={
                                          status === 'required' ? (
                                            <Welcome onFinish={complete} />
                                          ) : (
                                            <Bookshelf />
                                          )
                                        }
                                      />
                                      <Route
                                        path="/write/:bookId"
                                        element={
                                          status === 'required' ? (
                                            <Navigate to="/" replace />
                                          ) : (
                                            <WriteRoute />
                                          )
                                        }
                                      />
                                      {/* 设置已改为标题栏齿轮唤起的弹窗（`SettingsDialog`），
                                      不再占用路由；未匹配路径一律回首页。 */}
                                      <Route path="*" element={<Navigate to="/" replace />} />
                                    </Routes>
                                  </Suspense>
                                )}
                              </main>

                              <StatusBar
                                className={isWriter ? 'is-writer' : undefined}
                                leading={isWriter ? <StatusBarLeading /> : undefined}
                              >
                                <StatusBarWidgets />
                              </StatusBar>
                            </div>
                          </ActivityActionsProvider>
                        </InspirationFilterProvider>
                      </DossierFilterProvider>
                    </UnsavedSwitchGuardProvider>
                  </BeforeCloseFlushProvider>
                  {/* 数据健康自检：启动拉取一次，发现问题即弹 Modal（跨路由恒定，位于 Provider 层内） */}
                  <DiagnosticsGate />
                </ActivityBarProvider>
              </TimelineCardSizeProvider>
            </TypographyProvider>
          </RightPaneVisibilityProvider>
        </ActivityPinnedProvider>
      </TitleBarActionsProvider>
    </StatusBarProvider>
  )
}

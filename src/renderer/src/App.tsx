import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { DiagnosticsGate } from './diagnostics/DiagnosticsGate'
import { useOnboarding } from './onboarding/useOnboarding'
import Bookshelf from './pages/Bookshelf'
import Welcome from './pages/Welcome'
import Writer from './pages/Writer'
import { TimelineCardSizeProvider } from './pages/writer/timeline/TimelineCardSizeProvider'
import { ActivityBar, ActivityBarProvider, useActivityBar } from './shell/activityBar'
import { ActivityActionsProvider } from './shell/activityActions'
import { ActivityPinnedProvider } from './shell/activityPinnedProvider'
import { useActivityPinned } from './shell/activityPinned'
import { RightPaneVisibilityProvider } from './shell/rightPaneVisibilityProvider'
import StatusBar, { StatusBarProvider } from './shell/statusBar'
import { useResolvedStatusBarSlots } from './shell/statusBarContext'
import { TitleBarActionsProvider } from './shell/titleBarActions'
import TitleBar from './shell/TitleBar'
import PinButton from './shell/statusBarWidgets/PinButton'
import TypographyControls from './shell/statusBarWidgets/TypographyControls'
import ZoomControls from './shell/statusBarWidgets/ZoomControls'
import { TypographyProvider } from './shell/statusBarWidgets/TypographyProvider'
import { useTitleBarOverlay } from './theme/useTitleBarOverlay'
import './styles/shell.css'
import './styles/acrylic.css'

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
 */
function StatusBarWidgets() {
  const { pathname } = useLocation()
  const { active } = useActivityBar()
  const { right } = useResolvedStatusBarSlots(active)

  if (!pathname.startsWith('/write/')) return null
  if (right != null) return null

  return (
    <div className="st-right">
      <TypographyControls />
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
 */
function WriteRoute() {
  const { bookId } = useParams()
  if (!bookId) return <Bookshelf />
  return <Writer bookId={bookId} />
}

/**
 * 应用根组件：一体式窗口外壳。
 * .titlebar / .app-viewport / .statusbar 共用 .shell 的统一桌面底色
 * （默认光斑渐变；开启 Acrylic 透明效果时切换为四主题纯色 @0.8，透出 DWM 材质）；
 * 页面内容渲染于 .app-viewport。
 * `initialActivityPinned` 由 main.tsx 启动预取（`activityBarPinned`）透传给
 * `ActivityPinnedProvider`，首帧即恢复活动栏固定态、避免闪烁。
 */
export default function App({ initialActivityPinned }: { initialActivityPinned?: boolean }) {
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
                  <ActivityActionsProvider>
                    <div className="shell">
                      <TitleBar settingsLocked={status !== 'done'} />

                      <ActivityBarSlot />

                      <main className="app-viewport">
                        {status === 'loading' ? (
                          <div className="viewport-placeholder" aria-busy="true" />
                        ) : (
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
                                status === 'required' ? <Navigate to="/" replace /> : <WriteRoute />
                              }
                            />
                            {/* 设置已改为标题栏齿轮唤起的弹窗（`SettingsDialog`），
                                不再占用路由；未匹配路径一律回首页。 */}
                            <Route path="*" element={<Navigate to="/" replace />} />
                          </Routes>
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

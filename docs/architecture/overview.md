# 架构总览

Writer's Forge 是单仓库、三进程层的 Electron 桌面应用：主进程持有窗口与 SQLite，preload 只做 IPC 桥，渲染层用 React 19 构建界面。本文给出全局结构、启动时序与不可越过的边界；数据库、IPC 与窗口的细节分别见 [`database.md`](./database.md)、[`ipc-preload.md`](./ipc-preload.md) 与 [`ui/window.md`](../ui/window.md)。

> 代码是唯一真源。本文论断均带 `文件:行号`；与代码冲突时以代码为准（[`docs/README.md:61`](../README.md)）。

## 1. 技术栈与版本

版本取自 `package.json` 的 `dependencies` / `devDependencies`：

| 依赖 | 版本 | 职责 | 依据 |
| --- | --- | --- | --- |
| Electron | ^44.6.0 | 桌面运行时、主进程与窗口 | `package.json:56` |
| electron-vite | ^5.0.0 | 主进程 / preload / 渲染层三端构建 | `package.json:58` |
| Vite | ^7.3.7 | 渲染层开发服务器与产物构建 | `package.json:67` |
| TypeScript | ^5.9.3 | 全项目类型检查（node / web 双 tsconfig） | `package.json:65` |
| React / React DOM | ^19.3.0 | 渲染层 UI 与挂载 | `package.json:42-43` |
| react-router-dom | ^7.18.4 | 页面路由 | `package.json:46` |
| better-sqlite3 | ^13.0.3 | 本地 SQLite 持久化（同步 API） | `package.json:36` |
| electron-log | ^5.4.4 | 主进程日志、崩溃与 Electron 事件落盘 | `package.json:37` |
| i18next / react-i18next | ^26.4.3 / ^17.0.16 | 国际化（zh-CN / en） | `package.json:38,44` |
| TipTap | ^3.31.4 | 正文与大纲的富文本编辑 | `package.json:27-35` |
| openai | ^7.45.1 | AI 服务商客户端（仅主进程调用） | `package.json:41` |
| electron-builder | ^26.15.3 | 安装包构建 | `package.json:57` |
| ESLint / Prettier | ^10.12.0 / ^3.9.9 | 静态检查与格式化 | `package.json:59,64` |

构建配置在 `electron.vite.config.ts:5-19`：`main` / `preload` 使用 `externalizeDepsPlugin()`（依赖不打包，走 `node_modules`），`renderer` 启用 React 插件并把 `@renderer` 指向 `src/renderer/src`（`electron.vite.config.ts:14-16`）。

主进程产物为 CJS：`package.json` 没有 `"type": "module"`，入口固定 `./out/main/index.js`（`package.json:13`，另见 `AGENTS.md:21`）。better-sqlite3 为 N-API 预编译，跨 Node / Electron ABI 稳定，无需 `electron-rebuild`（`AGENTS.md:84`）。

## 2. 进程模型

三个进程层加一个共享层，职责与信任级别严格分离：

```text
main（Node 环境 · 全权限）
  index.ts 只做装配
  window.ts / windowState / windowMaterial / resizeSnap
  database/ · ipc/ · logger · security · theme
  可直达 fs、SQLite、app.getPath、shell、网络（AI / OneDrive）
        │  ipcMain.handle ⇄ ipcRenderer.invoke（请求 / 响应）
        │  webContents.send → 渲染层事件
        ▼
preload（contextIsolation 隔离）
  组装 api 对象 → exposeInMainWorld('api', api)
  只转发 invoke / on，不把 ipcRenderer 交给页面
        │  window.api
        ▼
renderer（Chromium · React 19）
  main.tsx → Provider 树 → HashRouter → App → pages/
  不直接访问 fs / DB，一律经 window.api
        ▲
        └── src/shared/（纯常量 / 纯函数，主 / 渲染双侧引用）
```

| 层 | 职责 | 边界约束 | 依据 |
| --- | --- | --- | --- |
| main | 应用生命周期、窗口、SQLite、IPC、日志、安全策略、外部网络请求 | 不放界面逻辑；入口只装配 | `src/main/index.ts:11-57` |
| preload | 把 IPC 包装成 `window.api`，隔离渲染层与 Electron 内部对象 | 只暴露白名单方法，不暴露 `ipcRenderer` | `src/preload/index.ts:376-378` |
| renderer | React 界面、路由、主题、i18n | 不直接访问文件系统 / 数据库，一律经 `window.api` | `src/renderer/src/main.tsx:34-39` |
| shared | 主 / 渲染共用常量与纯函数（关系语义码、子类字段、富文本转换） | 无副作用、不依赖 Electron | `src/shared/worldRelationCodes.ts`、`src/shared/richTextDoc.ts` |

preload 的入口是一个 `api` 对象（`src/preload/index.ts:77`），类型经 `export type Api = typeof api`（`src/preload/index.ts:376`）导出，再由 `contextBridge.exposeInMainWorld('api', api)`（`src/preload/index.ts:378`）挂到渲染层。事件订阅不把 `ipcRenderer` 交给页面：例如 `onAccentChange` 内部注册监听并返回取消函数（`src/preload/index.ts:366-372`）。

共享层被两侧真实引用：主进程 `src/main/database/richText.ts:1` 与渲染层 `src/renderer/src/components/editor/useRichTextBodyEditor.ts:5` 都从 `src/shared/richTextDoc.ts` 取转换函数；关系语义码同样双端共用（`src/main/database/worldSemanticCodes.ts:1`、`src/renderer/src/pages/writer/dossier/relationChip.ts:15`）。

## 3. 目录分层

目标结构见 `AGENTS.md:27-50`，当前实际状态如下（均按 2026-10-31 的代码核对）：

```text
src/
  main/                          # 主进程（Node）
    index.ts                     # 仅装配：路径 / 日志 / ready / DB / 诊断 / IPC / 窗口 / 磁吸
    appPaths.ts  logger.ts  security.ts  theme.ts
    window.ts  windowMaterial.ts  windowState.ts  resizeSnap.ts
    database/                    # 连接单例、schema/、迁移、种子、诊断（117 个 .ts）
    ipc/                         # 27 个 .ts，聚合 148 个 handle 通道
  preload/                       # index.ts + api/ + types/ + index.d.ts（22 个文件）
  renderer/
    index.html
    src/
      main.tsx  App.tsx
      pages/                     # bookshelf / settings / welcome / writer 四个域（171 个文件）
      components/                # 通用 UI 与编辑器组件（74 个文件）
      shell/  theme/  i18n/  styles/  lib/  diagnostics/  onboarding/  assets/
  shared/                        # worldRelationCodes / worldSubtypeFields / richTextDoc
```

| 目标分层（`AGENTS.md` §2） | 当前状态 | 依据 |
| --- | --- | --- |
| `main/index.ts` 只做生命周期装配 | 已对齐：入口只串联启动步骤，无业务分支 | `src/main/index.ts:11-57` |
| 窗口管理独立为 `window.ts` | 已建；另拆出尺寸 / 材质 / 磁吸 / 安全四个模块 | `src/main/window.ts:61-138` |
| 数据访问收敛到 `database/` | 已建；`schema/` 下按域拆 DDL，迁移与种子同层 | `src/main/database/index.ts:17-54` |
| IPC 通道收敛到 `ipc/` | 已建；`registerIpc()` 逐个注册 20 个域 | `src/main/ipc/index.ts:29-45` |
| preload 最小暴露 | 已对齐；单一 `api` 对象 | `src/preload/index.ts:378` |
| 渲染层 `pages/` + `components/` | 均已建立；`components/` 不再是预留目录 | `src/renderer/src/App.tsx:130-150` |
| 跨层共享放 `shared/` | 已建 3 个纯模块，双端引用 | `src/shared/worldRelationCodes.ts:1` |

规模基线：渲染层 `src/renderer/src` 下共 331 个 TS/TSX（`.tsx` 171 个、`.ts` 160 个），另 67 个 CSS；`pages/` 共 171 个文件，按域分为 `writer` 140、`settings` 17、`bookshelf` 10、`welcome` 1，另有 `Bookshelf.tsx` / `Welcome.tsx` / `Writer.tsx` 3 个根级页面。主进程根目录 9 个模块，`database/` 117 个 `.ts`，`ipc/` 27 个 `.ts`，preload 22 个文件。

分层原则（`AGENTS.md:54-57`）：一屏 / 一路由一个文件放 `pages/`；跨页面复用 UI 上提到 `components/`；主进程按职责拆模块，入口不堆业务逻辑；preload 只做桥。

## 4. 主进程启动时序

启动顺序由 `src/main/index.ts` 唯一决定，关键是「路径 → 日志 → DB → 诊断 → IPC → 窗口」的依赖链：

```text
configureAppPaths()      src/main/index.ts:11  → appPaths.ts:18-21
        ↓
configureLogger()        src/main/index.ts:15  → logger.ts:41-99
        ↓
app.whenReady()          src/main/index.ts:20
        ↓
Menu.setApplicationMenu(null)   src/main/index.ts:28
        ↓
getDb()                  src/main/index.ts:32  → database/index.ts:60-76
        ↓
runDiagnostics()         src/main/index.ts:41
        ↓
registerIpc(report)      src/main/index.ts:43  → ipc/index.ts:29
        ↓
createMainWindow()       src/main/index.ts:46  → window.ts:61
        ↓
registerResizeSnap(win)  src/main/index.ts:48  → resizeSnap.ts
```

1. **固定应用路径**（`src/main/index.ts:11`）：`configureAppPaths()` 在模块顶层同步执行，必须早于 `app ready` 和任何 `app.getPath('userData')` / `getDb()` 调用（`src/main/index.ts:10`）。
2. **初始化日志**（`src/main/index.ts:15`）：`configureLogger()` 必须在路径固定之后、`getDb()` 之前；它是首个读取 `userData` 的地方（`src/main/logger.ts:37-39`）。
3. **等待 ready**（`src/main/index.ts:20`）：就绪后记录版本、是否打包、平台（`src/main/index.ts:21-25`）。
4. **移除系统菜单**（`src/main/index.ts:28`）：配合自绘标题栏（`src/main/window.ts:86-91`）。
5. **打开数据库**（`src/main/index.ts:32-36`）：`getDb()` 触发建表；失败先记日志再抛出，不带着半初始化状态继续。连接单例与 DDL 装配见 `src/main/database/index.ts:59-76`。
6. **数据健康自检**（`src/main/index.ts:41`）：`runDiagnostics()` 同步执行，结果留在主进程内存，供渲染层经 `diagnostics:get` 拉取；置于窗口创建之前，保证渲染层挂载时报告已就绪、无竞态（`src/main/index.ts:38-40`）。
7. **注册 IPC、创建窗口、挂磁吸**（`src/main/index.ts:43-48`）：`registerIpc()` 注入诊断报告；`createMainWindow()` 内完成尺寸 / 材质恢复、导航守卫、dev / prod 加载分支；`registerResizeSnap()` 默认不启用，由书籍页经 `window:snap:set` 开启（`src/main/resizeSnap.ts:7-14`）。

退出路径：`window-all-closed` 仅在非 macOS 平台调用 `app.quit()`（`src/main/index.ts:59-64`）；数据库关闭挂在 `before-quit`（`src/main/index.ts:66-69`），**不在** `window-all-closed`——因此 macOS 关闭窗口后进程仍存活期间，数据库连接保持打开，只有真正退出才关闭。

## 5. 渲染层启动时序

渲染入口 `src/renderer/src/main.tsx` 用 `bootstrap()` 串起「预取 → i18n → Provider → Router → 引导门控」：

1. **预取设置**（`src/renderer/src/main.tsx:33-48`）：并行读取 `theme`、`windowMaterial`、`locale`、`activityBarPinned` 四个 settings 键（`:34-39`），逐项校验后作为 Provider 初始值（`:40-45`）；读取失败或纯浏览器预览时回退默认值，不阻塞渲染（`:46-48`）。目的是消除浅色 / 背景 / 活动栏态的首帧闪烁（`:21-25`）。
2. **同步初始化 i18n**（`src/renderer/src/main.tsx:51`）：`initI18n(initialLocale)` 在渲染前完成，资源已内联，首帧即目标语言，避免文案闪烁。语言真源为 settings 的 `locale`，缺省经 `navigator.language` 规整并回退 `zh-CN`（`src/renderer/src/i18n/config.ts:9-25`）。
3. **挂载 Provider 树**（`src/renderer/src/main.tsx:54-70`）：`StrictMode → I18nextProvider → LocaleProvider → ThemeProvider → ChipColorProvider → WindowMaterialProvider → HashRouter → App`。初始值全部由第 1 步透传，Provider 内部不再二次拉取。
4. **使用 HashRouter**（`src/renderer/src/main.tsx:61`）：生产环境走 `file://`，`BrowserRouter` 会白屏（`:53`）。
5. **引导门控**（`src/renderer/src/App.tsx:100`）：`useOnboarding()` 读取 `onboardingCompleted` 与 `penName`（`src/renderer/src/onboarding/useOnboarding.ts:31-36`），状态为 `loading | required | done`（`useOnboarding.ts:3-4`）。`loading` 渲染极简占位（`App.tsx:127-128`）；`required` 时根路由渲染 `Welcome`（`App.tsx:134-135`），写作路由重定向回首页（`App.tsx:143-145`）；无 `window.api` 或读取异常一律视为已完成，宁可跳过引导也不卡死（`useOnboarding.ts:16-24,37-39`）。

渲染层不直接读库：所有持久化都经 `window.api.settings.get(...)` 等 preload 方法转 `ipcRenderer.invoke`（`src/renderer/src/main.tsx:35-38`）。

## 6. 安全边界

窗口安全参数集中在 `createMainWindow()` 的 `webPreferences`（`src/main/window.ts:93-98`）：

| 边界 | 现状 | 依据 |
| --- | --- | --- |
| `contextIsolation` | `true`：页面 JS 与 preload 上下文隔离 | `src/main/window.ts:95` |
| `sandbox` | `false`：preload 不受沙箱限制，因此暴露面必须靠白名单约束 | `src/main/window.ts:96` |
| `nodeIntegration` | `false`：渲染层无 `require` / `process` 直通 | `src/main/window.ts:97` |
| 生产 CSP | 9 条指令，经响应头注入，不用 `<meta>` | `src/main/security.ts:30-40,55-69` |
| 导航守卫 | `will-navigate` 只放行应用自身来源 | `src/main/security.ts:80-104` |
| 外链 | 新窗口一律 `deny` 并交给系统浏览器 | `src/main/window.ts:115-119` |
| DevTools | 仅开发模式注册快捷键，生产不暴露入口 | `src/main/window.ts:39-51,128-130` |
| settings 敏感键 | 按前缀过滤，四条通道共用同一判定 | `src/main/ipc/settings.ts:19-24` |

CSP 要点（`src/main/security.ts:30-40`）：`default-src 'self'`、`script-src 'self'`（不放 `unsafe-inline` / `unsafe-eval`）；`style-src` 额外允许 `unsafe-inline`，因为 React 内联样式与 TipTap 运行期写入大量存在（`security.ts:15-17`）；`img-src` 放行 `data:` / `blob:` 及 http(s) 外链图（`security.ts:18-23`）；`connect-src 'self'`，AI 与 OneDrive 的网络请求全在主进程，CSP 不约束主进程（`security.ts:24-26`）。CSP **只在生产**挂载（`src/main/window.ts:132-134`），开发模式跳过以免阻断 HMR 的 ws 与内联脚本（`security.ts:51-53`）。

导航守卫按环境区分来源：开发态比对 dev server 的 `origin`（scheme + host + port），生产态只放行打包入口 `file://…/renderer/index.html`，Windows 路径比较前做 percent-decode 与大小写归一（`src/main/security.ts:90-114`）。

settings 敏感键过滤（`src/main/ipc/settings.ts:8-24`）：`ai:`（加密后的 API Key 与服务商配置）与 `onedrive:credentials:`（safeStorage 凭据）不可读 / 写 / 删 / 枚举；`settings:get` 命中时返回 `null` 而非抛错，避免破坏 `Promise<string | null>` 契约（`settings.ts:28-35`）。`onedrive:clientId` 与 `onedrive:account` 属放行项（`settings.ts:16-17`）。

## 7. 日志与数据目录

### 7.1 数据目录

`configureAppPaths()` 显式 `setPath('userData', …)`，不依赖 `setName` 的隐式推导（`src/main/appPaths.ts:12-21`）：

| 环境 | 目录名 | 依据 |
| --- | --- | --- |
| 打包安装态 | `Writer's Forge` | `src/main/appPaths.ts:9` |
| 本地开发态 | `Writer's Forge Dev` | `src/main/appPaths.ts:9` |

最终 `userData = appData/<目录名>`（`src/main/appPaths.ts:20`）。其下关键文件：

- 数据库：`writers-forge.db`（`src/main/database/index.ts:65`），连接开启 `journal_mode = WAL` 与 `foreign_keys = ON`（`src/main/database/index.ts:73,75`）。
- 日志：`userData/logs/main.log`（`src/main/logger.ts:47,51`）。

开发与正式数据物理隔离，排查问题前先确认目录名。

### 7.2 日志

日志直接复用 electron-log 默认单例（`electron-log/main`，id = `default`），不自建实例——渲染进程转发只带 `logId: 'default'`，只有默认实例能接住（`src/main/logger.ts:3,10-13,102`）。

| 配置项 | 值 | 依据 |
| --- | --- | --- |
| 落盘路径 | `userData/logs/main.log`（显式覆盖 macOS 默认 `~/Library/Logs`） | `src/main/logger.ts:15-16,47-51` |
| 文件级别 | 开发 `debug`，生产 `info` | `src/main/logger.ts:52-53` |
| 单文件上限 | 5 MiB | `src/main/logger.ts:29-30,55` |
| 轮转 | 超出后归档为 `main.old.log`，仅保留 1 份 | `src/main/logger.ts:29,54` |
| 行格式 | 时间戳 + 级别 + 进程标记 + scope + 正文 | `src/main/logger.ts:23-27,56` |
| 控制台 | 开发 `debug`，生产 `warn` | `src/main/logger.ts:58-61` |
| 主→渲染 IPC 传输 | 仅开发开启 | `src/main/logger.ts:63-64` |
| 崩溃捕获 | `errorHandler`（未捕获异常 / Promise 拒绝）+ `eventLogger`（render-process-gone、preload-error 等） | `src/main/logger.ts:70-91` |

`log.initialize()` 注入渲染进程转发用的内置 preload，必须在窗口创建前调用（`src/main/logger.ts:66-68`）。日志初始化时只记录目录名，经 `safePath` 去掉含用户名的绝对路径（`src/main/logger.ts:93-97`）。业务代码通过 `logger.scope('xxx')` 取子 scope，如 `app` / `window` / `security`（`src/main/logger.ts:18`、`src/main/window.ts:14`、`src/main/security.ts:7`）。

## 8. 全局工程约束

以下为硬约束，新增功能与评审均按此执行：

| 约束 | 要求 | 依据 |
| --- | --- | --- |
| 单文件 500 行 | 达到或接近 500 行必须按职责拆分，拆分后不得复制粘贴 | `AGENTS.md:61-64` |
| 文案国际化 | 所有用户可见文本走 `t()`，禁止硬编码中文；新增 ns 须 zh-CN / en 双端注册 | `AGENTS.md:117,120-121` |
| 通用组件 | 同类组件上提共享，差异用 props / 插槽 / CSS 变量表达 | `AGENTS.md:109-113` |
| 教学书种子同步 | 新增功能或不兼容变更必须同步 `seedGuideBook/`，文案与实际交互逐条一致 | `AGENTS.md:97-100` |
| 卡片 hover | 禁用位移 / 缩放，只允许颜色 / 描边 / 阴影，统一边缘光晕 | `AGENTS.md:104-105` |
| 验证方式 | 日常验收只做静态检查与代码审查，完成后不写冒烟测试 | `AGENTS.md:90-93` |

当前 i18n 共 19 个命名空间，由 `zh-CN` 汇总文件登记并作为 key 真源（`src/renderer/src/i18n/locales/zh-CN/index.ts:27-47`）；支持语言固定 `zh-CN` / `en`（`src/renderer/src/i18n/config.ts:12-17`）。

## 9. 延伸阅读

文档索引与推荐阅读顺序维护在 [`docs/README.md:22-57`](../README.md)，本文是「新人入门」路径的第一站。

- 数据层：[`database.md`](./database.md) — 连接单例、schema 装配、迁移、种子与诊断。
- 通信层：[`ipc-preload.md`](./ipc-preload.md) — 148 个 `ipcMain.handle` 通道（分布于 `src/main/ipc/`）与 preload 命名空间。
- 窗口层：[`ui/window.md`](../ui/window.md) — 尺寸持久化、材质、标题栏、宽度磁吸。
- 规范：[`conventions/i18n.md`](../conventions/i18n.md) — 命名空间与双语同步细则。

最后核对：2026-10-31

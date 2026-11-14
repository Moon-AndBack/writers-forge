# 窗口行为（Window）

本文描述主窗口的创建参数、尺寸与持久化、窗口材质（亚克力 / 云母）、自绘标题栏、宽度磁吸与开发态快捷键。
所有数值以源码为准，标注为「文件:行号」。

- 创建与装配：`src/main/window.ts`
- 尺寸与持久化：`src/main/windowState.ts`
- 材质：`src/main/windowMaterial.ts`、`src/renderer/src/theme/windowMaterial.ts`
- 主题明暗：`src/main/theme.ts`、`src/main/ipc/theme.ts`、`src/renderer/src/theme/ThemeProvider.tsx`
- 宽度磁吸：`src/main/resizeSnap.ts`、`src/main/ipc/snap.ts`、`src/renderer/src/pages/bookshelf/useShelfSnap.ts`
- 标题栏 overlay：`src/main/ipc/window.ts`、`src/renderer/src/theme/useTitleBarOverlay.ts`
- 渲染层样式：`styles/material.css`、`styles/statusbar.css`、`styles/shell.css`、`styles/bookshelf.css`

## 1. 窗口创建参数

主窗口由 `createMainWindow()` 创建，`BrowserWindow` 选项集中在 `src/main/window.ts:74-99`。

| 参数                     | 取值                                                                 | 说明                                                                                     | 出处                                      |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| `width` / `height`       | 持久化值，缺省 902 × 764                                             | 外框尺寸，单位 DIP                                                                       | `window.ts:75-76`、`windowState.ts:22-23` |
| `minWidth` / `minHeight` | 902 × 764                                                            | 与默认尺寸相同，窗口不可再缩小                                                           | `window.ts:77-78`                         |
| `backgroundColor`        | 材质生效 `#00000000`；否则 `#f3f3f3`                                 | `#AARRGGBB` 的 alpha 仅在 `transparent: true` 时生效；本项目未开启，材质可见性以实机为准 | `window.ts:165`                           |
| `backgroundMaterial`     | `resolveMaterial()` 结果                                             | `acrylic` / `mica` / `none`                                                              | `window.ts:144,166`                       |
| `icon`                   | 开发态 `build/icon.png`；打包态 `resources/icon.png`                 | 路径由 `app.isPackaged` 分支决定；窗口图标只用 256（Windows 图标尺寸上限，无 4K）        | `window.ts:147-151,159`                   |
| `titleBarStyle`          | `'hidden'`                                                           | 隐藏系统标题栏，渲染层自绘                                                               | `window.ts:86`                            |
| `titleBarOverlay`        | `color: '#00000000'`、`symbolColor: '#5c5c5c'`、`height: 42`         | 仅保留右上角系统按钮（WCO）                                                              | `window.ts:87-91`                         |
| `show`                   | `false`                                                              | 等 `ready-to-show` 再 `show()`，避免白屏闪烁                                             | `window.ts:79,110-113`                    |
| `autoHideMenuBar`        | `true`                                                               | 隐藏菜单栏                                                                               | `window.ts:92`                            |
| `webPreferences`         | `contextIsolation: true`、`sandbox: false`、`nodeIntegration: false` | preload 为 `../preload/index.js`                                                         | `window.ts:93-98`                         |

其他行为：

- 外链交给系统浏览器，应用内禁止新开窗口（`window.ts:116-119`）。
- 导航守卫只放行应用自身来源（`window.ts:126`）。
- 开发态加载 `ELECTRON_RENDERER_URL`；打包态 `loadFile('../renderer/index.html')`（`window.ts:123-135`）。

## 2. 默认尺寸推导

默认尺寸 902 × 764 DIP 是「恰好吃下 4 张书卡 + 1.5 行卡片」的实测结果，推导写在 `windowState.ts:11-21`。

宽度（`windowState.ts:16-17`）：

```
4 × 200（卡宽） + 3 × 18（列间距） + 2 × 14（.bookshelf-view 左右 padding）
+ 2 × 4（.book-grid 左右 padding） + 12（垂直滚动条） = 902
```

高度（`windowState.ts:18-20`）：

```
42（.titlebar） + 36（.statusbar） + 2 × 12（.bookshelf-view 上下 padding）
+ 45.8（.shelf-toolbar） + [2（.book-grid padding-top） + 400（第 1 排卡）
+ 14（行距） + 200（半排）] = 763.8 → 764
```

注意 `minWidth/minHeight` 直接复用了这两个默认值（`window.ts:77-78`），因此**最小尺寸等于默认尺寸**，用户无法把窗口缩到 902 × 764 以下（磁吸目标档低于该值时同样受系统最小值约束）。

## 3. 尺寸持久化

实现见 `registerWindowSizePersistence()`（`windowState.ts:107-133`）。

| 项目        | 取值 / 行为                                                          | 出处                         |
| ----------- | -------------------------------------------------------------------- | ---------------------------- |
| settings 键 | `windowSize`                                                         | `windowState.ts:9`           |
| 存储格式    | `"<宽>x<高>"`，四舍五入取整                                          | `windowState.ts:45,63-65`    |
| 防抖间隔    | 300 ms（`WINDOW_SIZE_SAVE_DELAY`）                                   | `windowState.ts:98,120-123`  |
| 忽略状态    | 最大化 / 全屏 / 最小化时不写库                                       | `windowState.ts:114`         |
| 取值来源    | `getNormalBounds()`，保留恢复态尺寸                                  | `windowState.ts:116`         |
| 关闭补写    | `close` 时清定时器并立即写一次                                       | `windowState.ts:126-132`     |
| 合法范围    | 宽 320–10000、高 240–10000                                           | `windowState.ts:26-29,50-57` |
| 解析规则    | 仅接受 `^\d{1,4}x\d{1,4}$`；null / 空串 / 负数 / 小数 / 越界一律丢弃 | `windowState.ts:42-60`       |

- 启动读取：`readInitialWindowSize()` 有合法值用持久化值，无值 / 非法 / 读库异常回退 902 × 764（`windowState.ts:76-85`）。
- 写库异常只记 `warn`，不影响窗口使用（`windowState.ts:88-95`）。
- 关闭流程中数据库可能已关闭，因此写失败是预期分支，不抛出。

## 4. 材质模型

### 4.1 取值

窗口材质**有三种**（`src/main/windowMaterial.ts:14`）：

| 值        | 含义                                                      |
| --------- | --------------------------------------------------------- |
| `acrylic` | 亚克力：窗口底全透明，透出 DWM 实时模糊的背后内容         |
| `mica`    | 云母：窗口底全透明，透出采样桌面壁纸的 DWM 材质（不模糊） |
| `none`    | 关闭：不透明，回退渲染层光斑渐变                          |

- 默认值：`acrylic`（`windowMaterial.ts:24`；渲染层默认一致，`theme/windowMaterial.ts:17`）。
- settings 键：`windowMaterial`（`windowMaterial.ts:17`、`theme/windowMaterial.ts:10`）。
- 三档均为合法值，**不做旧值迁移**，其余非法值返回 `null`（`windowMaterial.ts:49-52`、`theme/windowMaterial.ts:25-29`）。

### 4.2 系统门槛

- 仅 Windows：`process.platform === 'win32'`（`windowMaterial.ts:66`）。
- 仅 Windows 11 22H2 及以上：build ≥ **22621**（`MATERIAL_MIN_BUILD`，`windowMaterial.ts:36,65-69`）。
- 非 Windows / 低版本一律解析为 `none`（`resolveMaterial`，`windowMaterial.ts:86-89`）。
- 门槛依据是 Electron `setBackgroundMaterial` 的实现限制，`acrylic` 与 `mica` 同一门槛；Win10 原生亚克力不在此 API 暴露范围内（`windowMaterial.ts:27-34`）。

### 4.3 启动应用流程

1. 建窗前读 settings 键并归一化：`readInitialWindowMaterial()`（`windowMaterial.ts:75-84`）。
2. `resolveMaterial()` 结合平台能力算出真实可生效值（`windowMaterial.ts:86-89`）。
3. 由该值决定 `backgroundMaterial` 与 `backgroundColor`：非 `none` 时 `#00000000`，`none` 时 `#f3f3f3`（`window.ts:143-145,162-166`；常量在 `windowMaterial.ts:39,42`）。
4. 渲染层 `main.tsx` 预取同一键、校验后作为 `WindowMaterialProvider` 的 `initialMaterial`，避免异步读取造成闪屏（`src/renderer/src/main.tsx:72-75,100`）。

### 4.4 运行时切换

- IPC `window:setMaterial`：入参经 `normalizeWindowMaterial()` 校验（三档均合法），非法返回 `null`，否则调用 `applyWindowMaterial()` 并返回**实际生效**值（`src/main/ipc/window.ts:62-73`）。
- IPC `window:materialSupported`：返回当前系统是否支持窗口材质，渲染层据此禁用三档选择（`src/main/ipc/window.ts:77`）。
- `applyWindowMaterial()` 内部：`setBackgroundMaterial(effective)` + 同步 `setBackgroundColor()`（`windowMaterial.ts:98-111`）。
- preload 暴露为 `window.api.windowMaterial.set / materialSupported`（`src/preload/index.ts:421-427`）。

### 4.5 渲染层投影

- `WindowMaterialProvider` 计算 `material = setting !== 'none' && supported ? setting : 'none'`，`enabled = material !== 'none'`（`WindowMaterialProvider.tsx:52-53`）。
- 状态写入根元素 `data-material`：写**实际材质名** `acrylic` / `mica` / `none`（`WindowMaterialProvider.tsx:55-57`）。
- `styles/material.css` 依 `data-material` 生效：
  - `[data-material='acrylic'] .shell` 用 `--desk-solid-alpha`（50%）混合纯色底；`[data-material='mica'] .shell` 为 `transparent`，不叠 scrim（`material.css:26-33`）。标题栏与状态栏在云母下同样透明，直接透出云母，不另设底色。
  - `:is([data-material='acrylic'], [data-material='mica']) body` 置透明，否则 body 底会挡住 DWM 材质（`material.css:37-39`）。
- 切换时三件事同步：调主进程、写 `data-material`、经 `settings:set` 持久化（`WindowMaterialProvider.tsx:59-72`）。
- 主进程返回的实际值与请求不一致时（如系统不支持），Provider 回退本地状态（`WindowMaterialProvider.tsx:64-68`）。
- 窗口材质入口：标题栏主题面板与「设置 → 外观与主题」页均提供三档选择，两处共享 `WindowMaterialProvider`，状态天然同步。

### 4.6 失败降级

- 平台不支持：`resolveMaterial` 提前降级 `none`，不会调用无效 API（`windowMaterial.ts:86-89,101`）。
- 调用异常：`setBackgroundMaterial` 抛错时记录 `error` 并返回 `DEFAULT_WINDOW_MATERIAL`（当前为 `acrylic`，见 `windowMaterial.ts:105-109`）；窗口保持上一次底色，属边界现状，正常平台不触发。
- 窗口已销毁：直接返回默认常量（`windowMaterial.ts:99`）。
- 渲染层查询 `materialSupported` 失败视为不支持，三档选择置灰（`WindowMaterialProvider.tsx:36-49`）。

### 4.7 材质明暗与应用主题

DWM 云母 / 亚克力的明暗在 Windows 上由系统主题决定。主进程此前从未设置 `nativeTheme.themeSource`，因此应用选择 light / sage / honey 而 Windows 为深色时，材质仍按深色渲染，浅色界面后像垫了一块深色板。现在主进程按持久化主题设置 `themeSource`（仅 Windows）：

| 应用档位 | `themeSource` | 材质明暗 |
| -------- | ------------- | -------- |
| `system` | `'system'`    | 跟随系统 |
| `light`  | `'light'`     | 浅色     |
| `dark`   | `'dark'`      | 深色     |
| `sage`   | `'light'`     | 浅色     |
| `honey`  | `'light'`     | 浅色     |

- 映射实现在 `themeIdToNativeThemeSource()`（`src/main/theme.ts:98-109`）；sage / honey 没有独立的 DWM 明暗，统一按浅色映射，`system` 原样交给 Electron 跟随系统，不在应用层二次解析。
- **启动**：`src/main/index.ts:65` 在 `getDb()` 之后、`registerIpc()` 与 `createMainWindow()` 之前调用 `applyThemeSource(readInitialThemeId())`，保证窗口创建时第一帧 DWM 明暗已正确。持久化值缺失 / 非法回退 `system`（`theme.ts:112-121`）。
- **运行时**：IPC `theme:apply`（`src/main/ipc/theme.ts:13-18`）经 `isThemeId` 校验，非法返回 `null`；合法时调用 `applyThemeSource()` 并返回 `{ resolvedTheme, shouldUseDarkColors }`。preload 暴露为 `window.api.systemTheme.apply`（`src/preload/index.ts:438-448`）。
- `applyThemeSource()` 仅 Windows 写 `themeSource`；非 Windows 保持系统设置，只返回当前 `shouldUseDarkColors`。赋值前比较当前值，相同则跳过；异常记录 warning 并回退 `'light'`（`theme.ts:131-144`）。
- **切回 `system` 的时序**：`ThemeProvider` 先 `await window.api.systemTheme.apply('system')`，用返回的 `shouldUseDarkColors` 同批校正 `systemDark` 与 `theme`，再走过渡 / `dataset.theme` 提交流程（`ThemeProvider.tsx:96-117`）。原因：`themeSource` 被强制为 light / dark 期间 `matchMedia` 返回覆盖后的值；若按它预解析，从 sage 切回 `system`（OS 深色）会先播放 sage→light 再硬切 dark（先浅后深）。`requestSeq` 丢弃 IPC 往返期间被新选择取代的过期结果。
- `system` 档下系统明暗被动变化仍由 `matchMedia` 的 change 订阅驱动，`resolvedTheme` 变化后直接写 `dataset.theme`（无整屏过渡）；WCO 符号色改为依赖 `resolvedTheme`，系统明暗变化时也会重取 `--text-dim`（`useTitleBarOverlay.ts:46,56`）。
- **实机验证待办**：代码只能保证 `nativeTheme.themeSource` 与 `shouldUseDarkColors` 正确；**DWM 云母是否随 per-window 深色模式指示变色无法由代码证明**，需在 Windows 11 实机切换系统深色与应用 light / sage / honey / dark 验证。若实机只有窗口 frame 变色而云母不变，本方案需重新评估。

## 5. 自绘标题栏与 WCO

- `titleBarStyle: 'hidden'` 隐藏系统标题栏，右上角保留窗口控制按钮（WCO），高度 **42**（`window.ts:86-91`）。
- 初始符号色 `#5c5c5c`；背景保持全透明，让自绘标题栏与 DWM 材质透出（`window.ts:88-89`；`useTitleBarOverlay.ts:5-8`）。
- CSS `.titlebar` 高度同为 42px（`styles/shell.css:86-91`），三处（主进程 overlay / 渲染层常量 / CSS）必须一致。
- 主题切换或系统明暗变化后，由 `useTitleBarOverlay()` 读取 `--text-dim` 作为新的 `symbolColor`，读取失败回退 `#5c5c5c`（`useTitleBarOverlay.ts:11-18,40-57`）。
- 同步延迟一帧（`requestAnimationFrame`），确保取到新主题下的令牌值（`useTitleBarOverlay.ts:47-54`）。
- IPC `window:titlebar:set-overlay` 仅 Windows 生效；非 Windows 直接返回 `false`，参数非法或窗口缺失同样返回 `false`（`src/main/ipc/window.ts:41-58`）。
- preload 暴露为 `window.api.titleBar.setOverlay`（`src/preload/index.ts:341-344`）。

## 6. 宽度磁吸

### 6.1 触发条件

- **仅书架页生效**：`useShelfSnap()` 在书籍页挂载时 `window:snap:set` 上报配置，卸载或卡片数为 0 时 `window:snap:clear`（`useShelfSnap.ts:63-74,129-138`）。
- 其他页面没有配置，主进程在 `will-resize` 中直接旁路（`resizeSnap.ts:166`）。
- `will-resize` 监听按窗口幂等注册，同一窗口不叠加（`resizeSnap.ts:203-216`）。

### 6.2 阈值与决策

| 常量         | 值     | 含义                                   | 出处               |
| ------------ | ------ | -------------------------------------- | ------------------ |
| `SNAP_ENTER` | 12 DIP | 未锁定时，距最近档 ≤ 12 即吸附         | `resizeSnap.ts:44` |
| `SNAP_EXIT`  | 24 DIP | 已锁定时，偏离 > 24 才解锁（滞回防抖） | `resizeSnap.ts:46` |

- 档位宽度：`overhead + N × cardWidth + (N − 1) × columnGap`，取整（`resizeSnap.ts:101-103`）。
- 决策为纯函数 `decideSnap()`：已锁定且未越 EXIT → 维持吸附；越 EXIT → 重新寻档；未锁定且 ≤ ENTER → 锁定；否则自由（`resizeSnap.ts:131-153`）。
- 只有 `N ≤ maxColumns` 的档位参与判定，`maxColumns` 即当前卡片数（`resizeSnap.ts:23,129,140`）。

### 6.3 `will-resize` 拦截

1. 跳过未启用、窗口销毁 / 最大化 / 全屏（`resizeSnap.ts:166-167`）。
2. 跳过 `edge === 'bottom'` 与 `'top'`，只处理横向边缘（`resizeSnap.ts:170`）。
3. 命中吸附时先 `setBounds({ x, width })`，成功后再 `event.preventDefault()`；`setBounds` 抛错则不拦截，让窗口跟随拖动，避免冻住（`resizeSnap.ts:190-200`）。
4. 提议宽度已等于目标且锁定档未变时不重复 `setBounds`（`resizeSnap.ts:180-183`）。
5. 左边缘拖动时右边缘固定，补偿 `x = current.x + current.width − 目标宽`（`resizeSnap.ts:185-188`）。
6. `setBounds` 不会再次触发 `will-resize`（Electron 保证），无递归（`resizeSnap.ts:13`）。

### 6.4 参数上报

- 渲染层从 `.book-grid` 实测：`contentWidth = clientWidth − 左右 padding`，卡宽取首条网格轨道，列距取 `columnGap`（`useShelfSnap.ts:30-51`）。
- `overhead = round(窗口外宽 − contentWidth)`，一次性涵盖窗口边框 + padding + 滚动条（`useShelfSnap.ts:89-95`）。
- 卡宽断点 **640**：宽屏 200、窄屏 160；列距兜底 18（`useShelfSnap.ts:4-11`；`styles/bookshelf.css:119,126,406-415`）。
- 上报键为 `cardWidth|columnGap|overhead|cardCount`，不变则跳过 IPC（`useShelfSnap.ts:97-99`）。

### 6.5 静默期与观察

- 尺寸静默期 **150 ms**（`SETTLE_MS`）：拖拽中布局连续变化，停稳后再上报，避免频繁重置锁定档（`useShelfSnap.ts:11,112-118`）。
- 首帧立即上报一次，保证挂载后吸附即时生效（`useShelfSnap.ts:120-121`）。
- 监听 `ResizeObserver`（网格尺寸）与 `matchMedia('(max-width: 640px)')`（断点切换）（`useShelfSnap.ts:123-127`）。

### 6.6 IPC 通道

| 通道                 | 作用                                     | 出处                         |
| -------------------- | ---------------------------------------- | ---------------------------- |
| `window:snap:set`    | 校验配置并启用吸附                       | `src/main/ipc/snap.ts:19-29` |
| `window:snap:clear`  | 关闭吸附（离开书架页）                   | `src/main/ipc/snap.ts:31-36` |
| `window:snap:status` | 读取当前吸附状态                         | `src/main/ipc/snap.ts:38-41` |
| `window:bounds:get`  | 返回窗口外宽（DIP），供渲染层算 overhead | `src/main/ipc/snap.ts:44-47` |

preload 对应 `window.api.windowSnap`（`src/preload/index.ts:352-361`）。配置校验拒绝 NaN / Infinity / 负值 / 非整数列数（`resizeSnap.ts:71-98`）。

## 7. 高度约束

垂直方向由两段固定 chrome 夹住内容区，二者都是硬编码高度，改动需三处同步（主进程 overlay、CSS、推导注释）：

| 区段                | 高度  | 出处                                     |
| ------------------- | ----- | ---------------------------------------- |
| 标题栏 `.titlebar`  | 42 px | `styles/shell.css:86-91`；`window.ts:90` |
| 状态栏 `.statusbar` | 36 px | `styles/statusbar.css:17-22`             |

- 默认高度 764 已包含 42 + 36（`windowState.ts:18-20`）。
- 最小高度同为 764（`window.ts:78`），因此内容区高度下限 = 764 − 42 − 36 − 页面 padding / 工具条。
- 磁吸只改宽度，不参与高度计算。

## 8. DevTools 快捷键

- **仅开发态注册**：判定依据是 `ELECTRON_RENDERER_URL` 是否存在，打包态不注册，避免暴露入口（`window.ts:121-130`）。
- 支持按键（`window.ts:24-32,39-51`）：
  - 通用：`F12`；
  - Windows / Linux：`Ctrl + Shift + I`；
  - macOS：`Cmd + Option + I`（`meta + alt`，且不带 `control`）。
- 命中后 `preventDefault()`；已打开则关闭，未打开则以 `mode: 'detach'` 打开（`window.ts:44-49`）。

## 9. 常见误区

- **`mica` 是合法材质**。合法值为 `acrylic` / `mica` / `none`；`acrylic` 实时模糊背后内容，`mica` 采样桌面壁纸（不模糊），两者门槛同为 Windows 11 22H2+（`windowMaterial.ts:14,49-52,65-69`）。
- **不要写 `transparent: true`**。材质开启时设置 `backgroundColor: '#00000000'`；但 Electron 文档说明 `#AARRGGBB` 的 alpha 仅在 `transparent: true` 时生效，本项目因它在 Windows 上的副作用（无法缩放、无阴影、Snap / 窗口按钮异常）未开启，因此材质在客户区的实际可见性以实机为准，不依赖 alpha 生效（`window.ts:162-166`）。
- **材质生效时禁止给背景再叠加 `backdrop-filter`**。DWM 已在系统层完成材质处理，渲染层再模糊会二次处理、破坏透明链路并增加掉帧；材质态只允许改底色透明度（见 `material.css:26-34`）。
- **`material.ts` 已改名 `windowMaterial.ts`**（主进程与渲染层各一份），旧路径与旧文档引用均已失效。
- **不存在 `window:material:*` 通道**。实际通道是 `window:setMaterial`、`window:materialSupported`、`window:titlebar:set-overlay`（`src/main/ipc/window.ts:41,62,77`）。
- **渲染层标记是 `data-material`**，不是 `data-window-material`，也不是 `data-theme` 的附属值；三档分别写实际材质名 `acrylic` / `mica` / `none`（`WindowMaterialProvider.tsx:55-57`）。
- **`materialSupported` 只在 Windows 返回 true**，非 Windows 下三档选择必然置灰，属预期行为（`windowMaterial.ts:65-69`）。
- **最小尺寸不是 320 × 240**：320 / 240 只是持久化数据的合法下限；窗口实际最小值为 902 × 764（`windowState.ts:26-27`、`window.ts:77-78`）。
- **磁吸不是全局能力**：离开书架页即 `clear`，其他页面拖动完全自由（`useShelfSnap.ts:129-138`）。

---

最后核对：2026-11-14

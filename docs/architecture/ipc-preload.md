# IPC 与 preload 架构

Writer's Forge 的渲染层不直接接触 Node / Electron 能力：所有数据读写、系统能力调用都经 `ipcRenderer.invoke` 打到主进程，由 `ipcMain.handle` 承接；主进程主动推送只有 6 个事件。preload 用 `contextBridge` 暴露单个 `window.api` 对象，是渲染层唯一的跨进程入口。

- 主进程通道实现：`src/main/ipc/`（33 个文件、4,950 行）
- 聚合注册：`src/main/ipc/index.ts` 的 `registerIpc(report)`
- preload 暴露面：`src/preload/index.ts` + `src/preload/api/`（24 个文件、1,898 行）
- 类型真源：`src/preload/index.d.ts` + `src/preload/types/*.d.ts`

> 口径：代码是唯一真源。本文的通道名、事件名、settings 键名、方法数均与源码逐字核对；与代码冲突时以代码为准。

## 1. 通道命名与前缀规范

### 1.1 三段式结构

通道名一律 `域:资源:动作`（简单 CRUD 可省略资源段，写 `域:动作`）：

| 形态           | 示例                                      | 说明                 |
| -------------- | ----------------------------------------- | -------------------- |
| `域:动作`      | `books:list`、`chapters:purge`            | 单资源域，动作即语义 |
| `域:资源:动作` | `books:cover:get`、`ai:sessions:create`   | 域下挂子资源         |
| `域:资源动词`  | `chapters:listVolumes`、`window:snap:set` | 资源本身就是动作宾语 |

动作词表固定：`list` / `get` / `create` / `update` / `rename` / `delete` / `reorder` / `move` / `setX` / `restore` / `purge` / `purgeAllDeleted` / `ensurePresets`。读通道不写库，写通道必须以动词开头，便于按名审查（例如 `purge*` 是不可恢复的物理删除，`restore*` 只对回收站生效）。

### 1.2 命名细则

- **camelCase 动作**：`chapters:listVolumes`、`ai:config:get`，不用连字符。
- **唯一例外**：`window:titlebar:set-overlay` 保留连字符，属历史遗留；改名会同时破坏 preload 与渲染层，改动需按不兼容变更处理。
- **域前缀不随文件走**：`chapters` 域跨 `chapters.ts` + `chapterSearch.ts`；`window` 域跨 `window.ts` + `snap.ts`；`worldEntity` 域跨 `worldEntities.ts` + `worldRefs.ts` + `worldPowers.ts`。域是逻辑边界，不是文件边界。
- **单复数不统一，逐字沿用**：`chipColors`（复数）、`diagnostics`（复数）、`books`（复数），但 `worldEntity` / `worldSubtype` / `outline` / `plot` / `settings`（单数）。新增通道必须沿用既有前缀，不得"顺手纠正"。
- **preload 命名空间 ≠ 通道前缀**：`titleBar` → `window:titlebar:*`、`windowMaterial` → `window:setMaterial` / `window:acrylicSupported`、`windowSnap` → `window:snap:*`、`systemTheme` → `theme:accent:*`。命名空间表达 UI 概念，通道表达主进程归属。

## 2. 注册装配与文件布局

`registerIpc(diagnosticsReport)` 在 `src/main/index.ts` 的 `app.whenReady()` 内、`createMainWindow()` 之前调用一次，`diagnosticsReport` 是启动自检结果，只由 `diagnostics:get` 只读回传。

```ts
export function registerIpc(diagnosticsReport: DiagnosticsReport): void {
  registerAiIpc()
  // …共 26 个 register 函数
  registerWorldEntitiesIpc() // 内部再调 worldRefs / worldPowers
  registerWorldSubtypesIpc()
}
```

| #   | 注册函数                         | 文件               | handler 数     |
| --- | -------------------------------- | ------------------ | -------------- |
| 1   | `registerAiIpc`                  | `ai.ts`            | 13             |
| 2   | `registerAiCatalogIpc`           | `aiCatalog.ts`     | 4              |
| 3   | `registerAiCompleteIpc`          | `aiComplete.ts`    | 1              |
| 4   | `registerAiCompressionIpc`       | `aiCompression.ts` | 2              |
| 5   | `registerBackupIpc`              | `backup.ts`        | 7              |
| 6   | `registerBooksIpc`               | `books.ts`         | 8              |
| 7   | `registerCategoriesIpc`          | `categories.ts`    | 4              |
| 8   | `registerChaptersIpc`            | `chapters.ts`      | 25             |
| 9   | `registerChapterSearchIpc`       | `chapterSearch.ts` | 3              |
| 10  | `registerChipColorsIpc`          | `chipColors.ts`    | 1              |
| 11  | `registerCleanWordsIpc`          | `cleanWords.ts`    | 7              |
| 12  | `registerDiagnosticsIpc(report)` | `diagnostics.ts`   | 1              |
| 13  | `registerEntitiesIpc`            | `entities.ts`      | 8              |
| 14  | `registerForeshadowsIpc`         | `foreshadows.ts`   | 13             |
| 15  | `registerImagesIpc`              | `images.ts`        | 3              |
| 16  | `registerInspirationsIpc`        | `inspirations.ts`  | 5              |
| 17  | `registerOneDriveIpc`            | `onedrive.ts`      | 7              |
| 18  | `registerOutlineIpc`             | `outline.ts`       | 21             |
| 19  | `registerPlotIpc`                | `plot.ts`          | 11             |
| 20  | `registerSettingsIpc`            | `settings.ts`      | 4              |
| 21  | `registerSnapIpc`                | `snap.ts`          | 4              |
| 22  | `registerStatsIpc`               | `stats.ts`         | 4              |
| 23  | `registerThemeIpc`               | `theme.ts`         | 1              |
| 24  | `registerWindowIpc`              | `window.ts`        | 3              |
| 25  | `registerWorldEntitiesIpc`       | `worldEntities.ts` | 12（另间接 7） |
| 26  | `registerWorldSubtypesIpc`       | `worldSubtypes.ts` | 5              |

33 个文件 = `index.ts` + 上述 26 个注册文件 + `worldRefs.ts` / `worldPowers.ts`（间接注册，见 §9）+ 4 个无通道的辅助模块：

- `aiChat.ts`：在途对话表 `activeChats`、租约 `claimChat`、`abortChat`、`sendStreamEvent`（3 个 `ai:chat:*` 推送的唯一出口）。
- `aiValidate.ts`：AI 域入参校验纯函数集合，零 electron 依赖。
- `docLimit.ts`：单篇正文上限 `MAX_DOC_CHARS = 200_000` 与有效字数计算。
- `worldSubtypeFields.ts`：子类字段白名单与规范化，只被 `worldSubtypes.ts` 调用。

## 3. 185 个 handle 通道总表

实测 `ipcMain.handle` 共 **185** 个（含 `onedrive:backup`、`outline:saveContent`、`worldEntity:list` / `saveText` / `listIncomingRefs` 等跨行书写的 8 个）。按一级前缀（域）分布：

| 域             | 文件                                                            | 数量    |
| -------------- | --------------------------------------------------------------- | ------- |
| `ai`           | `ai.ts` + `aiCatalog.ts` + `aiComplete.ts` + `aiCompression.ts` | 20      |
| `backup`       | `backup.ts`                                                     | 8       |
| `books`        | `books.ts`                                                      | 8       |
| `categories`   | `categories.ts`                                                 | 4       |
| `chapters`     | `chapters.ts` + `chapterSearch.ts`                              | 28      |
| `chipColors`   | `chipColors.ts`                                                 | 1       |
| `cleanWords`   | `cleanWords.ts`                                                 | 7       |
| `diagnostics`  | `diagnostics.ts`                                                | 1       |
| `entities`     | `entities.ts`                                                   | 8       |
| `foreshadow`   | `foreshadows.ts`                                                | 13      |
| `images`       | `images.ts`                                                     | 3       |
| `inspiration`  | `inspirations.ts`                                               | 5       |
| `onedrive`     | `onedrive.ts`                                                   | 7       |
| `outline`      | `outline.ts`                                                    | 21      |
| `plot`         | `plot.ts`                                                       | 11      |
| `settings`     | `settings.ts`                                                   | 4       |
| `stats`        | `stats.ts`                                                      | 4       |
| `theme`        | `theme.ts`                                                      | 1       |
| `window`       | `window.ts` + `snap.ts`                                         | 7       |
| `worldEntity`  | `worldEntities.ts` + `worldRefs.ts` + `worldPowers.ts`          | 19      |
| `worldSubtype` | `worldSubtypes.ts`                                              | 5       |
| **合计**       | 26 个注册文件                                                   | **185** |

### 3.1 AI / 书稿 / 内容类（84）

```text
# ai（20）
ai:config:get · ai:config:set · ai:models:list · ai:test
ai:catalog:get · ai:catalog:limit · ai:catalog:override · ai:catalog:overrides:list
ai:compression:get · ai:compression:set
ai:chat:start · ai:chat:abort · ai:chat:complete
ai:sessions:list · ai:sessions:create · ai:sessions:delete · ai:sessions:rename
ai:sessions:renameIfEmpty
ai:messages:list · ai:messages:append

# books（8）
books:list · books:get · books:create · books:update · books:delete
books:cover:get · books:cover:set · books:cover:delete

# categories（4）
categories:list · categories:create · categories:rename · categories:delete

# chapters（28）—— chapters.ts 25 + chapterSearch.ts 3
chapters:listVolumes · chapters:list · chapters:createVolume · chapters:renameVolume
chapters:deleteVolume · chapters:volumeDeleteImpact · chapters:reorderVolume
chapters:create · chapters:rename · chapters:setPin · chapters:setStatus
chapters:delete · chapters:reorder · chapters:move
chapters:getParagraphs · chapters:saveParagraphs · chapters:stats
chapters:nextVolumeTitle · chapters:nextChapterTitle
chapters:listDeleted · chapters:restore · chapters:restoreVolume
chapters:purge · chapters:purgeVolume · chapters:purgeAllDeleted
chapters:search · chapters:replace · chapters:replaceAll

# outline（21）
outline:listVolumes · outline:list · outline:createVolume · outline:renameVolume
outline:deleteVolume · outline:reorderVolume
outline:create · outline:createGroup · outline:rename · outline:delete
outline:reorder · outline:move
outline:getContent · outline:getVolumeOutline · outline:saveContent
outline:listDeleted · outline:restore · outline:restoreVolume
outline:purge · outline:purgeVolume · outline:purgeAllDeleted

# images（3）
images:create · images:get · images:delete
```

### 3.2 剧情 / 设定库 / 词库类（69）

```text
# plot（11）
plot:listLines · plot:listScenes · plot:createLine · plot:renameLine
plot:updateLine · plot:deleteLine
plot:createScene · plot:updateScene · plot:deleteScene
plot:listSceneEntities · plot:setSceneEntities

# entities（8，旧实体表，保留兼容）
entities:list · entities:get · entities:create · entities:update
entities:delete · entities:match · entities:matchMany · entities:revision

# worldEntity（19）—— worldEntities.ts 12 + worldRefs.ts 6 + worldPowers.ts 1
worldEntity:list · worldEntity:get · worldEntity:create · worldEntity:update
worldEntity:delete · worldEntity:listAliases · worldEntity:setAliases
worldEntity:getText · worldEntity:saveText
worldEntity:listTags · worldEntity:setTags
worldEntity:listRefs · worldEntity:listIncomingRefs · worldEntity:listSemanticCodes
worldEntity:addRef · worldEntity:updateRef · worldEntity:removeRef
worldEntity:listPowerSystems · worldEntity:updatePowerSystem

# worldSubtype（5）
worldSubtype:list · worldSubtype:create · worldSubtype:update
worldSubtype:delete · worldSubtype:ensurePresets

# chipColors（1）
chipColors:list

# foreshadow（13）
foreshadow:list · foreshadow:get · foreshadow:create · foreshadow:update
foreshadow:delete · foreshadow:listByAnchor · foreshadow:listByAnchorHit
foreshadow:listByRecoverAnchor · foreshadow:attachAnchor
foreshadow:clearBodyAnchor · foreshadow:clearOutlineAnchor
foreshadow:clearRecoverAnchor · foreshadow:setAbandoned

# inspiration（5）
inspiration:list · inspiration:tags · inspiration:create
inspiration:update · inspiration:delete

# cleanWords（7）
cleanWords:list · cleanWords:count · cleanWords:active
cleanWords:import · cleanWords:toggle · cleanWords:setCategoryEnabled
cleanWords:delete
```

### 3.3 系统 / 设置 / 统计类（32）

```text
# backup（8）
backup:list · backup:create · backup:restore · backup:restoreFile
backup:export · backup:openFolder · backup:rename · backup:delete

# settings（4）
settings:get · settings:set · settings:all · settings:delete

# stats（4）
stats:totalWords · stats:todayWords · stats:streakDays · stats:bookStatsAll

# diagnostics（1）
diagnostics:get

# onedrive（7）
onedrive:status · onedrive:setClientId · onedrive:signIn
onedrive:cancelSignIn · onedrive:signOut · onedrive:backup · onedrive:cancelBackup

# theme（1）
theme:accent:get

# window（7）—— window.ts 3 + snap.ts 4
window:titlebar:set-overlay · window:setMaterial · window:acrylicSupported
window:snap:set · window:snap:clear · window:snap:status · window:bounds:get
```

## 4. 6 个主→渲染推送事件

主进程主动下发只有以下 6 个事件，全部由 preload 包装成"订阅返回退订函数"，渲染层拿不到 `ipcRenderer`。

| 事件名                 | 载荷                                                                                                 | 订阅方式                                    | 取消订阅               | 发送方                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------- | ------------------------------------ |
| `ai:chat:delta`        | `{ requestId: string, delta: string }`                                                               | `window.api.ai.chat.onStream(cb)`           | 返回值 `()` 调用即退订 | `event.sender.send`（仅发起窗口）    |
| `ai:chat:done`         | `{ requestId: string, usage?: AiUsage }`                                                             | 同上                                        | 同上                   | 同上                                 |
| `ai:chat:error`        | `{ requestId: string, error: AiError }`                                                              | 同上                                        | 同上                   | 同上                                 |
| `onedrive:progress`    | `OneDriveBackupProgress { phase: 'snapshot' \| 'upload' \| 'done', bytesSent, totalBytes, percent }` | `window.api.onedrive.onProgress(cb)`        | 返回值调用即退订       | `event.sender.send`                  |
| `theme:accent:changed` | `string \| null`（`#rrggbb` 或读取失败）                                                             | `window.api.systemTheme.onAccentChange(cb)` | 返回值调用即退订       | `webContents.send`（广播到所有窗口） |
| `app:before-close`     | 无                                                                                                   | `window.api.app.onBeforeClose(cb)`          | 返回值调用即退订       | `webContents.send`（目标主窗口）     |

实现约定（事件订阅同构，改动须保持一致）：

- **单监听器 + Set 分发（`ai` / `onedrive` / `theme`）**：`ipcRenderer.on` 在 preload 模块顶层只注册一次，回调写进 `Set`；`onStream` / `onProgress` 只做 add / delete。若在订阅函数内注册监听，同一事件会被重复触发 N 次，且退订无法回收。
- **`app:before-close` 是关窗握手**：`app.onBeforeClose` 直接注册 / 移除单次监听，不走 Set 分发；渲染层用 `app.notifyCloseReady()`（`ipcRenderer.send('app:close-ready')`）回执，主进程按 sender 精确比对，并有 3 秒超时强制关闭兜底。
- **载荷逐字段复验**：`ai:chat:*` 与 `onedrive:progress` 在 preload 侧再次校验（`readAiError` / `readUsage` / `readProgress`），字段缺失或类型不符直接丢弃，不把脏载荷交给渲染层。
- **分发隔离**：遍历前复制订阅者数组，单个订阅者抛错被 `try/catch` 吞掉，不影响其它订阅者（preload 无日志落盘通道，静默是刻意选择）。
- **生命周期**：AI 在途请求按 `${webContentsId}:${requestId}` 登记在 `aiChat.ts` 的 `activeChats`，窗口 `destroyed` 时统一 abort；`requestId` 复用视为重启，先中止旧请求。`done` / `error` 到达即释放租约，保证渲染层不会永远等不到终态。下发前一律判活，`sender.isDestroyed()` 为真时静默丢弃，避免 `send` 抛错。

## 5. 入参校验与错误契约

### 5.1 校验方式

所有 handler 的事件参数之后一律声明为 `unknown`，先校验再调数据层，渲染层被视为不可信输入源：

- **AI 域集中校验**：`aiValidate.ts` 导出 `isRecord` / `isPositiveInt` / `isTextWithin` / `readOpaqueId` 与 `readConfigPatch` / `readChatStartInput`（服务商判定复用 `main/ai` 的 `isAiProviderId`）；纯函数、零 electron 依赖，便于单测复用。上限：消息 200 条、单条正文 100,000 字符、`requestId` 128 字符且匹配 `/^[A-Za-z0-9._:-]+$/`、模型 id / 标题 200 字符、Base URL 2,048、API Key 8,192、`usageJson` 4,096；`temperature ∈ [0, 2]`，`maxTokens ≤ 1_000_000`。
- **其它域本地判定**：各文件自带 `isPositiveInt` / `isNonEmptyString` / `isOrderIndex` / `isChapterStatus` / `isChapterPin` / `isEntityType` / `isOptionalString`，外加 `parseCreateInput` / `parseUpdatePatch` / `sanitizeLinePatch` 等逐字段解析器。
- **整体拒绝，不做部分写入**：补丁类入参任一字段非法即整包返回 `null`（`readConfigPatch`、`parseUpdatePatch` 皆如此）。
- **渲染层输入拦截 + 主进程兜底**：单篇正文上限 `MAX_DOC_CHARS = 200_000` 只在 `chapters:saveParagraphs` 与 `outline:saveContent` 落库前兜底，超限分别返回 `{ ok: false }` / `false`。

### 5.2 失败表达

| 形态                           | 含义                             | 示例                                                                                                     |
| ------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `null`                         | 单条对象失败 / 未命中 / 入参非法 | `books:get`、`plot:createScene`                                                                          |
| `false`                        | 布尔写失败 / 未命中              | `chapters:delete`、`settings:set`                                                                        |
| `[]`                           | 列表读失败按空列表兜底           | `chapters:list`、`ai:sessions:list`                                                                      |
| 带默认字段的空对象             | 有固定返回形状                   | `chapters:stats` → `{ chapters: 0, words: 0 }`；`chapters:listDeleted` → `{ volumes: [], chapters: [] }` |
| `{ ok: false, error }`         | 可预期业务失败（AI 探测）        | `ai:models:list`、`ai:test`                                                                              |
| `{ ok: false, code, status? }` | 可预期域内失败（OneDrive）       | `onedrive:signIn`、`onedrive:backup`                                                                     |
| reject                         | 编程错误 / 数据库异常            | 见下                                                                                                     |

### 5.3 `runWrite` 两种形态

写操作统一包在 `runWrite` 里记录 debug / error 日志，但收尾行为分两类，**不可混用**：

- **3 参数版（记日志后重抛）**：`chapters.ts`、`entities.ts`、`outline.ts`、`plot.ts`、`worldEntities.ts`、`worldRefs.ts`、`worldPowers.ts`。数据库异常以 reject 形式回到渲染层。
- **4 参数版（返回 fallback）**：`ai.ts`、`cleanWords.ts`、`worldSubtypes.ts`。失败只记日志、返回兜底值，绝不抛异常；`worldSubtypes` 借此把唯一约束冲突（重名）收敛为 `null`。
- **主动抛错只有两处**，理由都是"不能静默假装成功"：`ai:config:set`（入参非法 `TypeError`，写入失败 `Error`）、`ai:chat:start`（入参非法 `TypeError`）。

### 5.4 `AiError` 结构

```ts
interface AiError {
  code:
    | 'network'
    | 'timeout'
    | 'auth'
    | 'rate_limit'
    | 'invalid_request'
    | 'upstream'
    | 'aborted'
    | 'unknown'
  status?: number // 上游 HTTP 状态，无则省略
  message: string // 英文技术描述，不得作为 UI 文案
}
```

`AiError` 只出现在 `ai:models:list` / `ai:test` 的 `{ ok: false, error }` 与 `ai:chat:error` 事件中。跨 IPC 会丢失 `Error` 自定义字段（只剩 `name` / `message`），所以 AI 与 OneDrive 都改为返回结构化对象，`code` 才是渲染层 i18n 映射的唯一依据。`message` 已脱敏，不含密钥与用户正文。日志同样只记键名 / 长度 / 类型（见 `settings:set` 与 `ai:config:set`），不落正文与密钥。

## 6. preload 的 24 个命名空间

`contextBridge.exposeInMainWorld('api', api)` 暴露一个对象，含 24 个命名空间 + `versions` / `ping` 两个非 IPC 成员（静态版本号与 `'pong'`）。`export type Api = typeof api` 让渲染层拿到精确签名。

| 命名空间         | 成员数 | 代表方法                                            | 对应通道前缀                                      |
| ---------------- | ------ | --------------------------------------------------- | ------------------------------------------------- |
| `app`            | 2      | `onBeforeClose` / `notifyCloseReady`                | `app:*`                                           |
| `backup`         | 8      | `list` / `create` / `restore` / `rename`            | `backup:*`                                        |
| `books`          | 9      | `list` / `cover.set` / `statsAll`                   | `books:*`（`statsAll` 复用 `stats:bookStatsAll`） |
| `categories`     | 4      | `list` / `delete`                                   | `categories:*`                                    |
| `chapters`       | 28     | `getParagraphs` / `saveParagraphs` / `replaceAll`   | `chapters:*`                                      |
| `entities`       | 8      | `match` / `matchMany` / `revision`                  | `entities:*`                                      |
| `worldEntity`    | 19     | `list` / `addRef` / `updatePowerSystem`             | `worldEntity:*`                                   |
| `worldSubtype`   | 5      | `list` / `ensurePresets`                            | `worldSubtype:*`                                  |
| `chipColors`     | 1      | `list`                                              | `chipColors:*`                                    |
| `images`         | 3      | `create` / `get`                                    | `images:*`                                        |
| `outline`        | 21     | `getVolumeOutline` / `saveContent`                  | `outline:*`                                       |
| `plot`           | 11     | `listLines` / `setSceneEntities`                    | `plot:*`                                          |
| `foreshadow`     | 13     | `list` / `attachAnchor` / `setAbandoned`            | `foreshadow:*`                                    |
| `inspiration`    | 5      | `list` / `tags` / `create`                          | `inspiration:*`                                   |
| `stats`          | 4      | `totalWords` / `bookStatsAll`                       | `stats:*`                                         |
| `diagnostics`    | 1      | `get`                                               | `diagnostics:*`                                   |
| `settings`       | 4      | `get` / `set` / `remove`                            | `settings:*`（`remove` → `settings:delete`）      |
| `ai`             | 21     | `config.get` / `catalog.override` / `chat.onStream` | `ai:*`                                            |
| `cleanWords`     | 7      | `import` / `toggle` / `setCategoryEnabled`          | `cleanWords:*`                                    |
| `onedrive`       | 8      | `backup` / `onProgress`                             | `onedrive:*`                                      |
| `titleBar`       | 1      | `setOverlay`                                        | `window:titlebar:*`                               |
| `windowMaterial` | 2      | `set` / `acrylicSupported`                          | `window:setMaterial`、`window:acrylicSupported`   |
| `windowSnap`     | 4      | `set` / `clear` / `boundsWidth`                     | `window:snap:*`、`window:bounds:get`              |
| `systemTheme`    | 2      | `getAccentColor` / `onAccentChange`                 | `theme:accent:*`                                  |

合计 **191 个成员** = 186 个 invoke 调用点 + 3 个订阅方法（`ai.chat.onStream`、`onedrive.onProgress`、`systemTheme.onAccentChange`）+ 2 个 `app` 生命周期方法（`onBeforeClose` / `notifyCloseReady`）。调用点比通道多 1，是因为 `stats:bookStatsAll` 同时挂在 `books.statsAll` 与 `stats.bookStatsAll` 两个入口（书架批量取数，避免逐书 N+1）。

- 大域拆文件：`ai` / `cleanWords` / `onedrive` / `worldEntity` / `worldSubtype` / `chipColors` 在 `api/*.ts`，用 `satisfies AiApi` / `satisfies Api['worldEntity']` 做结构校验，签名真源在 `types/*.d.ts`。
- preload 可以**收紧**契约：`cleanWords.import` 把 `source: 'user'` 写死，渲染层无法把词写进 `builtin`；`ai` / `onedrive` 不暴露任何密钥明文或 token。
- 事件订阅一律返回退订函数；组件卸载必须调用，否则 `Set` 持有回调造成泄漏。

## 7. settings 键与敏感策略

`settings` 是通用键值表（string → string），四条通道全部走同一敏感判定 `isSensitiveKey`：

| 通道              | 行为                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `settings:get`    | 键非 string → `null`；敏感键 → `null`（与"未设置"不可区分，保持 `Promise<string \| null>` 契约不 reject） |
| `settings:set`    | 键或值非 string → `false`；敏感键 → `false`；写库异常 → reject                                            |
| `settings:all`    | 遍历全表，剔除敏感键后返回，并记 `hidden` 条数                                                            |
| `settings:delete` | 键非 string → `false`；敏感键 → `false`（清理只由主进程授权流程负责）                                     |

敏感前缀登记在 `src/main/ipc/settings.ts:19`：

```ts
const SENSITIVE_KEY_PREFIXES = ['ai:', 'onedrive:credentials:'] as const
```

- `ai:`：`ai:deepseek:baseUrl` / `ai:deepseek:model` / `ai:deepseek:apiKey`、`ai:opencode:baseUrl` / `ai:opencode:model` / `ai:opencode:token`。密钥由主进程写入加密值，渲染层只能通过 `ai:config:get` 拿掩码视图 `AiConfigView`。
- `onedrive:credentials:`：`onedrive:credentials:v1`（safeStorage 加密的 token 载荷）。
- **明确放行**：`onedrive:clientId`（Azure 公共客户端 ID，设置页可编辑）、`onedrive:account`（展示用邮箱）。新增敏感域必须在此登记，`startsWith` 对完整键等价。

其余非敏感键由渲染层直接读写，代表：`locale`、`theme`、`windowMaterial`、`activityBarPinned`、`rightPaneHidden`、`typography`、`penName`、`onboardingCompleted`、`timeline:list[:bookId]` / `timeline:active[:bookId]`（书级动态键）。教学书重灌守卫键 `chapterData:v132:migrated` 同样存在此表，但只由主进程读写。

## 8. 类型真源链路

类型链路是单向的：主进程数据层 → `types/*.d.ts` 的 `import type` → `Api` 接口 → `window.api`。preload 实现处用 `typeof api` / `satisfies` 反查，任何一侧漏改都会在类型检查暴露。

| 层           | 文件                                                | 职责                                                                  |
| ------------ | --------------------------------------------------- | --------------------------------------------------------------------- |
| 主进程       | `src/main/ipc/<域>.ts`                              | `ipcMain.handle('域:动作', …)` 唯一真源；通道名是字符串字面量         |
| preload 实现 | `src/preload/index.ts` 或 `src/preload/api/<域>.ts` | `ipcRenderer.invoke('域:动作', …)`；大域用 `satisfies` 约束           |
| preload 类型 | `src/preload/types/window.d.ts` 的 `Api`            | 组装全部命名空间签名；新域在 `types/<域>.d.ts` 定义接口后挂到 `Api`   |
| 全局声明     | `src/preload/index.d.ts`                            | 只做 `declare global { interface Window { api: Api } }`，不写业务类型 |
| 渲染层       | `window.api.<ns>.<method>`                          | 类型经 `Api` 推导，禁止自建镜像类型                                   |

### 改通道的三处同步清单

1. **主进程 handler**：在对应 `ipc/<域>.ts` 的 `register*Ipc()` 内新增 `ipcMain.handle('域:动作', …)`，补 `unknown` 入参校验与失败兜底；若是新域，另建文件并在 `ipc/index.ts` 的 `registerIpc` 内加一行（注意别与间接注册重复，见 §9）。
2. **preload 方法**：在 `index.ts` 的 `api` 对象或 `api/<域>.ts` 中加同名方法，参数顺序必须与 handler 的实参顺序一致（`invoke(channel, a, b)` 对应 `(_event, a, b)`），并保持现有返回类型约定。
3. **类型声明**：在 `types/window.d.ts` 的 `Api` 对应命名空间下加签名；新域先建 `types/<域>.d.ts` 再在 `window.d.ts` `import type` 挂载；新增命名空间时同步 `docs/README.md` 的通道计数与本文表格。

验证：`npm run typecheck`（node + web 双端）。通道名字符串目前**没有共享常量**，主进程与 preload 各写一份字面量，改名必须两处同时改——这是本链路唯一的"靠人眼"环节。

## 9. 间接注册：worldRefs / worldPowers

`registerWorldEntitiesIpc()` 在函数末尾自行调用两个子注册器（`src/main/ipc/worldEntities.ts:413-415`）：

```ts
registerWorldRefsIpc() // worldEntity:listRefs / listIncomingRefs / listSemanticCodes / addRef / updateRef / removeRef
registerWorldPowersIpc() // worldEntity:updatePowerSystem
```

`ipc/index.ts` **不再单独注册**这两个文件，这是本文最容易写错的一点：

- 若在 `registerIpc` 里再补 `registerWorldRefsIpc()`，Electron 会抛 `Attempted to register a second handler for 'worldEntity:listRefs'`，应用启动即失败。
- 若删掉 `worldEntities.ts` 末尾这两行，应用能正常启动，但 7 个通道静默消失（引用 6 + 境界体系 1），渲染层表现为 `No handler registered for 'worldEntity:addRef'`。
- 拆分动机是 §3 单文件 500 行上限：三个文件共享 `worldEntity:` 前缀与同一套实体校验，所以"文件拆开、注册入口只有一个"。
- 排查顺序：`worldEntity:*` 通道缺失时，先看 `worldEntities.ts` 末尾两行是否存在，再看 `registerWorldEntitiesIpc` 是否被 `registerIpc` 调用。

同理由此产生的计数陷阱：按文件统计会得到 `worldEntities.ts` 12 + `worldRefs.ts` 6 + `worldPowers.ts` 1 = 19，而 `registerIpc` 只有 20 个函数、22 个注册文件——文件数、注册函数数、通道数三者不相等是正常的。

## 10. 变更与排查速查

新增一个完整通道的最小动作集：

1. 数据层函数就绪（`main/database/` 或 `main/<能力域>/`）。
2. `ipc/<域>.ts` 加 handler：入参 `unknown` → 校验 → `runWrite`（选对 3 / 4 参数版本）→ 返回既定失败形态。
3. `preload` 加方法 + 在 `types/` 补签名（`Api` 与新域接口）。
4. 需要推送时：主进程 `sender.send`，preload 顶层 `ipcRenderer.on` + Set 分发，方法返回退订函数。
5. 敏感键 / 敏感数据不进 `settings` 可枚举范围，不上日志。
6. `npm run typecheck` + `npm run lint`；文档侧同步本文 §3 的计数与 `docs/README.md`。

常见故障对照：

| 现象                                     | 原因                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `No handler registered for 'x:y'`        | handler 未注册、注册函数未被 `registerIpc` 调用，或落在间接注册文件里被漏调 |
| `Attempted to register a second handler` | 同一通道注册两次（典型：worldRefs / worldPowers 被重复注册）                |
| `window.api.x is undefined`              | preload 漏方法或 `contextBridge` 未重建（改 preload 必须重启 dev）          |
| 类型检查报命名空间缺方法                 | `index.ts` 与 `Api` 不同步，或 `satisfies` 约束未满足                       |
| 事件回调触发多次                         | 订阅时注册监听而非复用顶层 Set 分发；或组件卸载未调用退订函数               |

最后核对：2026-11-13

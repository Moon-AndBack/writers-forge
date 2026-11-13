# AI 接入与 OneDrive 备份

Writer's Forge 有两个「离开本机」的集成面：AI 服务商（OpenAI 兼容协议）与 OneDrive（Microsoft Graph）。两者都由主进程独占网络与密钥，渲染层只拿非敏感视图与结构化错误码。

- AI 能力层：`src/main/ai/`（6 文件，1,172 行）
- AI 接入层：`src/main/ipc/ai.ts` + `aiValidate.ts` + `aiChat.ts`
- OneDrive 模块：`src/main/onedrive/`（15 文件，2,756 行）
- OneDrive 接入层：`src/main/ipc/onedrive.ts`
- 持久化：`src/main/database/schema/aiChat.ts`、`src/main/database/aiChat.ts`

> 口径：代码是唯一真源。本文的超时、重试、上限数值均标注出处，改代码时请同步本表；与源码冲突时以源码为准。

## 1. AI 模块分层

```
渲染层（设置页 AI 分区 / 章节右栏 AI 面板）
        │  window.api.ai.*   （ipcRenderer.invoke）
        ▼
src/main/ipc/ai.ts              通道注册 · 超时注入 · 结果整形
        ├── aiValidate.ts      入参校验纯函数（零 electron 依赖）
        ├── aiChat.ts          在途表 activeChats · 中止 · 单向事件下发
        ▼
src/main/ai/index.ts           按 provider 分发 · 生成 requestId · 异常兜底
        ├── config.ts          settings 键 · safeStorage 加解密 · 掩码
        ├── http.ts            OpenAI SDK 客户端 · 超时合并 · 错误归一化
        ├── types.ts           契约类型（AiErrorCode / AiStreamEvent / 适配器接口）
        └── providers/
              ├── deepseek.ts  DeepSeek 官方 API
              └── opencode.ts  OpenCode Go（自定义端点 + 会话头）
```

| 文件                       | 行数 | 职责                                                              |
| -------------------------- | ---- | ----------------------------------------------------------------- |
| `ai/config.ts`             | 244  | settings 键集中定义、读写配置、`safeStorage` 加解密、`maskSecret` |
| `ai/http.ts`               | 214  | 创建 SDK 客户端、超时下限、`AbortSignal` 合并、异常 → `AiError`   |
| `ai/types.ts`              | 153  | 服务商 id、错误码、流式事件、适配器接口（不依赖 electron）        |
| `ai/index.ts`              | 81   | `listModels` / `streamChat` 聚合，按 id 取适配器                  |
| `ai/providers/deepseek.ts` | 160  | 模型列表 + 流式对话（标准 OpenAI 兼容）                           |
| `ai/providers/opencode.ts` | 320  | 双前缀端点、`x-opencode-session`、上游错误分诊                    |

调用链只有一条：`ipc/ai.ts → ai/index.ts → providers/* → ai/http.ts → SDK / fetch`。适配器不读 settings、不碰 IPC；`index.ts` 不碰密钥明文；密钥只在 `config.ts` 解密后经 `AiProviderConnection` 传给 `http.ts`。

## 2. 配置与密钥

配置全部落在 `settings` 表（`ai/config.ts:29-37` 的 `AI_KEYS`）：

| 键                    | 内容                                    | 存储形态                        |
| --------------------- | --------------------------------------- | ------------------------------- |
| `ai:provider`         | 当前服务商 id                           | 明文（`deepseek` / `opencode`） |
| `ai:deepseek:baseUrl` | 默认 `https://api.deepseek.com/v1`      | 明文                            |
| `ai:deepseek:model`   | 模型 ID（空 = 未选）                    | 明文                            |
| `ai:deepseek:apiKey`  | API Key                                 | `safeStorage` 密文，base64 落库 |
| `ai:opencode:baseUrl` | 默认 `https://opencode.ai/inference/go` | 明文                            |
| `ai:opencode:model`   | 模型 ID                                 | 明文                            |
| `ai:opencode:token`   | Personal API Key                        | `safeStorage` 密文，base64 落库 |

**id 与展示名分离**：持久化与 IPC 里只有 `'deepseek' | 'opencode'`（`ai/types.ts:11`，`isAiProviderId` 做运行时判定）。展示名只存在于渲染层文案：`ai.provider.deepseek` = `DeepSeek`、`ai.provider.opencode` = `OpenCode Go`。**id 不可改**——已落库的 `ai:provider` 与 `ai_chat_sessions.provider` 都按 id 存值，改名等于数据迁移。

密钥处理规则：

- 写入：`setAiConfig` 先 `trim()`，空串等价于删除（`ai/config.ts:209-213`）；加密不可用时**拒绝保存**并返回 `apiKeyError: 'encryption_unavailable'`，绝不落明文（`ai/config.ts:214-219`）。
- 读取：`getApiKey()` 仅在主进程内部可用，解密失败 / 环境不支持一律返回 `null`，不抛出、不打明文日志（`ai/config.ts:125-138`）。
- 展示：`getAiConfig()` 只给 `hasKey` + `keyMasked` + `encryptionAvailable`；掩码为「前 3 位 + `****` + 后 4 位」，不足 8 位全掩码（`ai/config.ts:115-118`）；渲染层也无法经 `settings:*` 读写 `ai:` 前缀（见 §9）。

## 3. 请求链路

### 3.1 模型列表刷新

`ai:models:list({ provider })` → `listModels(provider, { timeoutMs: 15_000 })`（`ipc/ai.ts:42`、`117`）。列表动态拉取、不缓存、不硬编码模型名。

- DeepSeek：`client.models.list()`，即 `{baseUrl}/models`（`providers/deepseek.ts:56`）。
- OpenCode Go：**不用** SDK，走原生 `fetch` 打 `{baseUrl}/v1/models`（`providers/opencode.ts:158`），因为模型列表与对话是两套前缀（`/v1` vs `/openai/v1`）。请求带 `User-Agent: Writer's Forge/<version>`，且**仅在已配置 token 时**附 `Authorization`（无效 token 会把 200 变成 401，`providers/opencode.ts:155-156`）。

失败不抛异常，返回 `{ ok: false, error: AiError }`（`ipc/ai.ts:120-124`）；入参非法返回 `invalid_request` 且不触网。

### 3.2 连通性测试

`ai:test({ provider })` 复用同一个 `listModels`（同样 15s 上限），只测量耗时：成功返回 `{ ok: true, latencyMs }`，失败返回 `{ ok: false, latencyMs, error }`（`ipc/ai.ts:127-149`）。不会发送任何用户正文。

### 3.3 流式对话

```
ai:chat:start(input)
  → readChatStartInput   校验 requestId / messages / sessionId / temperature / maxTokens
  → claimChat            同 sender 复用同一 requestId 视为「重启」：先 abort 旧请求
  → streamChat           index.ts 生成 requestId（缺省），异常统一转 error 事件
  → provider.streamChat  发 delta… → done；失败只发一条 error
  → ai:chat:delta / ai:chat:done / ai:chat:error  （event.sender.send 单向下发）
```

要点：

- 通道返回 `void`，结果全走事件；`sendStreamEvent` 在 `sender.isDestroyed()` 时静默丢弃（`ipc/aiChat.ts:110-112`）。
- 入参上限（`ipc/aiValidate.ts`）：消息 ≤ 200 条、单条正文 ≤ 100,000 字符、`requestId` ≤ 128 字符且限 `[A-Za-z0-9._:-]`、`temperature` ∈ [0, 2]、`maxTokens` ≤ 1,000,000、`bookId`/`model` ≤ 200 字符。
- `usage` 来自 `stream_options.include_usage`，snake_case 转 camelCase 后随 `done` 下发（两个适配器同构）。
- OpenCode Go 必须带稳定的 `x-opencode-session`：调用方传 `String(ai_chat_sessions.id)`；缺省时适配器生成一次性 UUID（`providers/opencode.ts:261-272`）。缺失该头上游返回 400 `MissingSessionID`。
- 对话端点：DeepSeek `{baseUrl}/chat/completions`；OpenCode `{baseUrl}/openai/v1/chat/completions`（`CHAT_BASE_PATH`）。

### 3.4 中止

- 渲染层 `ai:chat:abort({ requestId })` → `abortChat(sender.id, requestId)`，命中则 `abort()` 并从表内删除、返回 `true`，否则 `false`（`ipc/aiChat.ts:70-79`）。
- 在途表键为 `${senderId}:${requestId}`，多窗口同 id 不会互相覆盖；窗口 `destroyed` 时一次性清理该 sender 名下全部请求（`ipc/aiChat.ts:82-107`）。
- 渲染层先摘掉在途引用再 abort，因此迟到的 `aborted` 事件会被 `requestId` 过滤，不会把错误画进气泡（`useAiConversation.ts:127-142`）；协议层表现为 `APIUserAbortError` / `AbortError` → 归一化为 `aborted`。

### 3.5 超时与重试（实测值）

| 场景                  | 超时                                | 重试                        | 出处                       |
| --------------------- | ----------------------------------- | --------------------------- | -------------------------- |
| 模型列表 / 连通性测试 | **15 s**（`PROBE_TIMEOUT_MS`）      | 无                          | `ipc/ai.ts:42`             |
| 流式对话（默认）      | **60 s**（`AI_DEFAULT_TIMEOUT_MS`） | **0 次**（`maxRetries: 0`） | `ai/http.ts:21`、`209`     |
| 超时下限              | **1 s**（`MIN_TIMEOUT_MS`）         | —                           | `ai/http.ts:24`、`112-115` |

两个细节必须按代码理解：

1. **显式关闭 SDK 自动重试**。注释写明原因：默认 2 次重试会把 60 s 超时放大成数分钟（`ai/http.ts:15`）。
2. 超时由 `createRequestSignal` 的本地定时器与外部 signal 合并，**定时器在整段流式期间不重置**（`ai/http.ts:143-147`）；即一次对话的完整输出共享 60 s 预算，到点即 abort 并归一化为 `timeout`。

## 4. 错误契约

`AiError { code, status?, message }`（`ai/types.ts:52-59`）是跨进程唯一错误形状。上游响应体、请求头、密钥一律不进错误对象。

`AiErrorCode` 共 **14 个**（`ai/types.ts:35-49`）。状态码 → code 的通用映射只有一处真源 `codeFromStatus`（`ai/http.ts:66-75`），OpenCode 的原生 fetch 分支复用 `aiErrorFromStatus`（`ai/http.ts:83-85`）；opencode 适配器在回退通用映射前，先按状态码 + 响应关键字做上游分诊（`providers/opencode.ts:97-114`）。

| code                 | 触发条件                                                                             | 用户可见文案（zh-CN 摘要）                                         |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `network`            | `APIConnectionError`、`TypeError`（fetch 连接失败）                                  | 网络错误，请检查网络连接或 Base URL                                |
| `timeout`            | 本地定时器触发、408、`APIConnectionTimeoutError`、原生 `TimeoutError`                | 请求超时，请稍后重试                                               |
| `auth`               | **历史兼容值**，当前通用映射与 opencode 分诊都不再产生                               | 鉴权失败，请检查 API Key（仅存量）                                 |
| `rate_limit`         | 429（`codeFromStatus`）                                                              | 请求过于频繁，请稍后重试                                           |
| `invalid_request`    | 其余 4xx（401/402/403/408/429 之外）、空消息、未选模型、Base URL 为空、未知 provider | 请求参数有误，请检查 Base URL 与模型 ID                            |
| `upstream`           | ≥ 500、无 status 的 `APIError`（按 500 处理）、非 4xx 的其余状态                     | 服务商返回错误，请稍后重试                                         |
| `aborted`            | `APIUserAbortError`、`AbortError`、本地取消                                          | 请求已取消                                                         |
| `unknown`            | 其余异常                                                                             | 未知错误，请稍后重试                                               |
| `plan_restricted`    | **仅 opencode**：403（档位 / 套餐不支持所选模型）                                    | 当前档位不支持该模型，请更换模型或升级档位                         |
| `session_missing`    | **仅 opencode**：400 且响应含 `MissingSessionID`                                     | 会话标识缺失，请重新打开对话后重试                                 |
| `auth_missing`       | 401 且上游提示缺少凭据 / 本地无 Key（`createAiClient` 直接抛）                       | 尚未配置 API Key                                                   |
| `auth_invalid`       | 401 的其余情况（凭据无效 / 过期，opencode 明确报 `Invalid credential` 亦然）         | API Key 无效或已过期，请重新填写                                   |
| `forbidden`          | **通用 403**（地区 / 账号权限限制；DeepSeek 等走 SDK 通用映射的路径）                | 无权访问该模型（地区限制或账号权限不足），请更换模型或检查账号权限 |
| `insufficient_quota` | 402（如 DeepSeek 余额不足）                                                          | 账户余额不足，请充值后重试                                         |

四类容易混淆的边界，按代码口径固定如下：

- `auth` 为历史粗粒度值（`ai/types.ts:28`）：union、`ERROR_MESSAGES`、preload 白名单与 i18n 中仍保留，但通用映射（`codeFromStatus`）与 opencode 分诊都不会再产出，新代码一律用细分值。
- `plan_restricted` 是 **opencode 档位语义**：opencode 的 403 专指「所选模型不在当前档位可用范围」（`providers/opencode.ts:110-112`）；`forbidden` 才是通用 403（地区 / 账号权限）。
- `insufficient_quota` 对应 **402**：余额 / 配额不足，充值前重试无意义（与可重试的 `rate_limit`（429）刻意分开）。
- 401 的三态已被拆开：`auth_missing`（未配置凭据）/ `auth_invalid`（凭据无效）/ `session_missing`（opencode 缺会话头，实为 400），不再靠单一 `auth` 笼统提示。

**为什么 message 不渲染**：`message` 是**英文技术串**，仅供日志与诊断。`createAiError` 取自 `ERROR_MESSAGES`（`ai/http.ts:42-57`，完整覆盖 14 个 code），opencode 分诊用固定英文描述（`providers/opencode.ts:49-52`，不含上游原文，避免泄漏响应体）；类型注释亦明确「UI 禁止渲染」（`ai/types.ts:57-58`）。

渲染层一律按 `code` 取 i18n：设置页 `ERROR_KEYS`（`pages/settings/aiSectionSupport.ts:23-38`）与对话面板 `AI_ERROR_TEXT_KEYS`（`pages/writer/right/ai/aiErrorText.ts:13-28`）是同构的两张映射表，均以 `satisfies Record<AiErrorCode, string>` **编译期强制全覆盖**——新增错误码时类型检查直接失败，逼你同步 zh-CN / en 双端文案，避免漏译。

preload 侧的白名单 `AI_ERROR_CODES` 已改为对象 + `satisfies Record<AiError['code'], true>`（`preload/api/ai.ts:52-67`）：漏加新 code 即编译失败，避免它被 `readAiError` 判为非法载荷而静默丢弃（表现为 UI 卡在「生成中」）。

## 5. 对话持久化

两张表，`schema/aiChat.ts` 建表，`database/aiChat.ts` 提供读写：

| 表                 | 列                                                                                      | 说明                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ai_chat_sessions` | `id`、`book_id`、`chapter_id`、`provider`、`model`、`title`、`created_at`、`updated_at` | 会话归属「书 + 章」；索引 `(book_id, chapter_id)`；删书 / 删章物理级联  |
| `ai_chat_messages` | `id`、`session_id`、`role`、`content`、`usage_json`、`created_at`                       | `role` 由 CHECK 限 `system`/`user`/`assistant`；索引 `(session_id, id)` |

落库时机（渲染层 `useAiConversation` + `chatRuntime.ts`）：

1. **发送前**：`ensureSession()` 保证会话存在——先 `sessions.list` 取最近一条（`updated_at DESC, id DESC`），没有则 `sessions.create`（provider / model 取自当前配置）。同一章只有一个活动会话。
2. **用户消息**：拿到 sessionId 后立刻 `ai:messages:append`，失败只记日志，不打断流式展示（`chatRuntime.ts:77-95`）。
3. **助手回复**：仅在 `done` 且 `content.trim() !== ''` 时落库，`usageJson` 随之写入；中断 / 失败 / 空回复**不落库**（`useAiConversation.ts:154-166`）。追加消息与刷新会话 `updated_at` 在同一事务内完成（`database/aiChat.ts:155-178`），因此会话排序能反映最近活跃。

**切章清空内存错误**：错误只存在于 `AiConversationMessage.error`（内存态），从不写库。`active` / `bookId` / `chapterId` 变化时，effect 先同步执行 `stopActive(false)` → 丢弃 sessionId → `applyMessages([])`，再异步载入新章历史；历史全部来自数据库，`system` 行在载入时被过滤（`useAiConversation.ts:288-330`、`chatRuntime.ts:130-142`）。所以切回原章后，之前的错误气泡不会重现。

## 6. OneDrive 模块分层

```
onedrive:signIn / onedrive:listBackups / onedrive:restoreBackup（ipc/onedrive.ts）
        │
        ├── auth.ts            PKCE 授权 · 刷新 · 登出
        │     ├── authCallback.ts  127.0.0.1 回环 server + 极简 HTML 回调页
        │     ├── authToken.ts     令牌端点（authorization_code / refresh_token）
        │     ├── credentials.ts   settings 键 · safeStorage 密文 · 授权状态
        │     └── clientIdCleanup.ts 启动时清理旧自定义 clientId
        ├── backup.ts          快照 → 上传 → 清理（进度编排）
        │     ├── upload.ts        ≤4MB 单次 PUT / >4MB 分片会话 + 重试
        │     └── graph.ts         Graph 请求封装 · approot 根路径与 URL 构造
        ├── remote.ts          远端备份列表（按修改时间倒序）
        ├── download.ts        Range 分块下载 · 预签名 URL 续传
        ├── restoreRemote.ts   下载 → 校验 → 复用本地 restoreDatabase
        ├── http.ts            超时合并 · 错误归一化 · Retry-After · 可中断 sleep
        ├── logSafe.ts         邮箱 / 路径 / 异常脱敏
        ├── types.ts           OneDriveError（24 个 code）
        └── index.ts           统一出口
```

| 文件                 | 行数 | 职责                                                     |
| -------------------- | ---- | -------------------------------------------------------- |
| `auth.ts`            | 301  | 生成 PKCE、起回调 server、换 token、刷新单飞、登出       |
| `authCallback.ts`    | 192  | 只监听 `127.0.0.1` 随机端口、校验 `state`、返回内置 HTML |
| `authToken.ts`       | 95   | 令牌端点 HTTP + OAuth 错误映射                           |
| `backup.ts`          | 155  | `db.backup()` 快照、互斥、进度、临时文件清理             |
| `credentials.ts`     | 217  | settings 键、加密读写、`getOneDriveAuthStatus`           |
| `clientIdCleanup.ts` | 50   | 启动时一次性清理旧 `onedrive:clientId` 并清除凭据        |
| `download.ts`        | 332  | Range 分块下载、预签名 URL 刷新、重试与取消              |
| `graph.ts`           | 191  | `graphRequest`、`/me`、`approot` 根路径与子项、URL 构造  |
| `http.ts`            | 192  | 与 AI 域平行的最小 HTTP 工具（不引 `openai` SDK）        |
| `index.ts`           | 50   | 对外导出面                                               |
| `logSafe.ts`         | 82   | `maskEmail` / `safePath` / `safeError`                   |
| `remote.ts`          | 158  | 列出 `approot` 根路径中的快照并归一化、404 探测          |
| `restoreRemote.ts`   | 124  | 下载 → 校验 → 恢复编排、临时文件清理                     |
| `types.ts`           | 200  | 错误码、凭据、进度、结果类型                             |
| `upload.ts`          | 432  | 大小分流、分片、重试、416 纠偏、会话取消                 |

`http.ts` 与 `ai/http.ts` 是**有意的双份实现**：错误归一化产物不同（`OneDriveError` vs `AiError`），且 AI 侧依赖 `openai` SDK，备份模块不应被它拖入依赖（`onedrive/http.ts:4-10` 已登记该例外）。

## 7. OAuth 与凭据

### 7.1 PKCE 流程（`auth.ts:20-32`）

1. 生成 PKCE 对：32 字节随机数 → base64url 作 `code_verifier`，其 SHA-256 → base64url 作 `challenge`；另生成 24 字节 `state`。
2. 在 `127.0.0.1` 的随机端口（`listen(0, '127.0.0.1')`）起本地 server，回调地址 `http://localhost:<port>/`（根路径，与 Azure 登记的 `http://localhost` 一致）。注意：Azure 对 localhost 只忽略端口、**不忽略路径**——改成 `/callback` 等子路径会导致授权端点返回 `redirect_uri` 不匹配（`invalid_request`）。
3. `shell.openExternal` 打开授权页：`login.microsoftonline.com/common/oauth2/v2.0/authorize`，`response_type=code`、`code_challenge_method=S256`、scope = `offline_access Files.ReadWrite.AppFolder User.Read`。
4. 回调 server 校验 `state`（不匹配 → `state_mismatch`），取 `code` 后立即回内置成功页并关闭。
5. 用 `code` + `code_verifier` 换 token（`authToken.ts`）；缺 `refresh_token` 判 `auth_failed`。
6. 读 `/me` 补账户邮箱（失败不影响令牌保存），随后 `writeStoredCredentials` 加密落库。

### 7.2 回调页

`authCallback.ts` 内置极简 HTML（`respondHtml`），仅两个标题：`Authorization complete` / `Authorization failed`，文案为英文——注释明确「避免在本模块硬编码中文字案」（`authCallback.ts:28`）。非 `GET /`（根路径）返回 404 纯文本。`error=access_denied` 映射为 `auth_cancelled`，其余 OAuth 错误为 `auth_failed`。

### 7.3 凭据存储

| 键                        | 内容                                                 | 形态                           |
| ------------------------- | ---------------------------------------------------- | ------------------------------ |
| `onedrive:credentials:v1` | `{ accessToken, refreshToken, expiresAt, account? }` | `safeStorage` 密文 base64      |
| `onedrive:account`        | 账户邮箱                                             | 明文，仅供界面展示，免每次解密 |

加密判定比 AI 侧更严：除 `isEncryptionAvailable()` 外，Linux 上还要排除 `basic_text` 后端（仅 base64 混淆，等同明文），命中即视为**不可用**（`credentials.ts:45-72`）。不可用时拒绝写入、读取抛 `encryption_unavailable`，绝不降级明文。

### 7.4 刷新与取消

- **提前 5 分钟刷新**：`expiresAt - now > 5 min` 直接返回现有 token，否则走刷新（`auth.ts:46`、`283-284`）。
- **单飞**：模块级 `refreshTask` 保证并发调用共享同一次刷新，避免 refresh token 轮换互相失效（`auth.ts:278-292`）。
- **轮换回写**：上游未返回新 refresh token 时沿用旧值；成功后 `writeStoredCredentials` 回写。
- **代际守卫**：`credentialsGeneration` 在登出 / 重新登录时自增；在途刷新若代际不符则抛 `aborted`，不把旧凭据写回（`auth.ts:59-61`、`244-248`）。刷新遇 `invalid_grant` / `interaction_required` → `reauth_required`，同时 `clearStoredCredentials()`（`auth.ts:226-236`）。
- **取消 / 登出**：`cancelSignIn()` 关闭回环 server，`code` Promise 以 `auth_cancelled` 拒绝；`signIn` 入口先取消上一次流程，保证同一时刻只有一个授权；等待授权默认 **5 分钟**超时（`AUTHORIZE_TIMEOUT_MS`，`auth.ts:43`）。`signOut()` 取消在途授权、自增代际、清除凭据。

## 8. 备份流程

> 恢复能力：OneDrive 链路同时提供上传、远端列表、下载与恢复。设置页「OneDrive 云备份」分区的「云端备份」区会自动列出 `approot` 根路径中的快照，选中一份后先统一落盘、二次确认，再下载到系统临时目录并复用本地恢复流程替换数据库。恢复前自动创建本地 `pre-restore` 安全副本，成功后应用自动重启；下载 / 恢复期间可取消。本地备份与恢复仍是独立的 `backup:*` 链路。

### 8.1 打包内容

不是「导出业务数据」，而是**整库快照**：用 better-sqlite3 的 `db.backup(dest)` 把当前数据库（WAL 安全、异步）复制到系统临时目录 `writers-forge-backups/`，文件名即远端文件名 `writers-forge-<YYYYMMDD-HHmmss>.db`（本地时间）。避免直接上传正在写入的库文件（`backup.ts:18-27`、`95-125`）。

- 进程崩溃遗留的快照在下次快照时按 **6 小时**阈值清理（`backup.ts:34`、`67-88`）；无论上传成败，`finally` 删除临时快照（删除失败只记日志，不掩盖原始错误）；仅有手动触发，模块内**不含定时器**。

### 8.2 上传策略

| 文件大小   | 策略                               | 出处                |
| ---------- | ---------------------------------- | ------------------- |
| ≤ **4 MB** | 单次 `PUT …:/content`              | `graph.ts:22`       |
| > 4 MB     | `createUploadSession` + 分片 `PUT` | `upload.ts:324-392` |

分片细节：单元 **10 MB**，单分片上限 **60 MB**，以「约 10 片」为目标放大（`upload.ts:42-44`、`100-106`）。每片最多尝试 **4 次**（含首次），429 / 5xx / 网络错误按 `Retry-After` 或指数退避 **1s / 2s / 4s（上限 30 s）** 重试；`Retry-After` 取值裁剪到 **1s–60s**；416 时向会话查询 `nextExpectedRanges` 纠偏继续；失败 / 取消 `DELETE` 会话（固定 **5 s** 超时，best-effort）。app folder 是应用专属目录，文件直接放在 `approot` 根路径，**无需**显式创建子目录；Graph 在首次访问 special 命名空间时自动 provision。

### 8.3 进度事件

主进程 → 渲染层单向下发 `onedrive:progress`，载荷 `{ phase, bytesSent, totalBytes, percent }`：

| phase      | 时机                                   | 数值                |
| ---------- | -------------------------------------- | ------------------- |
| `snapshot` | 开始、取 token 成功后                  | `0 / 0 / 0`         |
| `upload`   | 每个分片完成（小文件为上传完成后一次） | 实际字节与百分比    |
| `done`     | 上传成功                               | `size / size / 100` |

进度回调抛错只记日志，不影响备份本身（`backup.ts:137-147`）。`sender` 已销毁时静默丢弃。

### 8.4 取消与互斥

- 互斥：模块级 `activeBackup` + IPC 层 `activeBackupController`；并发调用立即返回 `{ ok: false, code: 'backup_in_progress' }`（`ipc/onedrive.ts:153-156`）。
- 取消：`onedrive:cancelBackup` 通过 `AbortController.abort()` 中断；网络层表现为 `aborted`，分片重试遇 `aborted` 不再重试。两者都是长任务，`ipcMain.handle` 会挂到流程结束，取消固定走独立通道。

### 8.5 远端列表

`onedrive:listBackups` 调 `listRemoteBackups()`：带 Authorization 请求 `approot/children`（special 文件夹列子项用 `/children`；`:` 仅用于路径寻址，如 `approot:/{name}:/content`），按 `@odata.nextLink` 翻页（最多 20 页，单页上限 200）。列表 404 时再探测 `approot` 本体：本体也 404 才视为 app folder 尚不存在、返回空数组；本体存在则说明子项路径或权限异常，抛 `list_failed` 并 `warn` 记录原始 status，不再静默伪装成空列表。列表按 `lastModifiedDateTime` 倒序。每项只回传 `itemId` / `name` / `sizeBytes` / `modifiedAt` / `webUrl?`，不含下载地址或 token。早期版本曾尝试在 `approot` 下创建 `backups/` 子目录，但该请求始终返回 400 `invalidRequest`、从未成功，因此没有需要迁移的旧备份；若曾用其它方式把文件放进 `approot:/backups/`，新列表不会显示，需要时可自行在 OneDrive 侧移动。

### 8.6 下载与恢复

`onedrive:restoreBackup({ itemId })` 的编排（`restoreRemote.ts`）：

1. 取 token 后请求 item 元信息，拿预签名 `@microsoft.graph.downloadUrl` 与总大小；404 归一化为 `remote_not_found`。
2. 下载到系统临时目录 `writers-forge-restore/onedrive-restore-<YYYYMMDD-HHmmss>.db`。分块 **8 MB**，单块超时 **120 s**、最多尝试 **4 次**；预签名 URL 401 / 403 视为过期，最多重取 **2 次**并从当前偏移续传。临时文件名刻意不用 `writers-forge-` 前缀，避开快照遗留清理。
3. 只读校验（复用 `verifyDatabaseFile`：后缀 / `quick_check` / 核心表）。
4. 校验通过后调本地 `restoreDatabase()`（复用安全副本、替换数据库、自动重启），内部自行占用本地恢复锁；下载阶段不占锁。
5. `finally` 删除临时文件；成功后 IPC 层 `scheduleRelaunch()`，300ms 后 `app.relaunch()` + `app.exit(0)`。

进度走独立推送 `onedrive:restoreProgress`，载荷 `{ phase: 'download' | 'restore' | 'done', bytesReceived, totalBytes, percent }`。取消走 `onedrive:cancelRestore`（下载阶段生效）：网络层抛 `aborted`，分块重试不再继续，半成品文件随 `finally` 清理。

**嵌套错误**：`restoreBackup` 返回 `OneDriveResult<BackupRestoreResult>`。外层 `{ ok: false, code }` 是 OneDrive 域错误（下载 / 鉴权 / 条目不存在等）；外层 `ok: true` 但 `value.ok === false` 时，`value.code` 是恢复域 `BackupErrorCode`（校验 / 安全副本 / 替换数据库）。渲染层先查 `ERROR_KEYS`，再查 `BACKUP_ERROR_KEYS`。

### 8.7 错误码（`onedrive/types.ts`，共 24 个）

跨 IPC 时**不抛异常**：`OneDriveError` 序列化后只剩 `name`/`message`，`code` 会丢，因此可预期错误一律返回 `{ ok: false, code, status? }`，只有非域内异常才重抛（`ipc/onedrive.ts:39-43`）。渲染层经 `ERROR_KEYS`（`satisfies Record<OneDriveErrorCode, string>`）取 `onedrive.error.<code>`。

| 分组        | code                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| 配置 / 凭据 | `not_configured`、`encryption_unavailable`、`credentials_corrupt`                                                         |
| 授权流程    | `auth_cancelled`、`auth_timeout`、`auth_failed`、`state_mismatch`、`reauth_required`、`port_bind_failed`                  |
| 传输        | `network`、`timeout`、`aborted`、`unauthorized`、`forbidden`、`not_found`、`rate_limited`、`upstream`                     |
| 备份 / 恢复 | `upload_failed`、`snapshot_failed`、`list_failed`、`download_failed`、`remote_not_found`、`backup_in_progress`、`unknown` |

可重试判定集中在 `RETRYABLE_CODES`：`network` / `timeout` / `rate_limited` / `upstream`（`onedrive/types.ts:36-41`）。

## 9. 安全与日志脱敏

### 9.1 settings 敏感键过滤

四条通用 settings 通道（`get` / `set` / `all` / `delete`）共用一份前缀表（`ipc/settings.ts:18`）：

```ts
const SENSITIVE_KEY_PREFIXES = ['ai:', 'onedrive:credentials:'] as const
```

| 通道              | 命中敏感键的行为                                     |
| ----------------- | ---------------------------------------------------- |
| `settings:get`    | 返回 `null`（与「未设置」不可区分），并记 warn       |
| `settings:set`    | 返回 `false`，禁止渲染层覆盖（如篡改 OneDrive 密文） |
| `settings:all`    | 整键剔除后返回，只记剔除数量                         |
| `settings:delete` | 返回 `false`，清理只能由主进程授权流程执行           |

放行项：`onedrive:account`（展示用邮箱）。新增敏感域必须在此登记。

### 9.2 日志脱敏

`logSafe.ts` 的定位是「落盘日志属于离开进程边界的数据」，三条规则：

| 函数        | 规则                                                                      | 示例                                     |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| `maskEmail` | 保留首字符 + 域名                                                         | `alice@example.com` → `a***@example.com` |
| `safePath`  | 只保留 `basename`，绝不记目录                                             | `C:\Users\<name>\…\x.db` → `x.db`        |
| `safeError` | 白名单 `code` / `status` / `message`，message 压缩空白并截断 **200** 字符 | 不序列化 `cause` 与自定义属性            |

`logSafe` 只依赖 `node:path` 与纯类型模块，因此核心 `logger.ts` 也能安全引入而不产生循环依赖。AI 侧遵循同类约束：只记 `{ provider, model, code, status }`；配置写入日志带 `keyLength`（`ai/config.ts:233-237`），但 IPC 层**不再重复记录长度**以避免侧信道（`ipc/ai.ts:100-106`）。两域都保证：密钥明文、密文、上游响应体、用户正文不进入日志与错误对象。

## 10. 已知技术债

- **60 s 预算不随 delta 重置**：长回复可能在流式途中被本地定时器直接 abort（§3.5）。当前未按「首字节超时 + 空闲超时」建模。
- **`touchAiSession` 无调用方**：schema 注释称 `updated_at` 在「流式结束」刷新，但实际只有 `appendAiMessage` 事务内刷新；该导出函数目前是死代码，注释与实现需对齐。
- **`unsupported_provider` 为历史值**：`AiKeyWriteError` 保留它仅为兼容旧 IPC 载荷，当前流程不会再产生（`ai/types.ts:88-94`）。

最后核对：2026-11-13

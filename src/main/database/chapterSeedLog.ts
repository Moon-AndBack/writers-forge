/**
 * 教学书种子的版本与变更日志（`chapterSeed.ts` 的配套文档模块）。
 *
 * 单独成文件的原因：AGENTS §3 规定单文件 ≤500 行，日志随每批功能持续增长，
 * 继续内联会把 `chapterSeed.ts` 顶到硬上限。本文件只放版本常量与最近版本记录，
 * 不参与种子重建逻辑。
 *
 * 历史版本日志已按区间迁至同目录，追溯旧版本改动请去这两个文件：
 * - `chapterSeedLogHistoryEarly.ts`：v3 → v70
 * - `chapterSeedLogHistoryLate.ts`：v71 → v102
 */

/** 当前种子契约版本：`chapterSeed.ts` 的 `MIGRATION_KEY` 由此拼出（升版本 = 老库强制重灌）。 */
export const CHAPTER_SEED_VERSION = 'v118'

/**
 * 最近版本变更日志（v118；更早版本见上述历史文件）。
 *
 * `v118`（AI 快捷功能「重写本段」批）：右栏 AI 快捷功能「改写」重命名为「重写本段」
 * （内部 key 仍为 `rewrite`，只改 i18n 显示文案）。`functions.ts` 的 rewrite system prompt
 * 重写，与「润色」划清界限：明确要求句子层面明显不同（不得复用原句结构、不得只替换
 * 同义词），并允许重排段落与叙述顺序、增删修饰与调整详略（篇幅可明显增减）；保留
 * 「不得改变事实、人物关系与情节走向」的安全边界，把「保持原人称 / 视角 / 语气」降为
 * 默认，新增优先级条款——【补充要求】指定人称、视角、语气或改写方向时以其为准。
 * 教学文案同步（卷二、卷三右栏、卷四「右栏面板」三处 AI 功能列表移除实际不存在的
 * 「自定义」项，改写更名为「重写本段」并补充与「润色」的区别）。
 *
 * `v117`（AI 会话栏重做与自动命名批）：会话去章化收尾——右栏 AI 会话由「按章隔离」彻底改为
 * **按书共享**，A 章建立的会话可在 B 章继续使用；切章不再中断在途生成，消息也不清空。
 * 回插受来源章约束：仅「当前章产出」的 assistant 回复可「替换选中 / 插入到光标后」，
 * 其它章的回复在气泡上标注来源并禁用回插。面板头部会话区由 Modal 列表（`AiSessionMenu`）
 * 改造为 `AiSessionBar` 单行软底栏：`Select`（显示当前会话名、直接切换）+ `Dropdown`（⋯
 * 重命名 / 删除）+「新建」按钮，整行 `--soft-solid` 软底、只过渡颜色与阴影、无 transform；
 * 旧 Modal 会话列表移除。新增 `aiSessionTitle.ts`：本次新建会话的首轮回复正常完成后，
 * 异步调用 `ai:chat:complete`（maxTokens 32）生成 6–14 字标题，失败回落到首条消息截断；
 * fire-and-forget，不阻塞定稿，停止 / 报错不触发。写入走新增的 `ai:sessions:renameIfEmpty`
 * （`UPDATE ... WHERE id = ? AND title = ''`，原子守卫），用户手动改名后不会被覆盖；
 * `useAiSessions` / `useAiConversation` 增加刷新回调与 `EnsuredSession.created` 标记。
 * 教学文案同步（卷二「章节页的左右两栏」、卷四「右栏面板」、卷三右栏页签说明、大纲
 * 「AI 写作助手」条目：会话按书归属、切章不中断、跨章回插限制、会话栏布局与自动命名；
 * 原「按章保存」「同一章多条会话」「面板头部会话（N）」等表述已不成立）。另修正 i18n 中残留的「占用条」
 * 措辞（进度条已在 v116 单行化时移除，改为「上下文百分比」）。
 *
 * `v116`（AI 面板底部状态区单行化批）：右栏 AI 输入区下方的状态区从最多 6 个块（正常 3~4 行、
 * 理论最差约 8 行）压成**一行**——`AiComposerStatus` 重写为「Tag（已选 / 全文字数）+ 状态槽 +
 * Badge（上下文百分比）+ IconButton（刷新模型列表）」；状态槽四态互斥复用（超预算 > 模型错误 >
 * 整理上下文 > 模型加载提示），长文本单行省略、悬停 / 聚焦看完整内容；百分比去掉进度条，
 * ≥80% 加 `⚠` 前缀与 aria-label 文本（不单靠颜色传递状态），窗口来源（未知模型按 32K /
 * 匹配自某目录 id）与校准说明移到悬停提示。`ContextMeter.tsx` 删除（逻辑内联，
 * 样式一并清理）。教学文案同步（设置「AI 助手」的上下文占用说明与「自定义上下文窗口」、
 * 大纲「AI 写作助手」「上下文压缩与模型窗口」条目改为「单行状态栏」，原「占用条」「行下标注」
 * 表述已不成立）。
 *
 * `v115`（上下文估算校准 + 可配置批）：右栏 AI 的上下文估算增加「真实 usage 校准」——
 * `useAiConversation.send` 在 `prepared.messages` 组装完成后记录
 * `estimateMessages` 估算值到 `ActiveRequest.estimatedPromptTokens`（同时快照
 * `calibrationKey = provider/model`），`handleDone` 用 `usage.prompt_tokens` 与估算求比值，
 * 经 `contextBudget.recordCalibration` 存入模块级 Map：比值 clamp 到 `[0.5, 3.0]` 后按
 * EMA（新 0.3 / 旧 0.7，首次直接取观测）平滑，仅估算与真实都 > 0 时记录；`useContextUsage`
 * 展示时按模型名取同模型系数均值乘到 `usedTokens`（`ContextUsage.calibrated`），占用条行下
 * 标注「已按最近一次真实用量校准」。发送决策（80% 压缩 / 超预算拒绝）仍用原始估算，避免
 * 系数漂移导致阈值抖动。设置页「AI 助手」新增「上下文压缩」区：①「启用自动压缩」开关
 * （settings KV `ai:compression:enabled`，默认 true；因 `ai:` 前缀对 `settings:*` 全屏蔽，
 * 新增专用 IPC `ai:compression:get|set`，**不改表结构**）——关闭后 `prepareOutgoingMessages`
 * 跳过摘要补全、按 50% 目标纯截断（已存摘要仍复用），超预算仍拒绝；②「自定义上下文窗口」
 * 手填模型 ID + tokens（新增只读通道 `ai:catalog:overrides:list` 列出已保存覆写，写入仍走
 * `ai:catalog:override`，经 `overrideContextLimit` 失效渲染层窗口缓存），已保存项可逐条删除。
 * 教学文案同步（设置「AI 助手」项数与「上下文压缩」说明、大纲新增「上下文压缩与模型窗口」条）。
 *
 * `v114`（上下文摘要压缩批）：右栏 AI 在发送前按「模型上下文窗口」做预算判定——
 * `estimateMessages([system, 本轮 user])` 本身超窗口则拒绝发送（不截断携带正文）；
 * 总占用达到 80% 时自动把较早对话压成一段摘要（无确认弹窗），摘要以 `role = 'system'`
 * 行写回 `ai_chat_messages`（现有 CHECK 已允许，**不改表结构、不改原文**），行首隐藏标记
 * `<!--wf-summary covered=N-->` 记录已覆盖的消息条数，重启后复用、不重复摘要；摘要并入
 * **第一条** system（不新增第二条，兼容只认首条的转接站），并保留 recent 到 50% 目标。
 * 摘要失败退化为纯截断，不阻断发送；压缩后保证 `[system, ...recent, user]` ≤ 200 条。
 * 摘要请求走新增的 `ai:chat:complete`（非流式、独立 requestId、60s 超时、不经过
 * `claimChat`、不推流式事件），入参校验独立为 `readCompleteInput`（400 条上限，单条仍
 * 10 万字符）；`MAX_MESSAGES = 200` 仍是发送链路防线。渲染层 `useContextUsage` 的窗口
 * 缓存新增失效入口（目录刷新 / `ai:catalog:override` 后清空），占用条改为只计未压缩历史
 * + 摘要。UI 新增「正在整理上下文…」、消息流压缩分隔行（「已压缩前 N 轮对话」）与超预算
 * 拒绝提示（已用 / 窗口 + 建议）。教学文案同步（设置「AI 助手」新增「模型目录」与
 * 「上下文占用与自动压缩」两节，大纲「AI 写作助手」条目补充压缩说明）。
 *
 * `v113`（模型列表缓存批）：AI 模型列表改为「本地缓存优先 + 后台刷新」。`settings` 表
 * 新增键 `ai:models:v1:<provider>`，值为 `{ baseUrl, models, fetchedAt }`：打开设置 /
 * 切到「AI」页签先读缓存立即渲染（不再先清空列表），缓存缺失或超过 12 小时才后台静默
 * 联网刷新，失败保留旧列表；空列表不写缓存；写入以请求发起时刻做并发保护（旧响应不覆盖
 * 新响应）；Base URL 变更后旧缓存视为未命中。`ai:models:list` 新增可选
 * `mode: 'cache' | 'refresh'`（缺省 cache，向后兼容）并回传 `source / fetchedAt / stale`；
 * `ai:test` 保持强制走网络。设置页「刷新」不再 `flushConnection()`（去掉顺带落库草稿的
 * 副作用）。生成请求发送时已快照 model，刷新列表不影响在途对话。教学文案同步（设置
 * 「AI 助手」分区补充缓存与刷新说明）。
 *
 * `v112`（右栏页签结构批）：章节模块右栏「灵感」页签移到「AI」左边，顺序由
 * 大纲 / 剧情 / 伏笔 / AI / 灵感 改为 **大纲 / 剧情 / 伏笔 / 灵感 / AI**；大纲模块右栏
 * 由「直接挂载剧情面板、无页签条」改为与章节页同款的 **剧情 / 伏笔 / 灵感** 三页签
 * （不含「大纲」与「AI」）。`RightPaneTabs` 新增可选 `tabs`（缺省全量五项，向后兼容），
 * 页签顺序常量 `CHAPTER_RIGHT_PANE_TABS` / `OUTLINE_RIGHT_PANE_TABS` 成为唯一真源；
 * `RightPane` 把两模块合并到**同一套面板容器与面板实例**（不双份挂载，仍只用 `hidden`
 * 切显隐），页签状态按模块隔离（`chapterTab` 默认「大纲」/ `outlineTab` 默认「剧情」），
 * 渲染时校验当前页签是否在可见集内、不在则回退本模块首项（章节停在「大纲 / AI」切到
 * 大纲页不会出现空面板）。顺带修复 `AiPanel` 的 `active` 漏判模块的问题——此前切到大纲
 * 页 AI 仍为 active，会话与流式状态一直挂着；现值 `module === 'chapters' && tab === 'ai'`。
 * 教学文案同步（卷二「卷与章节」、卷三「卷纲」与剧情「每场景一行与右栏正文编辑」、
 * 大纲「条目、分组与卷」、「AI 写作助手」条目、卷四「右栏面板」等，页签顺序与大纲模块
 * 页签集表述一并更新）。
 *
 * `v111`（选中态文本勾号清理批）：程序内 5 处「选中态对钩字符」全部去掉——活动栏筛选浮窗的
 * 分类 chip（`ActivityBarFilterPopover`，连 `.act-filter__check` 样式一并删除）、`Select`、
 * `Combobox`（删共享的 `.wf-select__check` 与样式）、状态栏 `PopupSelect`、书架 `Dropdown`。
 * 选中态此前已有品牌色文字 / 淡底 / 描边三重标记，勾号属冗余第三重，删除后观感与层级不变。
 * 其中 `PopupSelect` 与 `Dropdown` **保留空 span 占位**（只删字符、不删节点），避免不同档位
 * 弹窗与菜单行宽跳动；`Dropdown` 的 `.wf-dropdown__check` 补显式 `width: 12px`，防空 span
 * 塌陷。编辑器「含表头行」的原生 checkbox 是功能开关、模块栏图标（`moduleIcons.ts` 的
 * `*Check` 变体）是模块标识，二者均**保留不动**。教学文案同步（「设定档案」卷「筛选当前模块」
 * 节、「灵感」卷「筛选与搜索（活动栏浮窗）」节，2 处「带勾选标记」→「以品牌色底纹、描边与
 * 文字色标出」）。
 *
 * `v110`（时间线起点描述切换补存批）：修复「切换时间线丢失未提交起点描述草稿」——起点卡按
 * `bookId:activeTimelineId` 重建（卸载重挂），v109 下线失焦自动保存后该缺口暴露。`Writer.tsx`
 * 的三个切换入口（左栏选中 / 新建后隐式切换 / 删除当前 active 后隐式切换）统一在改
 * `activeTimelineId` 之前 `await flushModule('timeline')`，复用既有「时间线起点描述」补存步骤
 * （在途去重、内部 try/catch + 日志）；补存失败不阻断切换。补存先于 `setActiveId`，故
 * `updateDescription` 闭包里的 `activeId` 仍是旧条目，写入不会串到新条目。教学文案同步
 * （卷三「主时间线：只读聚合」节、大纲「主时间线只读聚合」「多时间线与过滤」条目）。
 *
 * `v109`（时间线起点描述改富文本批）：独立时间线右栏「起点」卡由「单行输入框 +「保存描述」
 * 按钮 + 失焦自动保存 + 已保存提示」改为**富文本编辑区 + 卡外底部 `SaveBar`**——字段占满
 * 卡片剩余高度（`fill`）、高度链每层 `min-height: 0`、段落首行缩进两字（只作用于文档顶层
 * `.ProseMirror > p`），保存统一走卡外保存条（有脏才可点、保存中防连点），失焦自动保存
 * 下线；切模块 / 关窗仍经 `useFlushAllModules` 的「时间线起点描述」步骤补存挂载期间的脏草稿。
 * 数据层为双字段：`TimelineEntry` 新增 `descriptionJson`（富文本真源），`description` 保留为
 * 派生纯文本摘要；主进程 `TimelineEntry` / `normalizeEntry` 条件透传（老数据不补字段、
 * **不做启动期迁移**），读侧统一经 `resolveEntryDescriptionJson` 兜底（`descriptionJson`
 * 可用则原样使用，否则由 `plainTextToDocJson(description)` 派生，纯空白 → `null`），
 * 右栏脏态基线与 `initialJson` 同走该函数，避免老数据首帧假 dirty。中栏元年卡改用
 * `docJsonToParagraphs(descriptionJson)` 逐段渲染 `.plot-scene-para`（空态仍回退
 * 「故事开始了」，零新增 CSS）。新建时间线弹窗第二字段改 `ShortRichTextField`（不 `fill`，
 * 弹窗内按内容高度），提交真正落 `{ text, json }`，不再依赖读侧兜底。教学文案同步
 * （卷三「主时间线：只读聚合」「多时间线」节、大纲「主时间线只读聚合」「多时间线与过滤」
 * 「全局快捷键」条目、卷二「快捷键」条目）。
 *
 * `v108`（章节右栏「灵感」页签批）：章节模块右栏由四页签扩为五页签——
 * 大纲 / 剧情 / 伏笔 / AI / 灵感（新页签排在最后）。灵感页签把**全书**灵感平铺成卡片
 * （按最近编辑倒序，不按标签分组，也不接活动栏的标签 / 关键词筛选），卡片复用中栏
 * `InspirationCard` 的 `readonly` / `compact` 变体（只读态不渲染删除按钮，AGENTS §9；
 * 卡片可交互性改由 `onSelect` 是否存在决定，中栏既有行为不变）；点卡片在右栏内展开
 * 只读详情（标题 / 标签 / 纯文本正文，底部「返回」回列表；列表只被 `hidden`、返回时
 * 保留滚动位置），不跳转灵感模块。数据由新增 `useBookInspirations` 自行拉取（`active`
 * 为真才请求、按 `bookId` 打标、`seq` 竞态保护、切走不清空），不启用
 * `useInspirationBundle`（后者仅在灵感模块激活时返回值）。教学文案同步（卷二「章节页的
 * 左右两栏」、卷四「右栏面板」、卷三右栏时间轴段、大纲「条目、分组与卷」与「每场景一行
 * 与右栏正文编辑」条目）。
 *
 * `v107`（时间线元年卡可选批）：独立时间线的选中态由「仅场景 id」升级为
 * `'origin' | number | null`（`usePlotTimelineBundle`，默认 `'origin'`），元年卡与场景卡
 * 同款可点击（`active` + `onClick`，`readonly` 保留——它只控制光标不控制可点性）；右栏
 * `TimelineRightPanel` 从「恒定起点卡 + 场景详情」改为按选中项**只渲染一张卡**（起点 →
 * 起点编辑卡；场景 → 只读详情；都没选 → 既有空态），未选中起点时起点卡不挂载（flushRef
 * 为空操作为 null）。切换时间线（`activeTimelineId` 变化）时选中项重置回 `'origin'`；
 * 切模块不重置。CSS 移除元年卡 `cursor: default` 覆写（与其余只读卡一致）。教学文案同步
 * （卷三「主时间线：只读聚合」节、大纲「主时间线只读聚合」条目）。
 *
 * `v106`（伏笔搜索与筛选批）：伏笔模块此前只能滚动找，本批把活动栏筛选浮层
 * （`shell/ActivityBarFilterPopover`，`FilterableModule` 增加 `foreshadow`）扩到伏笔域——
 * 第一行「伏笔」+ 搜索框 + 提交按钮，第二行「全部」+ 四个**派生状态**
 * （建设中 / 埋设中 / 已回收 / 已废弃）作为**唯一分类维度**（状态由锚点派生、四态互斥、
 * 回收优先，故不做「已回收 + 埋设中」这类多选，也刻意不加第二维：一条伏笔可同时有正文埋点
 * 与大纲埋点，两者不是互斥分类）；搜索覆盖名称、描述、回收备注与正文埋点 / 大纲埋点 /
 * 回收点三处摘抄，统一 `toLowerCase()` 后 `includes`（大小写不敏感），状态与关键词叠加。
 * 筛选纯派生、不动数据层，中栏 `rows` 换成过滤后的可见行，全量行仍供右栏选中 / 写操作使用
 * （被筛掉的伏笔仍可在右栏编辑）；`ForeshadowView` 空态区分「还没有伏笔」与
 * 「没有匹配的伏笔」，标题栏「新建」成功后清空条件保证新行可见；回收站视图不受筛选影响。
 * **因 `App.tsx` 不在本批可改范围**，无法把 Provider 挂到活动栏与写作页的共同祖先，
 * 条件改放模块级外部 store（`foreshadow/foreshadowFilterContext.ts`，`useSyncExternalStore`），
 * 对外 API（`filters` / `setFilter` / `clearAll`）与灵感 `useInspirationFilters` 一致，
 * 条件按书打标、换书自然失效。派生纯函数独立成 `foreshadow/foreshadowFilterMatch.ts`。
 * 教学文案同步（大纲「伏笔」组新增「搜索与筛选」条、卷四伏笔章新增「搜索与筛选」节）。
 *
 * 同批（AI 多会话批）：章节右栏 AI 由「每章单条会话」改为多会话——数据层与 preload 通道
 * 本已完备（`sessions.list|create|rename|delete`、`messages.list` 等），**本次未改
 * preload / IPC / `aiChat.ts`**，只把 UI 接出来。`chatRuntime` 的 `loadChapterSession`
 * （自己取最近一条 / 无则新建）改为 `loadSessionMessages`（只按 `sessionId` 读历史），
 * 会话选择上移到新增的 `ai/useAiSessions.ts`（列表 / 切换 / 新建草稿 / 重命名 / 删除，
 * 默认行为仍是该章 `updated_at DESC, id DESC` 的第一条）；新增 `ai/AiSessionMenu.tsx`
 * 承载面板头部「当前会话 + 新建 + 会话(N)」与会话弹窗（窄栏放不下侧栏列表，故用 Modal）。
 * 新建会话为**草稿态**（`activeSessionId = null`），首次发送才 `sessions.create` 落库，
 * 避免产生空会话行；生成中禁用全部会话操作（含新建 / 重命名 / 删除），删除走 `useConfirm`
 * 二次确认且消息级联删除。`useAiConversation` 新增 `hydrating`（读历史期间禁用发送），
 * 并新增 `persistAssistantPartial`：用户点停止、切换会话 / 章节、关闭或卸载面板时，
 * 已生成的半截回复按与 `done` 同口径落库（此前静默丢弃）；**上游 error 中断仍不落库**
 * （`handleError` 只标记错误气泡）。`AiPanel` 的纯工具（可回插判定 / 取文与字数 / 下拉选项）
 * 拆到 `ai/panelUtils.ts` 以守住单文件 500 行。教学文案同步（卷二章节页两栏说明、卷四右栏
 * 章节页签说明与 AI 段、大纲 AI 页签段）。
 *
 * `v105`（灵感 / 伏笔回收站批）：灵感与伏笔此前只做软删除、界面没有恢复入口，本批补齐
 * 与章节 / 大纲对称的回收站——数据层新增 `listDeleted` / `restore` / `purge` /
 * `purgeAllDeleted`（灵感在 `inspirations.ts`，伏笔在 `foreshadowsTrash.ts`；伏笔物理删除
 * 整行，正文埋点 / 大纲埋点 / 回收点随行一并消失，与删除章 / 大纲条目时外键级联同语义）；
 * IPC 新增 `inspiration:listDeleted|restore|purge|purgeAllDeleted` 与伏笔同名通道，
 * preload 同步。UI 在灵感 / 伏笔模块标题栏复用共享 `EditorTrashButton`（垃圾桶图标）打开
 * 中栏回收站视图，视图复用 `TrashListView` / `useTrashData`（零新增 CSS）；灵感行显示
 * 标题 + 标签，伏笔行显示名称 + 描述摘要；卡片删除确认文案由「此操作不可撤销」改为
 * 「将移入回收站，可再还原」。教学文案同步（伏笔 / 灵感模块的删除说明补充回收站入口与
 * 还原 / 彻底删除 / 清空三种操作）。
 *
 * `v104`（写作页全局快捷键批）：主进程已移除应用菜单（`Menu.setApplicationMenu(null)`），
 * 菜单加速键不可用，新增渲染层全局快捷键 `useWriterShortcuts`（仅 `Writer` 挂载期间监听
 * `window` 的 `keydown`）——`Ctrl/Cmd+S` 经 `useFlushAllModules.flushModule` 保存**当前模块**
 * （章节 / 大纲正文、剧情 / 设定档案 / 伏笔 / 灵感草稿、时间线起点描述，复用既有落盘入口，
 * 并 `preventDefault()` 阻止「保存网页」）；`Ctrl/Cmd+F` 仅章节 / 大纲响应，复用标题栏
 * `data-search-toggle` 搜索按钮打开既有查找替换浮窗（浮窗已开时聚焦搜索框）；`Ctrl/Cmd+1..9`
 * 按 `WRITER_MODULES` 顺序切换活动栏前 9 个模块（走 `useWriterModuleSwitch.handleSwitch`，
 * 保留未保存草稿守卫；弹窗打开时不响应）。刻意**不接管 Escape**，弹窗 / 搜索浮窗 / 内联改名
 * 的既有 Esc 处理不变；只匹配单键 `s` / `f` / `1..9` 且要求无 Alt / Shift，不拦截
 * `Ctrl+C/V/X/Z/Y/A` 与 `Ctrl+Shift+*`，`event.isComposing` 时直接忽略（IME 组字安全）。
 * 教学文案（卷二「章节写作」的「写正文」章新增「全局快捷键」节、大纲「章节写作」分组新增
 * 「全局快捷键」条目）同步，键提升让老库也能看到新文案。
 *
 * 同批（三栏宽度持久化批）：写作页左右两栏宽度改为跨重启保留——`WorkspaceLayout` 经
 * `useWorkspaceWidths` 在拖拽结束 / 双击复位后 300ms 防抖写入 settings 键
 * `workspaceWidths`（`{ left, right }` JSON），启动挂载时读回、逐栏钳制到
 * 180–480 / 450–850px 后应用，读取失败或非法值回落 300 / 600；窗口变窄只收缩渲染值
 * （`fitWidthsToViewport`），不覆盖已保存偏好，宽回来后自动还原；关闭 / 卸窗前补写挂起终值。
 * 上下分栏（章节右栏「大纲」页签的卷纲 / 细纲）比例仍是组件内 state，不落库，只在本次
 * 运行内保留。教学文案（卷四「实体与面板」的「右栏与界面微调」分隔条说明）同步，键提升
 * 让老库也能看到新文案。
 *
 * `v103`（删除时间线级联缺陷修复批 + 设置页接线批）：左栏时间线删除新增「剧情线引用」拦截——该时间线下
 * 仍有剧情线时删除按钮禁用，悬停提示「该时间线下还有 N 条剧情线，请先删除或迁移」
 * （`timeline` ns 新增 `deleteBlocked`，含 `{{count}}` 插值）；`useTimelineWorkspace.removeTimeline`
 * 写库前实时查询 `plot:listLines` 兜底，命中引用即返回 false（不写库），与左栏禁用共用
 * `countPlotLinesByTimeline` 聚合口径；计数取自页面层已加载的全书剧情线（`plot.allLines`），
 * 不新增 IPC、不改 preload。教学文案（卷三「剧情时间轴与主时间线」的多时间线节、大纲
 * 「剧情与时间线」组「多时间线与过滤」条目）同步补充该禁用规则，键提升让老库也能看到新文案。
 *
 * 同批（设置页接线批）：设置弹窗「基础偏好」的两项由「仅存值」改为真正生效——
 * 1）`autoSave` 由写作域 `useAutoSaveEnabled`（共用 `useSettingsValue`，同键广播即时生效）消费：
 * 开 = 章节 / 大纲正文停止输入 800ms 防抖落库；关 = `useChapterDoc` / `useOutlineDoc` 的
 * `onUpdate` 只置脏、不排定时器（运行中关闭会清除已排队任务），依赖标题栏保存按钮与
 * 切章 / 切换条目 / 切模块 / 关窗的统一 flush（安全网不变）；剧情 / 设定档案 / 伏笔 / 灵感
 * 本身为手动保存，不受该开关影响。2）`defaultView` 档位改为 `bookshelf` / `chapter` /
 * `outline`（移除未实现的 `recent`，历史值与脏值经 `resolveDefaultView` 回落 `bookshelf`，
 * 缺省档同为书架）；`App` 的 `StartupViewRedirect` 在启动首屏（引导完成、停留 `/`）只尝试
 * 一次——按 `books.updatedAt` 降序取最近编辑的书，`replace` 跳转 `/write/:bookId` 并以路由
 * state 传入首屏模块（chapter → chapters、outline → outline），无书 / 读取失败静默停留书架，
 * 之后用户自行导航不受影响。教学文案（卷五「界面与设置」的「设置弹窗」章新增「自动保存开与关」
 * 「默认打开视图」两节、卷二「写正文」保存与恢复、大纲「保存与撤销」「设置弹窗与语言」条目）
 * 同步，键提升让老库也能看到新文案。
 */

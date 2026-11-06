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
export const CHAPTER_SEED_VERSION = 'v105'

/**
 * 最近版本变更日志（v105；更早版本见上述历史文件）。
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

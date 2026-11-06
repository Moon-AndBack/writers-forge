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
export const CHAPTER_SEED_VERSION = 'v103'

/**
 * 最近版本变更日志（v103；更早版本见上述历史文件）。
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

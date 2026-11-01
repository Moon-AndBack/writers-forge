import { getDb } from './index'
import { listBooks } from './books'
import {
  GUIDE_BOOK,
  GUIDE_OUTLINE,
  GUIDE_OUTLINE_STANDALONE,
  GUIDE_PLOT_LINES,
  GUIDE_VOLUMES
} from './seedGuideBook'
import type { SeedChapter, SeedOutlineDoc } from './seedBlocks'
import { createChapter, createVolume, setChapterPin } from './chapters'
import { createOutlineGroup, createOutlineItem } from './outline/chapters'
import { saveOutlineContent } from './outline/content'
import { createPlotLine, createPlotScene } from './plot'
import { relinkGuidePlotSceneEntities } from './worldEntityPlotSeed'
import { clearWorldEntitySeedMarker, seedDemoWorldEntities } from './worldEntitySeed'
import { getSetting, setSetting } from './settings'
import { saveParagraphs } from './paragraphs'
import { logger } from '../logger'

/** 章节种子域日志 scope。 */
const log = logger.scope('chapterSeed')

/**
 * 种子域一次性数据重建（新结构 → 教学书）。
 *
 * 首次启动（或旧库升级）时，把**教学书**「Writer's Forge · 使用指南」重建为唯一示范内容：
 * - 书籍：`seedGuideBook/volumes.ts` 的 `GUIDE_BOOK`（固定 id `guide`）；
 * - 卷 / 章：卷 = 功能分区（`kind='normal'` 正文卷）、章 = 具体功能
 *   （正文块级 JSON：heading + bulletList + bold，经 `saveParagraphs` 挂 `chapter_id`）；
 * - 卷纲：`createVolume` 建卷时**同事务**自动建卷纲行（`scope='volume'`），教学书无需另建；
 * - 大纲：分组 = 功能分区（`createOutlineGroup` → `volumes.kind='group'` 行）、
 *   条目 = 功能要点（`createOutlineItem` 挂分组 id），另有一条置顶独立条目；
 *   条目正文**整条内联**进 `outline_items.content_json`（经 `saveOutlineContent`）。
 *
 * **幂等**：以 `settings` 键 `MIGRATION_KEY` 常量标记，只执行一次；
 * 绝不每次启动清库，也不会因用户之后删空章节而再次填充
 * （更换重灌键可强制老库重灌）。
 *
 * 重灌范围（第 8 批收敛）：仅重建**教学书**（`GUIDE_BOOK.id`）的数据——章节域 / 大纲域 /
 * 示范剧情线 / 演示设定实体；用户自建书籍的正文、卷章、大纲、剧情与设定数据都不受影响。
 *
 * 版本说明：`v3` 反映新结构（卷三 kind、`outline_items` 取代 `outline_chapters`、
 * 段落挂 `chapter_id`、大纲正文内联）；旧格式段落清除（`purgeLegacyParagraphs`）已随
 * `documents` 表消亡一并删除。`v6`（第 8 批）对应统一设定库重构后的教学文案：
 * 子类分类表、自定义子类键值字段、境界体系单表。
 * `v7`（第 9 批）：教学书重灌时**同时重灌演示实体**——在重灌事务内删除
 * `worldEntities:seeded:guide` 标记，随后由 `seedDemoWorldEntities` 物理清空并按书
 * 重播示范实体（含正文文案），最后按名称回填剧情场景关联。
 * `v8`（第 4/4 批）：设定库右栏改为「上段字段 + 下段富文本正文」、名称 / 别名 / 类别
 * 收敛到卡片铅笔弹窗、删除收敛到卡片垃圾桶，教学文案随之同步；键提升让老库也能看到新文案。
 * `v9`（关系语义批）：关系类型新增「属于」（角色恢复关系入口、类型按模块组合过滤、
 * 角色 → 物品自动反向存为「物品属于角色」），教学文案与演示关系同步。
 * `v10`（世界观光联批）：世界观完全不参与关联关系（无入口、不可作为目标），
 * 教学文案删除世界观示范关系并补充势力层级示范；键提升让老库也能看到新文案。
 * `v11`（世界观关系恢复批）：世界观恢复参与关联关系（卡片有入口、可作为目标），
 * 世界观与势力之间可选上下级 / 平级；教学文案与演示关系同步恢复，键提升让老库也能看到新文案。
 * `v12`（境界体系右栏编辑批）：境界体系与其余四域统一——点卡只选中、中栏保持卡片网格，
 * 详情在右栏编辑（上段「体系类型」+ 下段富文本正文 + 底部保存条），卡片恢复铅笔 / 垃圾桶
 * （仍不挂关联关系入口）；教学文案与演示实体正文同步，键提升让老库也能看到新文案。
 * `v13`（卡片标签批）：设定卡片的别名与关系摘要改为圆角标签（chip）展示——别名最多
 * 前三个、关系最多两条 +「+N」，卡片高度随标签换行自适应；教学文案同步，键提升让老库
 * 也能看到新文案。
 * `v14`（关系标签悬停批）：卡片关系标签悬停时显示对端实体简略信息（名称 / 类别 /
 * 正文前 60 字摘要），复用正文高亮的悬停卡；教学文案同步，键提升让老库也能看到新文案。
 * `v15`（右栏双页签批）：大纲 / 剧情模块的右栏改为「大纲 / 剧情」双页签面板——
 * 大纲页签按「单独条目 / 卷纲」浏览并显示条目只读详情，剧情页签按「时间线 / 剧情线」
 * 浏览并显示节点只读详情；剧情节点正文改为不可编辑（移除右栏正文编辑器 / 保存 /
 * 切换守卫），教学文案同步，键提升让老库也能看到新文案。
 * `v16`（页签归属批）：双页签移到**章节模块**右栏（默认「大纲」，两页签常驻、独立记忆）；
 * 大纲模块右栏改为直接显示剧情线浏览（时间线 / 剧情线切换 + 卡片列表 + 只读详情），
 * 剧情模块右栏保持不动；教学文案同步，键提升让老库也能看到新文案。
 * `v17`（形变图标批）：标题栏主题图标与右栏开关图标改由 morphicons + Lucide 渲染——
 * 主题按钮在太阳 / 月亮 / 叶 / 护眼四态间、右栏开关在「显示中 / 已收起」两态间
 * 平滑形变（交互与按钮位置不变）；教学文案同步，键提升让老库也能看到新文案。
 * `v18`（模块栏图标批）：模块栏 11 个图标与标题栏返回 / 设置 / 帮助统一为 Lucide
 * 线性图标；模块栏选中时图标在「未选中 / 选中」两种形态间平滑形变（如书本展开 →
 * 书本加勾），切走时反向变回（交互、按钮尺寸与高亮不变）；教学文案同步，键提升
 * 让老库也能看到新文案。
 * `v19`（标题栏交互批）：标题栏按钮按下有 0.96 轻缩反馈；设置齿轮在进入 / 离开
 * 设置页时形变（返回箭头与帮助仍静态）；激活态按钮悬停保持品牌色底；窄窗下
 * 右栏开关与实际可见性一致并显示为不可用；教学文案同步，键提升让老库也能看到新文案。
 * `v20`（剧情右栏编辑恢复批）：**剧情模块**右栏恢复为节点正文富文本编辑器（底部保存条 +
 * 未保存切换两态确认 + 聚焦编辑时标题栏工具栏 + 状态栏排版组）；章节模块「剧情」页签与
 * 大纲模块右栏仍保持只读列表；教学文案同步，键提升让老库也能看到新文案。
 * `v21`（剧情右栏分区批）：剧情右栏正文区与底部保存条改为两张独立底色卡片
 * （--soft-solid + --line + --r-lg，间距 8px，与设定档案右栏同口径）；交互与保存行为不变，
 * 教学文案同步，键提升让老库也能看到新文案。
 * `v22`（章节右栏大纲浏览批）：章节模块「大纲」页签改为「一个混合下拉（条目 + 卷）+
 * 只读富文本」——选条目单个展示区铺满；选卷上方卷纲、下方细纲下拉（该卷条目）+ 条目正文，
 * 上下各半；展示区完全只读（无光标 / 无工具栏），教学文案同步，键提升让老库也能看到新文案。
 * `v23`（大纲下拉无标签批）：章节模块「大纲」页签去掉下拉上方的「大纲 / 细纲」文字标签
 * （只留下拉控件，无障碍名改由 `aria-label` 提供）；混合下拉中的分组单独标注为「分组 ·」，
 * 选中卷 / 分组都显示卷纲 + 细纲两栏（分组细纲 = 该分组下条目，无条目显示空态），
 * 教学文案同步，键提升让老库也能看到新文案。
 * `v24`（主下拉只列独立条目批）：章节模块「大纲」页签的主下拉改为**只列独立条目**
 * （`volumeId === null`）+ 卷 + 分组——卷内 / 分组内条目只出现在细纲下拉，不再在主下拉
 * 里重复一遍；默认选中第一条独立条目，没有则第一个卷 / 分组；没有任何独立条目与卷时
 * 显示整体空态（不再列出空的「条目」组），教学文案同步，键提升让老库也能看到新文案。
 * `v25`（主下拉跟随当前卷批）：主下拉默认选中改为**优先当前正在编辑的卷**（章节模块 =
 * 选中章所属卷；大纲模块 = 选中的正文卷），其次才是第一条独立条目 / 第一个卷或分组；
 * 切到另一卷时下拉自动跟随，用户手动改选后在下一次卷变化前不被覆盖，教学文案同步，
 * 键提升让老库也能看到新文案。
 * `v26`（左栏默认折叠批）：章节 / 大纲左栏的卷与分组默认全部收起，只自动展开当前
 * 正在编辑项所属的卷 / 分组（独立条目时全收起）；切换编辑项跟随展开、新建项自动展开、
 * 手动展开态会话内保留，教学文案同步，键提升让老库也能看到新文案。
 * `v27`（章节剧情页签筛选批）：章节模块右栏「剧情」页签改为「时间线 + 剧情线」双下拉
 * 筛选 + 紧凑卡片列表 + 悬停正文浮窗（点击只选中）；大纲模块右栏保持原浏览布局，
 * 教学文案同步，键提升让老库也能看到新文案。
 * `v28`（章节剧情页签时间轴批）：章节模块右栏「剧情」页签的紧凑卡片改为与中栏一致的
 * **只读时间轴卡片**（时间列 + 节点圆点 + 纵向连线 + 标题 / 正文 / 实体胶囊，无编辑 /
 * 删除按钮）；双下拉、悬停正文浮窗与点击只选中保持不变，教学文案同步，键提升让老库也能看到新文案。
 * `v29`（大纲右栏时间轴批）：大纲模块右栏改用与章节「剧情」页签**相同的** `PlotFilterPanel`
 * （「时间线 + 剧情线」双下拉筛选 + 只读时间轴卡片 + 实体胶囊 + 悬停正文浮窗，点击只选中）；
 * 原「时间线 / 剧情线」切换 + 分组卡片 + 只读详情面板删除，教学文案同步，键提升让老库也能看到新文案。
 * `v30`（右栏组件统一批）：章节模块右栏两个页签的卡片底座 / 顶部下拉改为**同一套通用组件类**
 * （`pane-region` + `rp-card` + `on-soft`）——下拉距卡缘 6px、控件块高一致，常态为
 * `--control-on-soft` 底 + 描边（聚焦回品牌色环），切页签下拉不跳位；正文内衬与空态口径
 * 与列表空态对齐，页签条高度与面板标题行对齐，教学文案同步，键提升让老库也能看到新文案。
 * `v31`（章节右栏 AI 页签批）：章节模块右栏页签条新增第三个「AI」页签（顺序：大纲 /
 * 剧情 / AI），当前只有一句居中占位提示（功能开发中），不挂任何交互控件；大纲 / 剧情
 * 页签行为不变，教学文案同步，键提升让老库也能看到新文案。
 * `v32`（右栏默认宽度批）：右栏初始宽度 420 → 460（拖拽范围仍 420–750、下限不变），
 * 1121px 视口（右栏可见的最小宽度）下中栏仍留约 337px；教学书补充分隔条拖拽 /
 * 双击恢复默认的说明，键提升让老库也能看到新文案。
 * `v33`（大纲右栏上下分栏批）：章节模块「大纲」页签在选中卷 / 分组时，上下两栏之间
 * 新增可拖拽的水平分隔条（默认 50% / 50%，每栏最小约 80px，双击恢复默认比例；
 * 比例在本次会话内保留、不落库），教学文案同步，键提升让老库也能看到新文案。
 * `v34`（关系属性下线批）：关联关系不再提供「关系属性」键值编辑与展示（备注已足够），
 * `world_ref_attrs` 表随一次性迁移 DROP；教学文案删除相关说明，键提升让老库也能看到新文案。
 * `v35`（关系弹窗五行表单批）：新增关系改为「模块 / 类别 / 可搜索项目 / 关系类型 / 备注」
 * 五行表单（第二行为可输入模糊匹配的组合框，备注约三个下拉高），已添加关系改为按语义码
 * 区分底色的胶囊列表（胶囊内可展开改类型 / 备注、可删除，悬停显示备注）；教学文案同步，
 * 键提升让老库也能看到新文案。
 * `v36`（关系弹窗布局调整批）：「添加关系」按钮移到弹窗 footer 右侧（未选完目标 / 类型时
 * 禁用），表单缩为四行（模块 / 类别 → 具体项目 → 关系类型 → 备注）；删除与弹窗标题重复的
 * 「关联关系」分区 label，已有关联胶囊紧跟备注下方；教学文案同步，键提升让老库也能看到新文案。
 * `v37`（角色子类拆分批）：角色由单条「角色」预设拆为 主角 / 配角 / 龙套 / 反派 四类，
 * 新建与编辑弹窗恢复类别选择（必选），关系弹窗的角色类别下拉同样列出四类；教学文案与
 * 演示角色（砚秋 = 主角、笔灵 = 配角）同步，键提升让老库也能看到新文案。
 * `v38`（出边胶囊读法批）：「关联关系」弹窗已有关系的出边胶囊统一为「关系类型 目标名」，
 * 平级只显示目标名（不再带「·」分隔与反向标签）；教学文案同步，键提升让老库也能看到新文案。
 * `v39`（入边胶囊读法批）：「被引用」入边胶囊改为与出边同款正向读法（「上级 砚境」
 * 「下级 抄书阁」，平级只显示对方名），仅 `belongs_to` 保留反向收尾「砚境 属于我」
 * 以免误读；入边类型下拉的反向读法提示保留，教学文案同步，键提升让老库也能看到新文案。
 * `v40`（物品归属胶囊批）：物品功法的出边 `belongs_to` 胶囊去掉「属于」前缀，只显示
 * 目标名（如「砚秋」），其余模块仍读作「属于 目标名」，入边读法不变；教学文案同步，
 * 键提升让老库也能看到新文案。
 * `v41`（右栏宽度批）：右栏拖拽范围 420–750 → 450–850px、默认宽 460 → 550px；右栏
 * 隐藏断点 1120 → 1240px（默认 550 下固定活动栏需 1238px 才保中栏 ≥300px，断点留
 * 2px 余量），教学文案同步，键提升让老库也能看到新文案。
 * `v42`（胶囊视觉体系统一批）：别名 / 关系 / 类别标签统一为胶囊，底色按所属模块色系 +
 * 分类色阶着色；关系弹窗与剧情时间线的胶囊底色改跟目标实体模块走，关系语义色只保留在
 * 胶囊左侧圆点与描边上；教学文案同步，键提升让老库也能看到新文案。
 * `v43`（实体高亮色阶教学批）：正文实体高亮补充「五类各有自己的色系，同一类里不同分类
 * 的深浅也不同」的教学说明；教学文案同步，键提升让老库也能看到新文案。
 * `v44`（28 色配色体系统一批）：预设子类不再靠同色系深浅区分，改为 23 个预设子类各占
 * 一种独立颜色，用户自定义分类回落 5 个模块色（合计 28 色）；卡片胶囊、关系弹窗胶囊、
 * 剧情角色卡与正文实体高亮统一同一套配色，教学文案同步，键提升让老库也能看到新文案。
 * `v45`（设置页收敛批）：设置页移除左侧分区导航（内容区单列满宽）与强调色切换（含系统
 * 强调色跟随），品牌色仅由 `theme.css` 四套主题定义；教学文案同步，键提升让老库也能看到
 * 新文案。
 * `v46`（设置弹窗批）：设置由独立路由页（`/settings`）改为标题栏齿轮唤起的弹窗——弹窗
 * 背景加强模糊（`blur(10px) saturate(120%)`），齿轮在打开 / 关闭时形变为 ×，遮罩不遮挡
 * 标题栏以保留齿轮可点，引导未完成时齿轮禁用；教学文案同步，键提升让老库也能看到新文案。
 * `v47`（AI 助手批）：章节右栏「AI」页签由占位提示落地为写作助手——设置弹窗新增
 * 「AI 助手」分区（DeepSeek / opencode Go 双服务商、Base URL、动态模型列表 + 自定义模型、
 * API Key 掩码与清除、测试连接），右栏面板支持模型切换（仅本面板）、快捷润色 / 续写 /
 * 改写 / 翻译 / 自定义与自由对话、流式输出与随时停止、自动读取选区上下文、结果回插正文
 * （替换选中 / 插入到光标后）、对话按章保存、密钥经系统安全存储加密；教学文案同步，
 * 键提升让老库也能看到新文案。
 * `v48`（AI 统一输入区批）：章节右栏「AI」页签收敛为单一统一输入区——第一行输入框
 * （Enter 发送 / Shift+Enter 换行），第二行模型 + 功能 + 携带全文 / 携带选中文本 + 发送
 * （生成中变停止）；两个勾选互斥、默认携带选中文本，携带全文送整章正文；所有请求
 * （含只勾上下文、输入框留空的轮次）都进对话历史并按章保存，纯上下文轮次的 user 气泡
 * 显示本轮操作；教学文案同步，键提升让老库也能看到新文案。
 * `v49`（AI 面板精简批）：移除消息角色标签、去掉全文超长提示、对话区改用软底卡片（与
 * 右栏其余列表卡一致）；教学文案同步，键提升让老库也能看到新文案。
 * `v50`（违禁词与内置提示词批）：两项新功能落地——违禁词检测（正文命中处红色波浪下划线、
 * 状态栏「N 处违禁词」计数、标题栏回收站右侧「违禁词库」入口与词库弹窗：粘贴导入 /
 * 三重筛选 / 启停开关 / 内置词只可禁用 / 改动即时生效 / 内置词表随版本发布不联网）与
 * AI 内置提示词（章节右栏 AI 页签输入框上方「携带内置提示词」开关，按书籍频道 + 分类
 * 生成写作风格约束只并入 system prompt，默认开启）；教学文案同步，键提升让老库也能看到新文案。
 * `v51`（品牌色跟随强化批）：恢复「系统强调色驱动品牌色」，但**只对 light / dark 生效**
 * （sage / honey 保留 `theme.css` 静态品牌色，切走时清除内联覆盖）；设置页仍不提供手动选色。
 * 教学文案补「品牌色跟随系统强调色」说明，键提升让老库也能看到新文案。
 * `v52`（OneDrive 云备份批）：设置弹窗末尾新增「OneDrive 云备份」分区（浏览器授权登录 /
 * 退出二次确认、手动整库快照上传、快照 / 上传 / 完成三阶段与取消、文件落 OneDrive 应用专属
 * 目录、clientId 留空回退内置）；「数据与备份」仍是禁用占位。教学书「界面与设置」卷新增该章、
 * 重写数据备份说明，大纲同步补条目，键提升让老库也能看到新文案。
 * `v53`（活动栏筛选与分类删除批）：活动栏五个设定模块图标悬停弹出筛选面板（名称 / 别名
 * 模糊搜索 + 「全部」/ 子类列表 + 匹配条数，切到该模块后生效、条件按模块各自保留）；
 * 自定义分类仅在其下没有条目时才允许删除（有条目时拒绝并提示条数）；教学文案同步，
 * 键提升让老库也能看到新文案。
 * `v54`（模块切换守卫与搜索按钮批）：活动栏图标点击与筛选浮层列表项切换模块统一经
 * 未保存守卫——当前设定条目的右栏正文有改动时先弹「保存并切换 / 放弃并切换」确认；
 * 筛选浮层搜索框右侧新增「搜索」按钮，点击先提交关键词再切到该模块；教学文案同步，
 * 键提升让老库也能看到新文案。
 */

/** 迁移完成标记的 settings key（更换键强制老库重灌种子）。 */
const MIGRATION_KEY = 'chapterData:v54:migrated'

/**
 * 重建教学书的卷 / 章（章节域）。卷序即 `GUIDE_VOLUMES` 顺序；
 * 卷经 `createVolume`（同事务建卷纲行），章经 `createChapter`。
 */
function seedGuideChapters(bookId: string): void {
  for (const volume of GUIDE_VOLUMES) {
    const createdVolume = createVolume(bookId, { kind: volume.kind, title: volume.title })
    for (const chapter of volume.chapters) {
      seedGuideChapter(bookId, createdVolume.id, chapter)
    }
  }
}

/** 建单章并写正文 / pin（`SeedChapter` → `createChapter` 参数映射）。 */
function seedGuideChapter(bookId: string, volumeId: number, chapter: SeedChapter): void {
  const createdChapter = createChapter(bookId, {
    volumeId,
    title: chapter.title ?? '',
    specialPrefix: chapter.specialPrefix ?? null,
    kind: chapter.kind ?? 'normal',
    status: chapter.status
  })
  if (chapter.paragraphs && chapter.paragraphs.length > 0) {
    // 正文直接以 chapterId 落 paragraphs（documents 表已删除）。
    saveParagraphs(createdChapter.id, chapter.paragraphs)
  }
  if (createdChapter.kind === 'special' && chapter.pin !== undefined) {
    // pin 是创建后动作（走 setChapterPin，组内同步重排）。
    setChapterPin(createdChapter.id, chapter.pin)
  }
}

/**
 * 大纲教学数据构建：分组 = `createOutlineGroup`（`volumes.kind='group'`），
 * 条目 = `createOutlineItem(bookId, 分组 id, title)`，正文经 `saveOutlineContent` 内联。
 */
function seedGuideOutline(bookId: string): void {
  for (const group of GUIDE_OUTLINE) {
    const createdGroup = createOutlineGroup(bookId, group.group)
    for (const entry of group.entries) {
      const createdEntry = createOutlineItem(bookId, createdGroup.id, entry.title)
      writeOutlineDoc(createdEntry.id, entry.doc)
    }
  }
  // 置顶独立条目（volumeId = null，不挂任何卷 / 分组）。
  const standalone = createOutlineItem(bookId, null, GUIDE_OUTLINE_STANDALONE.title)
  writeOutlineDoc(standalone.id, GUIDE_OUTLINE_STANDALONE.doc)
}

/** 大纲正文写入（整条内联：`content_json` + `text`，对齐 `saveOutlineContent` 口径）。 */
function writeOutlineDoc(itemId: number, doc: SeedOutlineDoc): void {
  saveOutlineContent(itemId, doc.contentJson, doc.text)
}

/**
 * 剧情教学数据构建：2 线 × 各 3 场景（`GUIDE_PLOT_LINES`），经
 * `createPlotLine` / `createPlotScene` 正式写入（同书 `line_id` 约束由
 * `createPlotScene` 校验；出场实体不落库，由正文自动匹配）。
 */
function seedGuidePlot(bookId: string): void {
  for (const line of GUIDE_PLOT_LINES) {
    const createdLine = createPlotLine(bookId, line.name, {
      lineType: line.lineType,
      lineColor: line.lineColor,
      timelineId: line.timelineId ?? 'default',
      defaultOrigin: line.defaultOrigin ?? ''
    })
    for (const scene of line.scenes) {
      createPlotScene(bookId, createdLine.id, {
        timeText: scene.timeText,
        timeEra: scene.timeEra,
        timeYear: scene.timeYear,
        timeDesc: scene.timeDesc,
        title: scene.title,
        description: scene.description
      })
    }
  }
}

/**
 * 清空**教学书**的章节域 + 大纲域 + 示范剧情线（教学书重灌前的擦除步骤）。
 *
 * 范围（按 `bookId` 隔离，只动教学书）：
 * - 章节域：`paragraphs` / `chapters`；
 * - 大纲域：`outline_items` / `volumes`（章节与大纲共用卷池）；
 * - 剧情域：`plot_lines`（其下 `plot_scenes` 与场景关联随外键级联物理删除）。
 *
 * 顺序**自底向上**（先子后父，不依赖外键级联）：
 * `paragraphs → chapters → outline_items → volumes`，最后清剧情线。
 * 用户自建书籍的正文 / 卷章 / 大纲 / 剧情**不受影响**。
 * 设定数据（统一设定库）不在此函数内清理：演示实体随教学书重灌由
 * `resetChapterDataOnce` 在清完本章节域后清标记并重播（见该函数）。
 */
function clearChapterDomain(db: ReturnType<typeof getDb>, bookId: string): void {
  db.prepare(
    `DELETE FROM paragraphs
     WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)`
  ).run(bookId)
  db.prepare('DELETE FROM chapters WHERE book_id = ?').run(bookId)
  db.prepare('DELETE FROM outline_items WHERE book_id = ?').run(bookId)
  db.prepare('DELETE FROM volumes WHERE book_id = ?').run(bookId)
  // 示范剧情线一并清空：重灌时若不删会追加出重复的剧情线与场景。
  db.prepare('DELETE FROM plot_lines WHERE book_id = ?').run(bookId)
}

/** 灌入教学书：书籍行（幂等：按 id 存在即跳过）+ 卷章 + 大纲 + 剧情。 */
function seedGuideBook(): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO books (id, title, intro, categories, status, coverColor)
     VALUES (@id, @title, @intro, @categories, @status, @coverColor)
     ON CONFLICT(id) DO NOTHING`
  ).run({
    id: GUIDE_BOOK.id,
    title: GUIDE_BOOK.title,
    intro: GUIDE_BOOK.intro,
    categories: JSON.stringify(GUIDE_BOOK.categories),
    status: GUIDE_BOOK.status,
    coverColor: GUIDE_BOOK.coverColor
  })

  seedGuideChapters(GUIDE_BOOK.id)
  seedGuideOutline(GUIDE_BOOK.id)
  seedGuidePlot(GUIDE_BOOK.id)
  // 场景关联不在此处回填：演示实体在 `resetChapterDataOnce` 中随后被清空重建，
  // 实体 id 会变化，故关联由 `seedDemoWorldEntities`（按 key）与
  // `relinkGuidePlotSceneEntities`（按名称）在实体就绪后统一回填。
  // 设定 demo 数据（统一设定库，唯一来源）由 `seedDemoWorldEntities` 在书行灌入后播种。
  // 教学书首启即有默认时间线：列表 + 选中 id（settings JSON）；名称 / 起点落空串，
  // 中文默认名与默认起点由展示层 i18n 兜底（`timeline.defaultName` / `timeline.originDefault`）。
  setSetting(
    `timeline:list:${GUIDE_BOOK.id}`,
    JSON.stringify([{ id: 'default', name: '', origin: '' }])
  )
  setSetting(`timeline:active:${GUIDE_BOOK.id}`, 'default')
}

/**
 * 一次性重建章节数据（幂等，见文件头注释）。
 * 调用点：`database/index.ts` 的 `getDb()`，在建表与 `seedBooksIfEmpty` 之后。
 *
 * 时序（同一事务，任一步失败整体回滚、守卫键不置位 → 下次启动自动重试）：
 * 1. `clearChapterDomain`：清教学书章节域 / 大纲域 / 剧情线；
 * 2. `clearWorldEntitySeedMarker`：删 `worldEntities:seeded:guide`，让演示实体允许重播；
 * 3. `seedGuideBook`：书行（幂等）+ 卷章 + 大纲 + 剧情线；
 * 4. `seedDemoWorldEntities`：物理清空教学书统一设定库实体（子表 / 别名 / 标签 /
 *    自定义键值 / 关系随外键级联）后按新文案重播；
 * 5. `relinkGuidePlotSceneEntities`：实体 id 已变，按名称兜底回填剧情场景关联。
 *
 * 第 4、5 步只作用于 `GUIDE_BOOK.id`，用户自建书籍的设定数据不受影响。
 */
export function resetChapterDataOnce(): void {
  if (getSetting(MIGRATION_KEY) === '1') return

  const db = getDb()

  try {
    db.transaction(() => {
      // 擦除教学书的章节域 / 大纲域 / 示范剧情线（教学书为唯一内容真源，清后重灌）。
      clearChapterDomain(db, GUIDE_BOOK.id)
      // 演示实体随教学书一并重灌：删按书播种标记，使 `seedDemoWorldEntities` 不再跳过。
      clearWorldEntitySeedMarker(GUIDE_BOOK.id)
      // 旧 demo 书籍行清理由 seedBooksIfEmpty（books.ts）负责；此处仅灌教学书。
      seedGuideBook()
      // 实体必须在剧情线之后重播：场景已就绪，`seedGuidePlotSceneEntities` 才能按标题回填。
      seedDemoWorldEntities(GUIDE_BOOK.id)
      // 实体 id 已随重建变化：按名称兜底回填一次（`setPlotSceneEntities` 先删后插，幂等）。
      relinkGuidePlotSceneEntities(GUIDE_BOOK.id)
      setSetting(MIGRATION_KEY, '1')
    })()
  } catch (error) {
    log.error('教学书种子重建失败（事务已回滚）', error)
    throw error
  }

  const books = listBooks()
  log.info('教学书种子重建完成', { books: books.length })
}

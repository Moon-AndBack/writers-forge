# 界面设计语言（Design Language）

> 本文档把渲染层已经稳定使用的视觉规则固化为**可判定**的标准：表面层级、排版、间距、控件高度、列表行与选中态、三态、浮层、动效、分隔线，以及已登记的例外与历史债务。
>
> 约束级别：`MUST` = 必须遵守；`SHOULD` = 默认遵守，偏离须在代码注释说明。硬性条款汇总见 [`AGENTS.md`](../../AGENTS.md) §8；本文档负责**取值、代表位置、例外与债务**。
>
> 真源顺序：`src/renderer/src/styles/theme.css`（主题 / 语义令牌）→ 本文档（组合公式与档位）→ 页面 / 组件 CSS。代码与本文档不一致时：实现偏差按本文档收敛；文档过期则修正本文档。
>
> 最后核对：2026-11-15（圆角两档；阴影 / 动效各两档；控件高 32；材质态面板 / chrome 透明组）

---

## 1. 表面层级

### 1.1 层级表

| 层   | 类 / 选择器                                             | 背景                                                                                                                           | 描边                                              | 圆角            | 内衬                                                              | 阴影                            |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------- | ----------------------------------------------------------------- | ------------------------------- |
| L0   | `.shell` 桌面                                           | `--desk-1/2/3` 渐变；dark 为固定色带                                                                                           | —                                                 | —               | —                                                                 | —                               |
| L1   | `.rp-panel`、编辑区、左右栏                             | 默认 `--pane`；材质态左右栏 / 悬浮活动栏 / 非纸面中栏用 `--surface-pane`；sage / honey 章节 / 大纲中栏用不透明 `--doc-surface` | `--line` / 渐隐线                                 | —               | 8px                                                               | —                               |
| L2   | `.pane-region` 分区容器                                 | `--soft-solid`                                                                                                                 | 无                                                | `--r-lg`（8px） | 6px                                                               | 无                              |
| L3   | `.wf-card`、`.wf-entity-card` 卡片                      | `--soft-solid`                                                                                                                 | `--panel-ring` / `inset 0 0 0 1px --line`（变体） | `--r-lg`（8px） | 14px × 16px                                                       | `--sh-sm`（实体卡为 `--sh-xs`） |
| L4   | `.wf-input`、`.wf-readonly-block` 控件 / 只读块         | `--soft-solid`（普通）/ `--control-on-soft`（软底容器内）                                                                      | 默认无；focus / invalid / checked 用状态线        | `--r-lg`（8px） | 输入 9×12 / 只读块 10×12                                          | 聚焦品牌环；不叠外投影          |
| 浮层 | `.wf-window`、`.wf-select__panel`、`.wf-dropdown__menu` | `--pane`                                                                                                                       | `--panel-ring` / `0 0 0 1px --line`               | `--r-lg`（8px） | 窗口 head 16×20×12 / body 4×20×16 / footer 14×20×18；列表面板 5px | `--sh-sm`                       |

代表位置：

- L1：左右栏 / 面板用 `--pane`；写作中栏（`.editor-pane`）默认 `--pane`，**sage / honey 下只有章节 / 大纲**（`data-module` 判别，含回收站）用 `--doc-surface`（`theme.css`）——light / dark 与 `--pane` 同值，sage / honey 为护眼纸色 `#f0f8f0` / `#faf6e8`；剧情 / 设定五域 / 伏笔 / 灵感 / 时间线沿用 `--pane`。纸面作用域（`.editor-head` / `.editor-scroll` / `.editor-foot` / `.trash-view`）内的 `--soft-solid` 等 5 个软底令牌按本主题基色重派生（`writer.css`），避免焦点底与块级底和纸面同色。**材质态**下左右栏、悬浮活动栏与中栏非纸面模块用 `--surface-pane`（`--pane` 58%），书架页书籍卡与欢迎页引导卡用 `--surface-pane-card`（58%）；面板 / 页面内的 `--soft-solid` / `--soft-hover-solid` / `--soft-press-solid` / `--control-on-soft*` 在同一作用域按 `--text` 混 `transparent` 重派生，面板阴影降为 `--panel-ring`；右栏浮卡改用 `--surface-pane-float`（`--text` 10% 薄雾 + 1px 文字 8% 环，复合约 64.5%，不再与面板同色叠加变实），只读正文块保留 `--surface-pane-card`（58%）以维持可辨识边界；sage / honey 章节 / 大纲纸面、固定态活动栏（§9 #11）与所有浮层保持不透明（§9 #32 / #34）。
- L2：`.pane-region`（`src/renderer/src/styles/components/surface.css:145-149`，`--soft-solid` + `padding: 6px` + `--r-lg`）；右栏字段卡 / 保存条 / 页签卡（`--soft-solid` 直接落在 `--pane` 上，无外描边，边界靠明度差 + 间距）。
- L3：`.wf-card`（`surface.css:16-28`）、`.wf-card__body`（`surface.css:122-127`，`padding: 14px 16px`）、`.wf-entity-card`（`components/entity-card.css:16-26`）。
- L4：`.on-soft .wf-input`（`components/form.css:146-150`，仅 `--control-on-soft` 底，无描边）、`.wf-readonly-block`（`surface.css:155-159`，`10px 12px` + `--control-on-soft` 底，无描边）。
- 浮层：`.wf-window`（`components/window.css:9-25`）、`__body`（`window.css:88`）、`__footer`（`window.css:106`）。

### 1.2 规则

- **MUST** 同一区域只使用一种表面语言：`--pane`（材质态 `--surface-pane`）上的分区用 `--soft-solid`；`--soft-solid` 上的控件 / 只读块用 `--control-on-soft`；不得在同一容器内混用两套底色。
- **MUST** 直接落在栏容器（`--pane` / `--surface-pane` / `--doc-surface`）上的软底分区、字段卡、保存条、页签卡不加外描边；边界由 `--soft-solid` 与底色的明度差 + 间距承担。`--soft-solid` 之上需要再分层时，用 `--pane` 内容卡或 `--control-on-soft`（默认态无描边，`--control-on-soft-line` 仅用于 focus / invalid / checked 等状态线）。
- **MUST** 同色软底不得再套同色软底卡。需要再分层时改用 `--control-on-soft`、`--pane`，或仅用描边 / 间距分区。
- **MUST** 组件填充默认用不透明令牌（`--*-solid`、`--pane`、`--control-on-soft`）；`--soft` 等半透明档只允许用于确需透出下层的浮层（当前 2 处：`writer-ai-markdown.css` 2）。**材质态新增例外**只有三处：左右栏 / 悬浮活动栏与 light / dark（以及 sage / honey 非纸面模块）中栏可用 `--surface-pane`（`--pane` 58%），标题栏 / 状态栏与书架工具条控件可用 `--chrome-*` 薄雾，书架书籍卡、欢迎页引导卡与右栏只读正文块可用 `--surface-pane-card`（58%）；前两者必须在同域重派生 L2 / L3 软底，面板之上的浮卡另用 `--surface-pane-float`（`--text` 10% 薄雾 + 1px 文字 8% 环，复合约 64.5%）（§9 #31 / #32 / #34）。固定态活动栏磨砂仍按 §9 #11 保留；sage / honey 章节 / 大纲纸面、`.tb-brand-mark` 与所有浮层不参与。
- **MUST** 圆角只用两档：`--r-lg`（8）用于全部界面元素；`--r-pill`（999）用于胶囊 / chip / 开关轨道 / 进度条 / 滚动条。正圆（`50%`）仅用于图标按钮与状态点；≤3px 的装饰微条与贴平（`0`）为例外。既有微圆角 / 同心内圆字面量仅限 §9 例外表原地保留，不得扩散。

  圆角两档（2026-11-14 统一）：

  | 档位   | 令牌                | 适用范围                                                                               |
  | ------ | ------------------- | -------------------------------------------------------------------------------------- |
  | 界面档 | `--r-lg`（8px）     | 面板 / 卡片 / 浮层 / 控件与按钮 / 列表行 / Tag / Badge / 22px 及以下微控件全部界面元素 |
  | 胶囊档 | `--r-pill`（999px） | 胶囊 / chip / 开关轨道 / 进度条 / 滚动条等全圆                                         |

  CSS 会把 `border-radius` 钳制到 `min(宽, 高) / 2`。16px 元素设 8px 即达上限，渲染为正圆（16px 复选框、16px 分组箭头）；18×20 回收站箭头约 89% 半径（近圆）；22px Tag / Badge 约 73% 半径。这是两档统一的必然结果，不是刻意设计（§9 #20）。

  同心圆角：内圆角 = 外圆角 − 内衬。分段控件 `.wf-seg` 为 8 / 5 / 6（sm 档 8 / 6 / 5），`.mini-seg` 为 8 / 6。

- **MUST** 窗口材质（亚克力 / 云母）下，承载正文 / 可编辑内容的表面保持 alpha = 1：**章节与大纲**的中栏在 sage / honey 主题下不透明（护眼纸面）；其它模块与 light / dark 一致，中栏可降至 `--surface-pane`，但正文对比度不得低于 AA。
- **MUST** 材质态左右栏 / 悬浮活动栏 / 书架书籍卡 / 欢迎页引导卡用 `--surface-pane` / `--surface-pane-card`（`--pane` 58%），其内 L2 / L3 软底必须同域按 `--text` 混 `transparent` 重派生，面板之上的浮卡改用 `--surface-pane-float`（`--text` 10% 薄雾 + 1px 文字 8% 环，复合约 64.5%，严格高于面板），只读正文块保留 `--surface-pane-card`（58%），书架卡 / 欢迎页卡叠在页面底上约 68.5%（亚克力），面板 / 页面阴影降为 `--panel-ring`；标题栏 / 状态栏与书架工具条控件改用 `--chrome-*`（薄雾底 + 1px 描边环）。浮层与固定态活动栏不在此列（后者见 §9 #11）。
- **SHOULD** 层级优先用「底色变化 + 间距 / 描边」表达，不用阴影堆叠区分；同级卡片不得靠不同阴影深度制造伪层级。

---

## 2. 排版

### 2.1 字号令牌

> 真源：`styles/theme.css:18-26`。字号统一为 5 档语义令牌（界面 3 + 展示 2）；展示档只用于已登记位置；封面装饰首字为例外（§9）。

| 令牌              | 值                             | 用途                                       | 代表位置                                                                                     |
| ----------------- | ------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `--fs-micro`      | 10px                           | 微字：Badge / 徽标 / 关闭图标 / 元信息提示 | `components/surface.css:112`、`styles/settings.css:68`、`styles/statusbar.css:24`            |
| `--fs-body`       | 12px                           | **界面基准**：输入 / 按钮 / 紧凑正文       | `components/form.css:36`、`components/button.css:15`、`styles/base.css:22`                   |
| `--fs-title`      | 14px                           | 卡片 / 详情 / 弹窗标题                     | `components/entity-card.css:59`、`components/window.css:70`、`components/empty-state.css:26` |
| `--fs-display`    | 20px                           | 展示档：欢迎页 / 视口占位                  | `styles/welcome.css:40`、`styles/shell.css:206`                                              |
| `--fs-display-lg` | 26px                           | 展示档：文档标题                           | `styles/writer-editor-head.css:50`                                                           |
| 正文              | `calc(18px * var(--doc-zoom))` | 文档正文（随 `--doc-zoom` 缩放）           | `styles/writer-editor-doc.css:3`、`styles/writer-right-outline.css:105`                      |

> 封面装饰首字不属界面字阶：`.bf-cover__char` 34px（`styles/book-form.css:85`），按卡片比例取值，已登记于 §9 例外表。

### 2.2 规则

- **MUST** 界面字号只允许 §2.1 的 5 档令牌（`--fs-micro` / `--fs-body` / `--fs-title` / `--fs-display` / `--fs-display-lg`）；**界面 CSS 不得再写 `font-size` 数值字面量**，也不得新增 16px 或其他中间档。封面装饰首字 34 为已登记例外（§9）。
- **MUST** 正文容器（编辑器、右栏大纲、时间线右栏的起点编辑器与场景详情正文、实体右栏详情正文、回收站详情）使用 `--doc-font` + `calc(18px * var(--doc-zoom))` + `--doc-line` + `--doc-letter`；右栏只读通用底座（如伏笔详情）用 `--doc-font` + `--fs-body` / 1.75，不得把两档混用。
- **MUST** 文本层级：`--text` 主文本；`--text-dim` 次级文本 / 只读正文；`--text-mute` 元信息 / 占位 / 禁用提示。不得用 `opacity` 代替 `--text-mute`。
- **MUST** 字重只允许 400 / 500 / 600 / 700：400 正文；500 控件标签、分段项；600 卡片标题、选中行主名、小节标签；700 页面标题、大数字、强调。
- **SHOULD** 同一层级标题只用一档字号 + 一档字重；不得靠「字号 + 字重 + 字色」三变量叠加制造层级。

---

## 3. 间距与控件高度

### 3.1 间距表

| 场景                       | 值                 | 代表位置                                                               |
| -------------------------- | ------------------ | ---------------------------------------------------------------------- |
| 微间隙（图标–文字 / 胶囊） | 4 / 6px            | `components/entity-card.css:50,76`、`components/segmented.css:57`      |
| 栏内衬 / 面板 gap          | 8px                | `styles/writer-right-panels.css:48-55`                                 |
| 分区内衬                   | 6px                | `components/surface.css:145-148`                                       |
| 树 / 导航行内衬            | 9px × 10px         | `styles/writer-side-chapters.css:35`、`styles/writer-outline.css:24`   |
| 数据行内衬                 | 8px × 10px         | `styles/writer-trash.css:71`                                           |
| 控件横向内衬               | 12px               | `components/form.css:49`、`components/form-select.css:17`              |
| 卡片内衬                   | 14px × 16px        | `components/surface.css:124`、`components/entity-card.css:21`          |
| 弹窗 head                  | 16px × 20px × 12px | `components/window.css:51`                                             |
| 弹窗 body                  | 4px × 20px × 16px  | `components/window.css:88`                                             |
| 弹窗 footer                | 14px × 20px × 18px | `components/window.css:106`                                            |
| 空态（常规 / 紧凑）        | 48×24 / 28×12      | `components/empty-state.css:13-14`、`components/empty-state.css:51-52` |

### 3.2 规则

- **MUST** 间距以 **4px 为基准网格**，默认节奏 **8px**；新增间距优先 4 / 8 / 12 / 16 / 20 / 24 / 32。
- **MUST** 既有半档仅限已登记场景：分区内衬 6、列表行 10、卡片内衬 14×16。不得在其它场景新增 6 / 10 / 14。
- **MUST** 同一行（工具栏、筛选栏、表单行、弹窗底栏）的控件必须**等高**；以该行最高控件对齐，不得用 `align-items: center` 掩盖高度差。
- **MUST** 多行 `Textarea` 独占一行，不参与同行等高；同一行中的单行控件按 §3.3 的 32px 取值。

### 3.3 控件高度表

> **已收敛**：全程序控件统一为单档 **32px**。高度一律由 `--control-h-sm/md/lg`（`theme.css:36-38`，三值同为 32）显式给定（`height` / `min-height`），不再由 `padding + line-height + border` 推导；变量名保留仅为兼容既有引用。

| 控件                              | 高度   | 证据                                                                     |
| --------------------------------- | ------ | ------------------------------------------------------------------------ |
| Button                            | 32     | `components/button.css:13,132-140`                                       |
| Input / Select / Combobox（单行） | 32     | `components/form.css:48,95,100`、`components/form-select.css:16,151-158` |
| SearchInput                       | 32     | `components/form-extras.css:21`                                          |
| IconButton                        | 32     | `components/icon-button.css:14-15,84-85`                                 |
| Segmented                         | 32     | `components/segmented.css:20,117,140`                                    |
| ChipInput                         | 32     | `components/form-extras.css:133`                                         |
| Textarea（多行）                  | 不纳入 | `components/form.css:53-59,104-114`（最小高度维持 62 / 82 / 108）        |

> 局部魔法值 `--cw-control-h`（违禁词弹窗）与 `--ai-ctl-h`（AI 面板）已删除：两处同行控件均走组件自身的 32px 档，不再另存高度变量。
>
> sm / md / lg 修饰类仍保留字号与内衬差异，高度一律 32；设置弹窗、右栏、工具条、主表单不再按档分工。
>
> 例外：标题栏作用域内的分段控件与筛选行控件（分类下拉 / 搜索）为 **28px** 独立档，见 §3.4 与 §9 #33；组件默认及其它使用方仍为 32px。

> **元信息胶囊**（章节 / 大纲编辑头的「最后编辑」「状态」「复制全文」，`styles/writer-editor-head.css` 的 `.doc-meta__pill`）：基础规格为 **32 高 + `--r-lg`（8）圆角 + 左右 12 内衬 + `--fs-body`**。其中位于 `.doc-meta` 行内的「最后编辑」「状态」按 §9 #35 下沉到 **22 高（`--row-act`）**；标题行的「复制全文」不在 `.doc-meta` 内，仍为 **32 高**（`--control-h-md`）。三者圆角同为 8，不再等高是已确认的取舍。22 档行操作与 §9 #17 的纯展示胶囊（Badge / Tag，不可点）不是同一类，不得互相套用。材质按可点性分级：只读项用 `1px var(--line)` 描边、无 hover；可切换项用语义色 16% 混 `--doc-surface`（hover 24%）；可点击项用 `--soft-solid` 软底（hover `--soft-hover-solid` + 文字 `--text-dim` → `--text`）。窄窗时元信息行 `flex-wrap: wrap`（行间距 8），只允许只读项收缩省略。

### 3.4 chrome 尺寸域

状态栏控件 **24** / 活动栏按钮 **36** / 标题栏 **42** / 标题栏内大控件 **28**（px）。

chrome 是界面框架（标题栏、活动栏、状态栏），不受控件 32 约束，高度由框架自身固定：

- 状态栏：本体 36（`styles/statusbar.css:22`），内部控件 24（`styles/statusbar-widgets.css:19,81,233,242,274,297`）。
- 活动栏：模块按钮 36×36（`styles/shell.css:368-372`）。
- 标题栏：42（`styles/shell.css:91`）；标题栏内按钮按自身尺寸规则，不参与正文控件等高。标题栏内分段控件（势力模块「卡片 / 架构」切换）与筛选行控件（分类下拉 / 搜索）使用 **28px** 独立档（`styles/titlebar.css` 的 `.tb-view-switch .wf-seg`、`.tb-dossier-filter .wf-search` / `.wf-select__trigger`，例外 §9 #33），42px 高度内上下各留 7px；其它位置的分段控件、搜索框与下拉仍为 32px。

新增 chrome 控件必须落在对应域内：不得借用控件 32 档，也不得把正文控件塞进 chrome。

---

## 4. 列表行与选中态

### 4.1 行规格

| 类型         | 内衬       | gap | 圆角     | hover                                                |
| ------------ | ---------- | --- | -------- | ---------------------------------------------------- |
| 树 / 导航行  | 9px × 10px | 10  | `--r-lg` | `--soft-hover-solid` + `--dur-fast`                  |
| 数据行       | 8px × 10px | 10  | `--r-lg` | `--soft-hover-solid`；软底卡内用 `--control-on-soft` |
| 树形回收站行 | 9px × 10px | 10  | `--r-lg` | `--control-on-soft`（分栏卡内）                      |

代表位置：`styles/writer-side-chapters.css:31-38`、`styles/writer-outline.css:20-27`、`styles/writer-trash.css:66-80`、`styles/writer-trash-tree.css`。现状中 `.chapter` / `.outline-chapter` 仍写裸 `0.1s`，属 §10 债务；目标统一 `--dur-fast`。

### 4.2 选中态公式

```css
/* 基准：行位于 --pane 上（--select-tint：light / dark / sage 18%，honey 24%） */
.row.is-active {
  background: color-mix(in srgb, var(--brand) var(--select-tint), var(--pane));
}
.row.is-active .row-name {
  color: var(--brand);
  font-weight: 600;
}
.row.is-active .row-dot {
  background: var(--brand);
  opacity: 1;
}

/* 行位于 --soft-solid 卡内：混合目标换成卡片底色 */
.card .row.is-active {
  background: color-mix(in srgb, var(--brand) var(--select-tint), var(--soft-solid));
}

/* 选中行 hover 回落中性底，避免品牌底叠加成第三种颜色 */
.row.is-active:hover {
  background: var(--soft-hover-solid);
}
.card .row.is-active:hover {
  background: var(--control-on-soft);
}
```

- **MUST** 选中只能靠底色 + 品牌文字 / 600 字重 + 图标表达，**不得**以描边、内描边环、外发光等「环」语言作为选中标识；环只保留给 hover 光晕与 `:focus-visible` 焦点环。
- `--select-tint` 定义在 `theme.css` 四主题块（light / dark / sage 18%、honey 24%）。honey 品牌色与纸面明度最接近，需更高混入比例；AI 携带按钮、格式工具条按钮、活动栏筛选 chip 三处非行选中态同口径消费。

已验证位置：`writer-side-chapters.css:57-83`、`writer-outline.css:46-65,124-136`、`writer-trash.css:193-223`。

### 4.3 行操作浮现

```css
.row-actions {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  gap: 1px;
  visibility: hidden;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease);
  background: var(--soft-hover-solid);
  border-radius: var(--r-lg);
}
.row:hover .row-actions,
.row:focus-within .row-actions {
  visibility: visible;
  opacity: 1;
}
```

- 按钮尺寸统一 **22×22**（`.row-act`，`components/row-actions.css:13-16`）。
- 右缘偏移现为 2px（章节 / 大纲 / 树形回收站）；`writer-trash.css` 的 6px 平铺档随伏笔 / 灵感回收站下线已无使用者，按操作组与行内衬取值。
- 主名让位使用 `margin-right`（非 `padding`）：现有 48 / 52 / 72 / 95 四档，按操作组实际宽度推导；新增行先量操作组宽度再取值。
- 代表位置：`writer-side-volumes.css:155-196,207-229`、`writer-outline.css:92-136`、`writer-trash.css:349-377`、`writer-trash-tree.css`。

### 4.4 禁止项

- **MUST NOT** 整行加粗（只允许主名 600）。
- **MUST NOT** 左侧色条、下划线、边框高亮等第二套选中语言。
- **MUST NOT** 只换文字色不换底，或只换底不换主名色。
- **MUST NOT** 在选中品牌底上再叠一层品牌 hover；必须回落 `--soft-hover-solid` / `--control-on-soft`。
- **MUST NOT** 以描边 / 内描边环 / 外发光作为选中标识（同 §4.2）。

### 4.5 焦点环

统一公式：`outline: 2px solid color-mix(in srgb, var(--brand) 60%, transparent)`。

| offset | 适用场景                       | 代表位置                                                            |
| ------ | ------------------------------ | ------------------------------------------------------------------- |
| 1px    | 普通控件 / 按钮                | `components/button.css:53-56`                                       |
| -1px   | 列表行、分段项（内嵌，防裁切） | `styles/writer-trash.css:188-190`、`components/segmented.css:93-96` |
| 2px    | 卡片                           | `styles/bookshelf.css:172-175`                                      |
| 3px    | 色板 / 小圆点（避让选中双环）  | `components/display-extras.css:129-131`                             |
| -2px   | 浮层选项 / 命中块（内嵌）      | `components/overlay.css:89-91`、`styles/clean-word-hits.css:67-69`  |

**MUST** 新代码默认用 offset 1px；只有行 / 卡片 / 色板等需要避让裁切时才用上表对应档位。

---

## 5. 状态呈现（loading / error / empty / content）

### 5.1 判定顺序

```text
无数据：loading → error → empty → content
已有数据：content（错误以行内提示 / 重试条呈现，不替换内容）
```

### 5.2 组件与规格

| 状态    | 组件 / 类                                               | 规格                                                                                                   | 代表位置                                       |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| loading | 暂无统一组件；现有 `.xx-loading` 文案 / `role="status"` | `--fs-body` / `--fs-micro` + `--text-mute`；中栏 `24px 0` 居中，弹窗内左对齐单行；首帧加载不得先闪空态 | `components/dialogs/CleanWordsTable.tsx:69-72` |
| error   | `LoadErrorState`                                        | `EmptyState` + `is-error`；`--danger` 标题 + 重试按钮；`role="alert"`                                  | `components/LoadErrorState.tsx:22-45`          |
| empty   | `EmptyState`                                            | 常规 `min-height: 260px`；`compact` 为 `180px`；图标 40 / 30px                                         | `components/empty-state.css:13,51`             |
| content | 列表 / 表格 / 详情                                      | 错误 / 空态不得进入 `role="list"` 容器                                                                 | `CleanWordsTable.tsx:91-93`                    |

### 5.3 规则

- **MUST** 三态互斥，顺序固定为 loading → error → empty → content；不得先判 error 再判 loading。
- **MUST** 已有数据时，读取错误不得清空 / 替换已展示内容；只在数据为空时展示整页错误态。
- **MUST** 空态一律用 `EmptyState`，错误态一律用 `LoadErrorState`；禁止用空态冒充错误，也禁止自写第二套空态 / 错误态。
- **MUST** 加载态当前存在 7 个 `xx-loading` 类（`entity-card-loading`、`foreshadow-loading`、`inspiration-loading`、`timeline-loading`、`trash-loading`、`ctp-loading`、`cw-loading`），属待收敛债务；新增面板优先复用已有实现，不得再造第 8 套。
- **SHOULD** 300ms 内可完成的读取不闪现 loading；超过 300ms 再展示加载文案 / 骨架。

### 5.4 已确认的不一致（待收敛）

| 位置              | 当前顺序        | 目标顺序        | 证据                                           |
| ----------------- | --------------- | --------------- | ---------------------------------------------- |
| `TrashListView`   | error → loading | loading → error | `components/trash/TrashListView.tsx:237-242`   |
| `CleanWordsTable` | loading → error | 已符合          | `components/dialogs/CleanWordsTable.tsx:69-74` |

---

## 6. 浮层与弹窗

### 6.1 结构

- **MUST** 对话框一律组合 `Modal + Window`：`Modal` 负责遮罩、焦点陷阱、嵌套栈与进出场；`Window` 负责面板、标题区、内容区与底栏。
- **MUST** 弹窗宽度只用四档：**360 / 480 / 640 / 880**（`Window` 的 `sm / md / lg / xl`，`components/window.css:28-43`）。
- **MUST** 底栏按钮 `min-width: 104px`（`--wf-window-action-min-w`，`window.css:14,126-127`）。
- 设置弹窗两栏布局：左侧五项导航（基础偏好 / 外观与主题 / AI 助手 / 本地备份 / 云备份）固定 200px，右侧内容区，两栏同为 `--pane` 底色（无分隔线、无描边）；五个分区常驻渲染仅切换 `display`，一次一页；各分区卡不再有标题与描述，直接以设置行开始；面板高度固定 `min(680px, 100vh - 90px)`，切换分区不跳动。内容列约 614–640px，控件列宽 280（`styles/settings.css`）。
- **MUST** 弹窗底栏按钮顺序为「取消 / 次要动作在左，主动作在右」；危险动作使用 `Button variant="danger"`，不得只换文字色。

### 6.2 z 层级表

> 当前 `--z-hover-card`(970) / `--z-popover`(971) / `--z-popover-nested`(972) / `--z-theme-reveal`(1105) 是令牌；其余仍为字面量，属 §10 债务。

| 场景                          | 当前值      | 代表位置                                                    | 目标令牌                                                                                                 |
| ----------------------------- | ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 下拉菜单 / 主题面板           | 60          | `components/overlay.css:32`、`styles/theme-switcher.css:32` | `--z-dropdown`                                                                                           |
| 活动栏 / 活动胶囊             | 100 / 101   | `styles/shell.css:310,256`                                  | 局部层叠，不入全局档                                                                                     |
| 状态栏弹窗                    | 900         | `styles/statusbar-widgets.css:171`                          | `--z-statusbar`                                                                                          |
| 编辑器格式工具条              | 940         | `components/editor-format.css:38`                           | `--z-format`                                                                                             |
| 悬停卡 / popover / 嵌套详情卡 | 970/971/972 | `styles/theme.css:51-53`                                    | 已令牌化                                                                                                 |
| 活动筛选面板                  | 980         | `styles/shell-activity-filter.css:21`                       | 待归并                                                                                                   |
| Tooltip                       | 990         | `components/tooltip.css:17,53`                              | `--z-tooltip`                                                                                            |
| Modal                         | 1000        | `components/modal.css:14`                                   | `--z-modal`                                                                                              |
| Select / Combobox 面板        | 1040        | `components/form-select.css:87`                             | `--z-select`                                                                                             |
| Toast                         | 1100        | `components/toast.css:14`                                   | `--z-toast`                                                                                              |
| 主题切换全屏覆盖层            | 1105        | `styles/components/theme-reveal.css:24`                     | 已令牌化（`--z-theme-reveal`）；**仅主题切换动画期间存在，动画结束即移除该层**，不得当作常规浮层层级复用 |

**MUST** 新增浮层只允许复用上表档位；确需新档位时先新增 `--z-*` 令牌，再在组件中引用，禁止直接写裸 `z-index`。

- 非浮层层级：`--z-row-raised: 1`（`styles/theme.css:56`，使用处 `styles/writer-side-chapters.css:193`）用于行内拖拽抬升，仅在同一列表内压过让位行，不参与上表浮层档位，也不得挪作浮层使用。

---

## 7. 动效

### 7.1 令牌

| 令牌                     | 值                               | 用途                                                  | 定义位置              |
| ------------------------ | -------------------------------- | ----------------------------------------------------- | --------------------- |
| `--dur-fast`             | 120ms                            | hover / 图标态 / 行操作浮现 / 颜色与背景反馈          | `styles/theme.css:50` |
| `--dur-slow`             | 240ms                            | 位移 / 尺寸变化 / 展开收起 / 进场 / Modal 退场        | `styles/theme.css:51` |
| `--dur-theme-reveal`     | 400ms                            | 主题切换覆盖层三阶段（模糊 / 不透明遮罩 / tint 交叉） | `styles/theme.css:57` |
| `--dur-theme-badge-in`   | 300ms                            | 主题切换图标入场（仅覆盖层图标消费）                  | `styles/theme.css:62` |
| `--dur-theme-badge-hold` | 700ms                            | 主题切换图标完全可见停留（仅覆盖层图标消费）          | `styles/theme.css:63` |
| `--dur-theme-badge-out`  | 250ms                            | 主题切换图标淡出（仅覆盖层图标消费）                  | `styles/theme.css:64` |
| `--ease`                 | `cubic-bezier(0.33, 0, 0.67, 1)` | 对称缓动，交互与主题淡化共用                          | `styles/theme.css:45` |
| `--ease-out`             | `cubic-bezier(0.22, 1, 0.36, 1)` | 进场专用（快出慢入）                                  | `styles/theme.css:79` |

### 7.2 卡片 hover 光晕

```css
/* 常态 hover */
box-shadow:
  0 0 0 1px color-mix(in srgb, var(--brand) 45%, transparent),
  0 0 24px -6px color-mix(in srgb, var(--brand) 50%, transparent),
  var(--sh-sm),
  var(--panel-ring);

/* 选中加强 */
box-shadow:
  0 0 0 2px color-mix(in srgb, var(--brand) 30%, transparent),
  0 0 26px -8px color-mix(in srgb, var(--brand) 55%, transparent),
  var(--sh-sm),
  var(--panel-ring);
```

已验证位置：`styles/components/surface.css:51-57,75-89`、`styles/bookshelf.css:164-170`。

- **MUST** 卡片 hover 只过渡 `box-shadow` / `border-color` / `background` / `color`，不得包含 `transform`。
- **MUST** 卡片 hover 不得使用位移或缩放（`translate / scale / rotate`）。
- **MUST** 功能性 `transform` 允许，但仅限：Modal 进出场（`translateY(8px) scale(0.98)`）、折叠箭头（`rotate(90deg)`）、Switch 滑块（`translateX`）、按钮按压（`translateY(1px)`）、拖拽把手定位、Segmented 滑动指示器（`translate` 平移 + `width` / `height`，时长 `--dur-slow`、缓动 `--ease`）。
- **MUST** 所有动效必须包在 `@media (prefers-reduced-motion: reduce)` 的关闭分支内（全局兜底见 `styles/base.css:113`，组件级见 `modal.css:70-76`、`segmented.css:128-135`）。
- **SHOULD** 入场位移统一 8px（`wf-enter-up` / `wf-exit-down`，`styles/components/motion.css:13-34`）；不得另造 6px / 10px 等位移量。

### 7.3 主题切换

主题切换**不使用** CSS transition，也**不使用** View Transitions，而由 `theme/themeReveal.ts` 动态创建全屏覆盖层（`components/theme-reveal.css`）。不含 IPC 总时长 1.85s（模糊 400 + 不透明遮罩 200 + 图标入场 300 + 停留 700 + 淡出 250；tint 交叉 400 与图标入场并行）：

1. `__blur` 以 `backdrop-filter: blur(12px)` + 旧主题 55% tint 淡入 400ms（此时仍半透明，能看到模糊后的界面）；
2. `__veil` 用旧主题 100% 纯色在 200ms 内升到完全不透明，**此后才**调用主进程 `theme:apply`（`system` 档 await 权威明暗）；遮罩可见期间拦截指针与键盘，apply 超过 3s 未返回则按本地解析强制提交；
3. 拿到权威明暗后**同一帧**写入 `dataset.theme` 与 React 状态（`flushSync`）；`__tint` 用新主题 100% 纯色在 400ms 内从 0 → 1 交叉，`__badge` 显示目标主题大图标（112px、stroke 1.35、品牌 18% 柔光晕），图标以独立时长 300ms 缩放淡入；
4. 图标完全可见后停留 700ms（`--dur-theme-badge-hold`），tint 交叉在停留开始后 100ms 内收尾；停留期间图标 opacity 1 / scale 1，完全静止；
5. 整层与图标同时淡出 250ms（`--dur-theme-badge-out`，图标同时放大），移除遮罩并把 `__veil` / `__tint` 归零。

- 覆盖层 `z-index: var(--z-theme-reveal)`（1105），**仅动画期间存在，动画结束即移除**。
- 减少动效、页面隐藏、覆盖层创建或动画异常时直接切换，不显示遮罩。
- 不得给主题令牌挂 `transition`；遮罩是唯一承载整窗过渡的层。

---

## 8. 分隔线与装饰

### 8.1 渐隐分隔线

```css
/* 窗口内 */
background: linear-gradient(
  to right,
  transparent,
  var(--wf-window-fade-line) 20%,
  var(--wf-window-fade-line) 80%,
  transparent
);

/* 窗口外 */
background: linear-gradient(to right, transparent, var(--line) 20%, var(--line) 80%, transparent);
```

- **MUST** 窗口内用 `var(--wf-window-fade-line)`（定义于 `components/window.css:11`），窗口外用 `var(--line)`。
- **MUST** 几何固定：`height: 1px`、伪元素、两端透明、中段 20%–80% 实色；不得改成 `border-bottom` 后失去渐隐。
- 代表位置：`components/window.css:109-122`、`styles/statusbar.css:30-38`、`styles/writer-right-panels.css:243-251`。

### 8.2 实线与装饰

- **MUST** 实线分隔一律 `1px solid var(--line)`；不得用背景块模拟。
- **MUST** 装饰性渐隐 / 光斑不得承载状态信息；状态必须同时有文本或图标。
- **SHOULD** 卡片 / 行内不再叠加第二层装饰线；用间距或底色分区优先。

---

## 9. 例外登记表

> 例外必须同时满足：① 在本表登记；② 代码处写 `/* 例外：… */`；③ 不扩大使用范围。未登记的字面量视为违规。

| #   | 例外                               | 位置                                                                                                                                                                                                                 | 固定值 / 做法                                                                                                                                                                                                                                                                                                                                                                                                                                        | 理由                                                                                                                                                                    | 边界                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 深色桌面色带                       | `styles/shell.css:67-83`                                                                                                                                                                                             | `#1c1c2b` / `#161616` / `#19202b` 四层不透明渐变                                                                                                                                                                                                                                                                                                                                                                                                     | 斜切色带的渐变框无法由主题令牌组合                                                                                                                                      | 仅 `[data-theme='dark'] .shell`                                                                                                                                                                                                                                                          |
| 2   | 书籍封面 / 状态胶囊固定色          | `styles/bookshelf.css:245-271`                                                                                                                                                                                       | `#5b4de8` / `#0f7b4f` / `#9d5d00` / `#fff`                                                                                                                                                                                                                                                                                                                                                                                                           | sage 下 `--brand` 与 `--ok` 同值、honey 下 `--brand` 与 `--warn` 近色                                                                                                   | 仅 `.book-status.wf-badge`；普通 Badge 不得引用                                                                                                                                                                                                                                          |
| 3   | 主题预览卡镜像值                   | `styles/theme-switcher.css:153-199`                                                                                                                                                                                  | `--mini-pane/surface/text/line/brand` 静态 hex / rgba                                                                                                                                                                                                                                                                                                                                                                                                | 预览必须展示目标主题的静态外观；运行时品牌色可能被系统强调色覆盖                                                                                                        | 仅 `.ts-card--*`                                                                                                                                                                                                                                                                         |
| 4   | 品牌标                             | `styles/shell.css:142-145`、`shell/brandIcon.tsx:29`                                                                                                                                                                 | `linear-gradient(148deg, #0078d4, #005a9e)` + `stroke="#fff"`                                                                                                                                                                                                                                                                                                                                                                                        | 与生成的应用图标逐字同形同色，不随主题变化                                                                                                                              | 仅 `.tb-brand-mark`                                                                                                                                                                                                                                                                      |
| 5   | 头像渐变                           | `components/surface.css:334-342`                                                                                                                                                                                     | `linear-gradient(135deg, var(--brand), var(--brand-2))` + `#fff`                                                                                                                                                                                                                                                                                                                                                                                     | 身份装饰需要品牌渐变；白色文字保证任意底色可读                                                                                                                          | 仅 `.wf-avatar`                                                                                                                                                                                                                                                                          |
| 6   | 滚动条                             | `styles/base.css:70-93`                                                                                                                                                                                              | `rgba(0,0,0,.22/.38)`、`rgba(255,255,255,.2/.35)`                                                                                                                                                                                                                                                                                                                                                                                                    | 原生滚动条不支持 `color-mix` / 主题令牌                                                                                                                                 | 仅 `::-webkit-scrollbar-thumb`                                                                                                                                                                                                                                                           |
| 7   | AI 气泡第三层                      | `styles/writer-ai-message.css:129-140`                                                                                                                                                                               | user 气泡 `--control-on-soft`；assistant 气泡 `--pane`                                                                                                                                                                                                                                                                                                                                                                                               | `--soft-solid` 容器内需要再分层，保证气泡边界                                                                                                                           | 仅 AI 消息气泡                                                                                                                                                                                                                                                                           |
| 8   | 卡片选中勾选徽标                   | `styles/bookshelf.css`（`.book-check`）、`styles/theme-switcher.css`（`.ts-option-check`）                                                                                                                           | 书籍卡 18×18 / 图标 11；主题卡 16×16 / 图标 10；`--r-pill` 正圆 + `var(--brand)` 底 + `#fff` 勾                                                                                                                                                                                                                                                                                                                                                      | 选中去掉描边环后需要第二个可辨信号；徽标是封面 / 卡面上的状态标记，尺寸不属控件与字号体系                                                                               | 仅 `.book-card.is-selected` 与 `.ts-option.is-selected` 的徽标；白勾为品牌底上的固定前景色（同 #12 口径），不得用于普通文本或按钮                                                                                                                                                        |
| 9   | `wf-card--soft.interactive` 只换底 | `components/surface.css:44-62`                                                                                                                                                                                       | hover 仅 `background: --soft-hover-solid`，无光晕                                                                                                                                                                                                                                                                                                                                                                                                    | 柔和底卡片本身无常态阴影，加光晕会显脏                                                                                                                                  | 仅该组合；普通卡片仍走光晕公式                                                                                                                                                                                                                                                           |
| 10  | 胶囊 / 标签预设色板                | `styles/chip-pill-tokens.css:36-71`、`styles/chip-preset-colors.css:39-181`                                                                                                                                          | `--chip-bg/fg/base` 实色 hex                                                                                                                                                                                                                                                                                                                                                                                                                         | 模块 / 子类数据色，需跨主题稳定，且由数据库色板注入                                                                                                                     | 仅 `.chip-m-*` / `.chip-p-*`；新增色进数据库色板                                                                                                                                                                                                                                         |
| 11  | 固定态活动栏轻微磨砂               | `styles/shell.css:336-355`                                                                                                                                                                                           | `backdrop-filter: blur(10px) saturate(140%)` + `--pane` 55%                                                                                                                                                                                                                                                                                                                                                                                          | 经用户确认的特例：固定态在窗口材质（亚克力 / 云母）下需透出桌面渐变                                                                                                     | 仅 `body.act-pinned .activitybar`                                                                                                                                                                                                                                                        |
| 12  | 封面白字 / 活动胶囊白点            | `styles/book-form.css:82`、`styles/bookshelf.css:199,305,323`、`styles/shell.css:287`                                                                                                                                | `#fff`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 固定深色封面 / 品牌底上的文本与指示点，白色对比恒优                                                                                                                     | 仅上述封面 / 活动胶囊内部                                                                                                                                                                                                                                                                |
| 13  | 装饰微条 / 同心内圆 / 头像比例圆角 | `components/segmented.css:44,73,123,127`、`components/surface.css:357,364`、`styles/entity-highlight.css:20`、`styles/writer.css:364`、`styles/clean-word-hits.css:111`、`styles/theme-switcher.css:222,257,294,302` | `1/2/3/5/6/10/16px`                                                                                                                                                                                                                                                                                                                                                                                                                                  | 细分隔 / 分段控件同心内圆 / 头像比例圆角；本轮不重构                                                                                                                    | 仅原地保留；同心内圆必须满足 inner = outer − inset；新增只用 `--r-lg` / `--r-pill`                                                                                                                                                                                                       |
| 14  | `.timeline-origin-head .wf-input`  | `styles/writer-timeline.css:78-86`                                                                                                                                                                                   | `height: auto`（≈45）                                                                                                                                                                                                                                                                                                                                                                                                                                | 字段根承担卡片外观，内衬由 section 提供，高度随内容                                                                                                                     | 仅时间线起点卡头输入框                                                                                                                                                                                                                                                                   |
| 15  | `.dossier-rel-pill__action`        | `styles/writer-dossier-relation.css:111-123`                                                                                                                                                                         | 14×14                                                                                                                                                                                                                                                                                                                                                                                                                                                | 关系胶囊内微操作                                                                                                                                                        | 仅关系胶囊                                                                                                                                                                                                                                                                               |
| 16  | `.dossier-rel-remove`              | `styles/writer-dossier-relation.css:155-170`                                                                                                                                                                         | 18×18                                                                                                                                                                                                                                                                                                                                                                                                                                                | 自定义字段删除微操作                                                                                                                                                    | 仅字段键值行                                                                                                                                                                                                                                                                             |
| 17  | 展示类胶囊                         | `components/surface.css:170-185,240-256`                                                                                                                                                                             | `.wf-tag` 22 / `.wf-badge` 22                                                                                                                                                                                                                                                                                                                                                                                                                        | 展示类，非交互控件；22 与行操作按钮同档                                                                                                                                 | 纯展示；不得用于可点击控件                                                                                                                                                                                                                                                               |
| 18  | `.row-act`                         | `components/row-actions.css:14-17`                                                                                                                                                                                   | `var(--row-act)`（22×22，令牌定义见 `styles/theme.css:39`）                                                                                                                                                                                                                                                                                                                                                                                          | 行操作按钮域，与编辑头元信息胶囊共用同一域内定值，见 §4.3                                                                                                               | 仅行内浮现操作与 `.doc-meta` 内胶囊（#35）                                                                                                                                                                                                                                               |
| 19  | 封面装饰首字                       | `styles/book-form.css:85`                                                                                                                                                                                            | `.bf-cover__char` 34px                                                                                                                                                                                                                                                                                                                                                                                                                               | 按封面卡片比例取值，不属界面字阶                                                                                                                                        | 仅封面首字；不得用于界面文本                                                                                                                                                                                                                                                             |
| 20  | ≤16px 元素的 8px 圆角被钳制        | `components/form.css:212-219`（16px 复选框）、`styles/writer-outline.css:204-213`（16px 分组箭头）、`styles/writer-trash-tree.css:45-53`（18×20 回收站箭头）                                                         | `--r-lg`（8px）→ 实际渲染为正圆 / 近圆                                                                                                                                                                                                                                                                                                                                                                                                               | CSS 把 `border-radius` 钳制到 `min(宽,高)/2`；两档统一的必然结果，不是刻意设计                                                                                          | 仅既有 ≤18px 小控件；不得据此新增小尺寸圆形控件                                                                                                                                                                                                                                          |
| 21  | 组织架构画布缩放控件               | `styles/writer-org-chart.css`（`.org-chart__zoom-btn`）                                                                                                                                                              | 24×24                                                                                                                                                                                                                                                                                                                                                                                                                                                | 画布浮层缩放控件按任务指定与状态栏同档，避免占用画布视野                                                                                                                | 仅组织架构画布缩放控件；不得用于普通工具栏                                                                                                                                                                                                                                               |
| 22  | 16px 原生复选框 / 单选框未选中态   | `components/form.css:206-219`                                                                                                                                                                                        | `1px solid var(--line)`                                                                                                                                                                                                                                                                                                                                                                                                                              | 未选中态无底色差，1px 边框是唯一可辨形态                                                                                                                                | 仅 `.wf-checkbox__box` / `.wf-radio__dot` 未选中态                                                                                                                                                                                                                                       |
| 23  | AI 表格单元格网格线                | `styles/writer-ai-markdown.css:91-97`                                                                                                                                                                                | `1px solid var(--line)`                                                                                                                                                                                                                                                                                                                                                                                                                              | 表格网格线属内容结构，非控件默认描边                                                                                                                                    | 仅 `.ai-md-th` / `.ai-md-td`                                                                                                                                                                                                                                                             |
| 24  | 大纲表格单元格网格线               | `styles/writer-outline-blocks.css:192-200`                                                                                                                                                                           | `1px solid var(--line)`                                                                                                                                                                                                                                                                                                                                                                                                                              | 表格网格线属内容结构，非控件默认描边                                                                                                                                    | 仅大纲只读表格 th / td                                                                                                                                                                                                                                                                   |
| 25  | 右栏只读表格网格线                 | `styles/writer-right-outline.css:280-287`                                                                                                                                                                            | `1px solid var(--line)`                                                                                                                                                                                                                                                                                                                                                                                                                              | 表格网格线属内容结构，非控件默认描边                                                                                                                                    | 仅 `.rp-read` 表格 th / td                                                                                                                                                                                                                                                               |
| 26  | 组织架构画布边界                   | `styles/writer-org-chart.css:91-104`                                                                                                                                                                                 | `1px solid var(--line)`                                                                                                                                                                                                                                                                                                                                                                                                                              | 界定可平移 / 缩放的画布区域                                                                                                                                             | 仅 `.org-chart`                                                                                                                                                                                                                                                                          |
| 27  | 色板任意色块内线                   | `components/display-extras.css:25-35`                                                                                                                                                                                | `inset 0 0 0 1px var(--line)`                                                                                                                                                                                                                                                                                                                                                                                                                        | 任意色块需内线才能在浅 / 深底上辨认                                                                                                                                     | 仅 `.wf-swatch__item`                                                                                                                                                                                                                                                                    |
| 28  | 格式指示条内描边                   | `components/editor-format.css:381-392`                                                                                                                                                                               | `color-mix(in srgb, var(--text) 18%, transparent)`                                                                                                                                                                                                                                                                                                                                                                                                   | 3px 装饰条承载任意字色，需随主题翻转的细边定形                                                                                                                          | 仅 `.wf-format-pop__ind`                                                                                                                                                                                                                                                                 |
| 29  | 开发态展示框                       | `styleguide/styleguide-showcase.css:247-254`                                                                                                                                                                         | `1px solid var(--line)`                                                                                                                                                                                                                                                                                                                                                                                                                              | 开发态样式展示，非产品界面                                                                                                                                              | 仅 `.sg-drawer-frame`                                                                                                                                                                                                                                                                    |
| 30  | 主题切换整窗遮罩                   | `styles/components/theme-reveal.css:45-62,76-97`                                                                                                                                                                     | `backdrop-filter: blur(12px)` + 55% `--desk-solid` tint；图标 112px                                                                                                                                                                                                                                                                                                                                                                                  | 主题切换需在遮罩内完成原生材质与渲染层切换，并完全遮住 DWM 背板跳变                                                                                                     | 仅 `.wf-theme-reveal`；动画期间存在，结束即移除                                                                                                                                                                                                                                          |
| 31  | 材质态 chrome 控件薄雾底           | `styles/material.css`（chrome 控件段）、`styles/theme.css:129-146`、`styles/statusbar-widgets.css:26-45`、`styles/titlebar.css:57-65`                                                                                | 材质态 `--text` 5 / 8 / 11 / 7% 薄雾；`--chrome-active` 品牌 20%（soft 14%）；`--chrome-ring` = 1px `--text` 8%                                                                                                                                                                                                                                                                                                                                      | 标题栏 / 状态栏原为不透明实色条，材质态会完全挡住 DWM；`--pane` 派生在浅色云母上明度差 < 1.02，需用 `--text` 反向派生                                                   | 仅材质态（acrylic / mica）的标题栏 / 状态栏控件与 `.tb-view-switch` 段控；不含浮层、状态栏弹层（`.st-popup`）与图标本体；`none` 回退原不透明值                                                                                                                                           |
| 32  | 材质态左右栏 / 悬浮活动栏半透明    | `styles/material.css`、`styles/theme.css`                                                                                                                                                                            | `--surface-pane` = `--pane` 58%（`--pane-surface-alpha`）；面板上的浮卡用 `--surface-pane-float` = `--text` 10% 薄雾 + 1px 文字 8% 环（复合约 64.5%）；只读正文块与书架卡用 `--surface-pane-card`（58%）；面板内 5 个软底按 `--text` 同域重派生；面板阴影降为 `--panel-ring`                                                                                                                                                                         | 让材质真正参与界面，而非只从栏缝透出；软底不重派生会把 58% 面板重新铺成实色，卡片若与面板同取 58% 同色叠加会复合成 83.4% 实色贴片                                       | 仅 `.sidepane` / `.rightpane` / 悬浮 `.activitybar` 与 **非章节 / 大纲**的 `.editor-pane`（四主题）；**sage / honey 的章节 / 大纲中栏不在例外范围内**；固定态活动栏（#11）与所有浮层不适用                                                                                               |
| 33  | 标题栏分段 / 筛选控件 28px 档      | `styles/titlebar.css`（`.titlebar .tb-view-switch .wf-seg`、`.titlebar .tb-dossier-filter .wf-search` / `.wf-select__trigger`）                                                                                      | 三类控件外层高 28px；Segmented item 随容器 `height: 100%`，thumb 由实测 item 高与 2px 内衬推导为 24px、上下各内缩 2px；搜索框 / 下拉垂直内衬 0，12px / 1.4 行高与 15px 图标 / 18px 清除按钮均在 28px 内                                                                                                                                                                                                                                              | 42px 标题栏内 32px 控件偏挤，28px 上下各留 7px 更贴合；同一筛选行的分类下拉与搜索必须等高（§8.4）                                                                       | 仅 `.titlebar` 作用域内的 `.tb-view-switch` 分段控件与 `.tb-dossier-filter` 筛选行控件；书架工具条 / 弹窗 / 主题面板 / 右栏页签等其它实例仍为 32px                                                                                                                                       |
| 34  | 材质态书架页 / 欢迎页透明          | `styles/material.css`（书架页段 / 软底重派生列表）、`styles/bookshelf.css` 注释、`styles/welcome.css`（材质态卡底）                                                                                                  | 书籍卡与欢迎页引导卡 `--surface-pane-card`（`--pane` 58%；欢迎卡为 `Window` 框架的 `.wf-welcome__card` 实例，由页面 CSS 收窄、`Window` 本体不改（Modal 共用）；亚克力下叠 25% scrim 复合约 68.5%，云母下壁纸贡献 42%）；选中卡 `--brand` 按 `--select-tint` 混卡底（18% 约 65.6% / honey 24% 约 68.9%）；工具条段控 / 搜索 / 排序改用 `--chrome-fill` + `--chrome-ring`（hover 8%、聚焦 / 展开 11%）；页面内软底按主题同域重派生（含 `.wf-welcome`） | 书架页 / 欢迎页不在三栏面板作用域内，卡片与工具条原为不透明实色，材质只从卡片缝隙透出，书籍卡信息区与欢迎卡成了实色贴片；卡片必须比页面底更实，避免满屏卡片「透成一团」 | 仅材质态（acrylic / mica）的 `.bookshelf-view` 与 `.wf-welcome`：书籍卡、欢迎页引导卡、工具条控件与页面内软底；封面画作（`.book-cover`）、状态胶囊（`.book-status`）与封面操作按钮（`.book-actions`）保持不透明；`none` 回退原不透明值；面板上的浮卡不用 `--surface-pane-card`（见 #32） |
| 35  | 编辑头元信息胶囊 22 档             | `styles/writer-editor-head.css`（`.doc-meta .doc-meta__pill`）、`styles/theme.css`（`--row-act`）                                                                                                                    | `height: var(--row-act)`（22）+ `--r-lg`；仅「最后编辑」「状态」两项；标题行「复制全文」仍为 `--control-h-md`（32）                                                                                                                                                                                                                                                                                                                                  | 元信息行需从 32 控件档下沉到行操作档，与标题行按钮形成主次；三项不再等高为已确认的取舍                                                                                  | 仅 `.doc-meta` 作用域内的胶囊；不得扩散到其它可点击控件；22 高低于 WCAG 2.2 的 24×24 AA 基准，需目视确认 12px 字在 22 高内的视觉平衡                                                                                                                                                     |
| 36  | 标题栏分组竖分隔线 2px             | `styles/titlebar.css`（`.tb-sep`）、`components/ui/ActionSeparator.tsx`                                                                                                                                              | `width: 2px` + `height: 16px` + `--r-pill`（钳制后两端 1px 微圆）；`margin: 0 4px`，叠加父容器 `gap: 2px` 后有效间距 6px/侧                                                                                                                                                                                                                                                                                                                          | 1px 竖线在 42px 标题栏的 32px 圆形按钮之间对比过弱，分组边界不清晰；2px 为用户指定统一线宽                                                                              | 仅 `.tb-sep`（`ActionSeparator`）；不得扩散到 §8.1 渐隐分隔线与其它实线分隔                                                                                                                                                                                                              |
| 37  | 表单内隐藏共享字段标签             | `styles/writer-entities-overview.css`（`.wf-entity-detail__form .wf-place-line__label`）                                                                                                                             | `display: none`，标签不生成盒，胶囊左侧多余 gap 随之消失                                                                                                                                                                                                                                                                                                                                                                                             | 属性表已用 `dt` 承担字段名，共享 `PlaceLine` 的内嵌标签重复，且左侧 gap 会让胶囊看起来缩进错位                                                                          | 仅 `.wf-entity-detail__form` 作用域；共享 `place-line.css` 不改，其它调用方不受影响                                                                                                                                                                                                      |
| 38  | AI 状态行 22 高胶囊行              | `styles/writer-ai.css`（`.ai-composer-status__message-tag`、`.wf-iconbtn.ai-composer-status__refresh`）                                                                                                              | 三颗胶囊统一 22（`--row-act`）/ `--r-lg` / `0 10px`：字数与状态为 `Tag`（状态底色走 `.wf-tag--danger/brand/neutral`，不另写颜色）；刷新钮以 `IconButton variant="solid"` 覆写为胶囊（双类 0,2,0 压过 `--sm` 的 32）；**可点击控件仍为 22 高**，热区用 `::after { inset: -1px 0 }` 由 22 外扩到 **24**                                                                                                                                                | 状态行需「若干同规格胶囊并排」，刷新钮若保持控件 32 档会破坏同行等高并撑高整行；22 档与 #18 / #35 同源，热区外扩补足 WCAG 2.5.8 的 24×24 基准                           | 仅 `.ai-composer-status` 作用域内的状态胶囊与刷新钮；不得扩散到其它可点击控件；`Tag` 仍不得直接用于可点击元素（刷新钮是 IconButton 覆写，不是 Tag）                                                                                                                                      |

**卡片类选中已收敛（2026-11-15）**：实体卡（`.wf-card--halo.is-active`）、书籍卡（`.book-card.is-selected`）、主题卡（`.ts-option.is-selected`）均改为「底色 / 标题色 + 勾选徽标 + 外发光」，描边环全部移除；视觉辅助信号见 #8。

---

## 10. 历史债务表

| #   | 债务                                           | 现状                                                                                                                             | 目标                                  | 证据                                                           |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| 1   | 控件高度多档并存（已收敛）                     | 已统一为单档 32（2026-11-14）                                                                                                    | 保持统一，新增控件走 `--control-h-md` | 见 §3.3 各行                                                   |
| 2   | 局部控件高度魔法值（已清理）                   | `--cw-control-h` / `--ai-ctl-h` 已删除；活动栏筛选浮层改走 `--control-h-md`                                                      | 禁止新增                              | `styles/theme.css:36-38`                                       |
| 3   | 16px 中间档                                    | 当前 0 处                                                                                                                        | 保持禁止                              | 2026-11-09 grep；正文 16→18 见 `73a968d`                       |
| 4   | 字号半档密集（已收敛）                         | 已统一为 5 档语义令牌（10 / 12 / 14 / 20 / 26）；界面 CSS 无字号字面量（封面首字 34 除外）                                       | 保持 5 档；新增先复用令牌             | 本文 §2.1；2026-11-13 grep                                     |
| 5   | 裸时长                                         | `0.1s`×42、`0.15s`×43、`0.18s`×27、`0.2s`×15、`0.22s`×11、`0.25s`×1、`0.32s`×8、`0.4s`×1、`180ms`×10（含令牌定义与注释）         | 全部收敛到 `--dur-*` / `--ease*`      | 2026-11-09 grep                                                |
| 6   | z-index 字面量                                 | 仅 970/971/972/1105 令牌化；60/100/101/900/940/980/990/1000/1040/1100 仍为字面量                                                 | 收敛到 `--z-*`（见 §6.2）             | 本文 §6.2                                                      |
| 7   | 三态顺序相反                                   | `TrashListView` error → loading；`CleanWordsTable` loading → error                                                               | 统一 loading → error → empty          | `TrashListView.tsx:237-242`、`CleanWordsTable.tsx:69-74`       |
| 8   | 死代码 `.wf-listitem` / `.list-item`（已清理） | 已删除无 TSX 调用点的规则（2026-11-10）                                                                                          | 保持无死代码                          | 本批提交                                                       |
| 9   | 已移除组件的残留 CSS                           | Accordion / Avatar / Checkbox / Divider / Drawer / Radio 的 CSS 仍在，组件层无 TSX 调用点；Stepper 已删除（2026-11-13）          | 分批清理；清理前不得被新代码引用      | `surface.css`、`display-extras.css`、`overlay.css`、`form.css` |
| 10  | 加载态无统一组件                               | 7 个 `xx-loading` 类并存（entity-card / foreshadow / inspiration / timeline / trash / ctp / cw）                                 | 上提共享 loading 组件                 | 上述 7 个样式文件                                              |
| 11  | `docs/ui/components.md` 陈旧                   | 原写 29 项并列出 8 个不存在的组件                                                                                                | 本批已改为 23 项（21 组件 + 2 钩子）  | 本批文档 diff                                                  |
| 12  | `docs/ui/design-tokens.md` 陈旧                | 原称「令牌只在 theme.css」「唯一硬编码色是 shell.css」「z-index 全部令牌」                                                       | 本批已修正                            | 本批文档 diff                                                  |
| 13  | `--pill-bg-*` 与 `--chrome-*` 并存属过渡态     | `--chrome-*` 默认值镜像 `--pill-bg-solid` / `--pill-bg-hover-solid` / `--soft-*-solid`，两套命名并行；材质态只有 chrome 组转薄雾 | 材质态消费稳定后收敛为单一语义组      | `styles/theme.css:121-138`、`styles/statusbar-widgets.css`     |

---

## 11. 提交前自检

- [ ] 颜色 / 圆角 / 阴影 / 时长 / 缓动是否全部来自令牌？新增字面量是否已登记例外？
- [ ] 正文控件高度是否统一 32？chrome 是否落在 24 / 36 / 42？同一行控件是否等高？
- [ ] 字号是否落在 5 档令牌内？界面 CSS 是否已无字号字面量？正文是否走 `--doc-*`？
- [ ] 列表行内衬、选中态、hover 回落是否符合 §4？
- [ ] 三态顺序是否为 loading → error → empty？已有数据时错误是否未替换内容？
- [ ] 卡片 hover 是否无 `transform`？光晕公式是否与 §7.2 一致？
- [ ] 对话框是否走 `Modal + Window`？其它浮层是否复用既有 z 档位？
- [ ] 是否复制了整份组件，而不是用 props / 插槽 / CSS 变量表达差异？
- [ ] 新增 / 修改界面文案是否走 `t()`（`AGENTS.md` §10）？
- [ ] 若为功能 / 交互变更，是否同步教学书种子（`AGENTS.md` §7.5）？

---

最后核对：2026-11-15

# 界面设计语言（Design Language）

> 本文档把渲染层已经稳定使用的视觉规则固化为**可判定**的标准：表面层级、排版、间距、控件高度、列表行与选中态、三态、浮层、动效、分隔线，以及已登记的例外与历史债务。
>
> 约束级别：`MUST` = 必须遵守；`SHOULD` = 默认遵守，偏离须在代码注释说明。硬性条款汇总见 [`AGENTS.md`](../../AGENTS.md) §8；本文档负责**取值、代表位置、例外与债务**。
>
> 真源顺序：`src/renderer/src/styles/theme.css`（主题 / 语义令牌）→ 本文档（组合公式与档位）→ 页面 / 组件 CSS。代码与本文档不一致时：实现偏差按本文档收敛；文档过期则修正本文档。
>
> 最后核对：2026-11-13（控件单档 36；基线 HEAD `23aadd9`）

---

## 1. 表面层级

### 1.1 层级表

| 层   | 类 / 选择器                                             | 背景                                                      | 描边                                              | 圆角                                         | 内衬                                                              | 阴影                            |
| ---- | ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- |
| L0   | `.shell` 桌面                                           | `--desk-1/2/3` 渐变；dark 为固定色带                      | —                                                 | —                                            | —                                                                 | —                               |
| L1   | `.rp-panel`、编辑区、左右栏                             | `--pane`                                                  | `--line` / 渐隐线                                 | —                                            | 8px                                                               | —                               |
| L2   | `.pane-region` 分区容器                                 | `--soft-solid`                                            | 无                                                | `--r-lg`（8px）                              | 6px                                                               | 无                              |
| L3   | `.wf-card`、`.wf-entity-card` 卡片                      | `--soft-solid`                                            | `--panel-ring` / `inset 0 0 0 1px --line`（变体） | `--r-lg`（8px）                              | 14px × 16px                                                       | `--sh-sm`（实体卡为 `--sh-xs`） |
| L4   | `.wf-input`、`.wf-readonly-block` 控件 / 只读块         | `--soft-solid`（普通）/ `--control-on-soft`（软底容器内） | `--control-on-soft-line`（`inset`）               | 输入 `--r-xs`（4px）/ 只读块 `--r-lg`（8px） | 输入 9×12 / 只读块 10×12                                          | 聚焦品牌环；不叠外投影          |
| 浮层 | `.wf-window`、`.wf-select__panel`、`.wf-dropdown__menu` | `--pane`                                                  | `--panel-ring` / `0 0 0 1px --line`               | `--r-lg`（8px）                              | 窗口 head 16×20×12 / body 4×20×16 / footer 14×20×18；列表面板 5px | `--sh-float` / `--sh-popup`     |

代表位置：

- L2：`.pane-region`（`src/renderer/src/styles/components/surface.css:145-149`，`--soft-solid` + `padding: 6px` + `--r-lg`）。
- L3：`.wf-card`（`surface.css:16-28`）、`.wf-card__body`（`surface.css:122-127`，`padding: 14px 16px`）、`.wf-entity-card`（`components/entity-card.css:16-26`）。
- L4：`.on-soft .wf-input`（`components/form.css:125-130`）、`.wf-readonly-block`（`surface.css:155-160`，`10px 12px` + `--control-on-soft-line` inset 环）。
- 浮层：`.wf-window`（`components/window.css:9-25`）、`__body`（`window.css:88`）、`__footer`（`window.css:106`）。

### 1.2 规则

- **MUST** 同一区域只使用一种表面语言：`--pane` 上的分区用 `--soft-solid`；`--soft-solid` 上的控件 / 只读块用 `--control-on-soft`；不得在同一容器内混用两套底色。
- **MUST** 同色软底不得再套同色软底卡。需要再分层时改用 `--control-on-soft`、`--pane`，或仅用描边 / 间距分区。
- **MUST** 组件填充用不透明令牌（`--*-solid`、`--pane`、`--control-on-soft`）；`--soft` 等半透明档只允许用于确需透出下层的浮层（当前 4 处：`writer-ai.css` 3 + `components/category-manager.css` 1）。
- **MUST** 新增圆角只用 `--r-xs`（4）/ `--r-lg`（8）；胶囊类用 `--chip-pill-radius`（999px）。既有微圆角 / 全圆字面量仅限 §9 例外表原地保留，不得扩散。
- **MUST** Acrylic 材质下，承载正文 / 控件的表面必须保持 alpha = 1；唯一例外是固定态活动栏的轻微磨砂（见 §9 例外表）。
- **SHOULD** 层级优先用「底色变化 + 间距 / 描边」表达，不用阴影堆叠区分；同级卡片不得靠不同阴影深度制造伪层级。

---

## 2. 排版

### 2.1 字号白名单

| 字号      | 用途                                               | 代表位置                                                                                                                                                                 |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9.5px     | 行内微徽标（草稿等）                               | `styles/writer-side-chapters.css:118`                                                                                                                                    |
| 10px      | 极小标签 / 眉题 / 计数                             | `styles/writer-trash.css:59`、`components/surface.css:223`                                                                                                               |
| 10.5px    | 状态栏数字、元信息、胶囊文字                       | `styles/statusbar.css:50`                                                                                                                                                |
| 11px      | 空态说明、紧凑提示                                 | `components/empty-state.css:65`、`styles/statusbar.css:24`                                                                                                               |
| 11.5px    | 辅助元信息、次级说明                               | `styles/settings.css:68`、`styles/statusbar-widgets.css:269`                                                                                                             |
| 12px      | 小号表单控件、紧凑正文                             | `components/form.css:95`、`components/surface.css:135`                                                                                                                   |
| 12.5px    | 卡片正文、列表主名、分段项                         | `components/surface.css:125`、`components/segmented.css:69`                                                                                                              |
| 13px      | **界面基准**：输入、按钮、普通 UI 文本             | `components/form.css:36`、`components/button.css:15`                                                                                                                     |
| 13.5px    | 行标题、章节 / 大纲条目名                          | `styles/writer-side-chapters.css:88`、`styles/writer-right-panels.css:254`                                                                                               |
| 14px      | 卡片标题、大号输入                                 | `components/entity-card.css:59`、`components/form.css:99`                                                                                                                |
| 15px      | 弹窗标题、空态标题                                 | `components/window.css:70`、`components/empty-state.css:26`                                                                                                              |
| 12.8px    | 右栏只读通用底座（非正文跟随；时间线场景详情除外） | `styles/writer-right-outline.css:87`                                                                                                                                     |
| 18×zoom   | 文档正文（`calc(18px * var(--doc-zoom))`）         | `styles/writer-editor-doc.css:3`、`styles/writer-right-outline.css:103`、`styles/writer-timeline.css:78`（起点编辑器）、`styles/writer-timeline.css:177`（场景详情正文） |
| 20 / 22px | 欢迎页标题 / 视口占位标题                          | `styles/welcome.css:40`、`styles/shell.css:206`                                                                                                                          |
| 28px      | 文档 H1                                            | `styles/writer-editor-head.css:50`                                                                                                                                       |

### 2.2 规则

- **MUST** 界面字号只允许上表白名单；**禁止新增 16px 或其他中间档**。当前全库 `font-size: 16px` 为 0 处（2026-11-09 grep 核实）。
- **MUST** 正文容器（编辑器、右栏大纲、时间线右栏的起点编辑器与场景详情正文、回收站详情）使用 `--doc-font` + `calc(18px * var(--doc-zoom))` + `--doc-line` + `--doc-letter`；右栏只读通用底座（如伏笔详情）用 12.8px / 1.75，不得把两档混用。
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
- **MUST** 多行 `Textarea` 独占一行，不参与同行等高；同一行中的单行控件按 §3.3 的 36px 取值。

### 3.3 控件高度表

> **已收敛**：全程序控件统一为单档 **36px**。高度一律由 `--control-h-sm/md/lg`（`theme.css:24-26`，三值同为 36）显式给定（`height` / `min-height`），不再由 `padding + line-height + border` 推导；变量名保留仅为兼容既有引用。

| 控件                              | 高度   | 证据                                                                     |
| --------------------------------- | ------ | ------------------------------------------------------------------------ |
| Button                            | 36     | `components/button.css:13,132-140`                                       |
| Input / Select / Combobox（单行） | 36     | `components/form.css:48,95,100`、`components/form-select.css:16,151-158` |
| SearchInput                       | 36     | `components/form-extras.css:21`                                          |
| IconButton                        | 36     | `components/icon-button.css:14-15,84-85`                                 |
| Segmented                         | 36     | `components/segmented.css:16,105,122`                                    |
| ChipInput                         | 36     | `components/form-extras.css:129`                                         |
| Textarea（多行）                  | 不纳入 | `components/form.css:53-59,104-114`（最小高度维持 62 / 82 / 108）        |

> 局部魔法值 `--cw-control-h`（违禁词弹窗）与 `--ai-ctl-h`（AI 面板）已删除：两处同行控件均走组件自身的 36px 档，不再另存高度变量。
>
> sm / md / lg 修饰类仍保留字号与内衬差异，高度一律 36；设置弹窗、右栏、工具条、主表单不再按档分工。

### 3.4 chrome 尺寸域

状态栏控件 **24** / 活动栏按钮 **36** / 标题栏 **42**（px）。

chrome 是界面框架（标题栏、活动栏、状态栏），不受控件 36 约束，高度由框架自身固定：

- 状态栏：本体 36（`styles/statusbar.css:22`），内部控件 24（`styles/statusbar-widgets.css:19,81,233,242,274,297`）。
- 活动栏：模块按钮 36×36（`styles/shell.css:368-372`）。
- 标题栏：42（`styles/shell.css:91`）；标题栏内按钮按自身尺寸规则，不参与正文控件等高。

新增 chrome 控件必须落在对应域内：不得借用控件 36 档，也不得把正文控件塞进 chrome。

---

## 4. 列表行与选中态

### 4.1 行规格

| 类型         | 内衬       | gap | 圆角     | hover                                                |
| ------------ | ---------- | --- | -------- | ---------------------------------------------------- |
| 树 / 导航行  | 9px × 10px | 10  | `--r-xs` | `--soft-hover-solid` + `--dur-fast`                  |
| 数据行       | 8px × 10px | 10  | `--r-xs` | `--soft-hover-solid`；软底卡内用 `--control-on-soft` |
| 树形回收站行 | 9px × 10px | 10  | `--r-xs` | `--control-on-soft`（分栏卡内）                      |

代表位置：`styles/writer-side-chapters.css:31-38`、`styles/writer-outline.css:20-27`、`styles/writer-trash.css:66-80`、`styles/writer-trash-tree.css`。现状中 `.chapter` / `.outline-chapter` 仍写裸 `0.1s`，属 §10 债务；目标统一 `--dur-fast`。

### 4.2 选中态公式

```css
/* 基准：行位于 --pane 上 */
.row.is-active {
  background: color-mix(in srgb, var(--brand) 12%, var(--pane));
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
  background: color-mix(in srgb, var(--brand) 12%, var(--soft-solid));
}

/* 选中行 hover 回落中性底，避免品牌底叠加成第三种颜色 */
.row.is-active:hover {
  background: var(--soft-hover-solid);
}
.card .row.is-active:hover {
  background: var(--control-on-soft);
}
```

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
  border-radius: var(--r-xs);
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

| 状态    | 组件 / 类                                               | 规格                                                                                  | 代表位置                                       |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| loading | 暂无统一组件；现有 `.xx-loading` 文案 / `role="status"` | 12–12.5px + `--text-mute`；中栏 `24px 0` 居中，弹窗内左对齐单行；首帧加载不得先闪空态 | `components/dialogs/CleanWordsTable.tsx:69-72` |
| error   | `LoadErrorState`                                        | `EmptyState` + `is-error`；`--danger` 标题 + 重试按钮；`role="alert"`                 | `components/LoadErrorState.tsx:22-45`          |
| empty   | `EmptyState`                                            | 常规 `min-height: 260px`；`compact` 为 `180px`；图标 40 / 30px                        | `components/empty-state.css:13,51`             |
| content | 列表 / 表格 / 详情                                      | 错误 / 空态不得进入 `role="list"` 容器                                                | `CleanWordsTable.tsx:91-93`                    |

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
- **MUST** 弹窗底栏按钮顺序为「取消 / 次要动作在左，主动作在右」；危险动作使用 `Button variant="danger"`，不得只换文字色。

### 6.2 z 层级表

> 当前只有 `--z-hover-card`(970) / `--z-popover`(971) / `--z-popover-nested`(972) 是令牌；其余仍为字面量，属 §10 债务。

| 场景                          | 当前值      | 代表位置                                                    | 目标令牌             |
| ----------------------------- | ----------- | ----------------------------------------------------------- | -------------------- |
| 下拉菜单 / 主题面板           | 60          | `components/overlay.css:32`、`styles/theme-switcher.css:32` | `--z-dropdown`       |
| 活动栏 / 活动胶囊             | 100 / 101   | `styles/shell.css:310,256`                                  | 局部层叠，不入全局档 |
| 状态栏弹窗                    | 900         | `styles/statusbar-widgets.css:171`                          | `--z-statusbar`      |
| 编辑器格式工具条              | 940         | `components/editor-format.css:38`                           | `--z-format`         |
| 悬停卡 / popover / 嵌套详情卡 | 970/971/972 | `styles/theme.css:51-53`                                    | 已令牌化             |
| 活动筛选面板                  | 980         | `styles/shell-activity-filter.css:21`                       | 待归并               |
| Tooltip                       | 990         | `components/tooltip.css:17,53`                              | `--z-tooltip`        |
| Modal                         | 1000        | `components/modal.css:14`                                   | `--z-modal`          |
| Select / Combobox 面板        | 1040        | `components/form-select.css:87`                             | `--z-select`         |
| Toast                         | 1100        | `components/toast.css:14`                                   | `--z-toast`          |

**MUST** 新增浮层只允许复用上表档位；确需新档位时先新增 `--z-*` 令牌，再在组件中引用，禁止直接写裸 `z-index`。

- 非浮层层级：`--z-row-raised: 1`（`styles/theme.css:56`，使用处 `styles/writer-side-chapters.css:193`）用于行内拖拽抬升，仅在同一列表内压过让位行，不参与上表浮层档位，也不得挪作浮层使用。

---

## 7. 动效

### 7.1 令牌

| 令牌         | 值                               | 用途                                | 定义位置              |
| ------------ | -------------------------------- | ----------------------------------- | --------------------- |
| `--dur-fast` | 120ms                            | hover / 图标态 / 行操作浮现         | `styles/theme.css:29` |
| `--dur-base` | 180ms                            | 通用交互、进出场、Modal 退场        | `styles/theme.css:30` |
| `--dur-slow` | 240ms                            | 展开 / 拖拽 / 主题淡化 / 分隔条宽度 | `styles/theme.css:31` |
| `--ease`     | `cubic-bezier(0.33, 0, 0.67, 1)` | 对称缓动，交互与主题淡化共用        | `styles/theme.css:26` |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | 进场专用（快出慢入）                | `styles/theme.css:46` |

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
- **MUST** 功能性 `transform` 允许，但仅限：Modal 进出场（`translateY(8px) scale(0.98)`）、折叠箭头（`rotate(90deg)`）、Switch 滑块（`translateX`）、按钮按压（`translateY(1px)`）、拖拽把手定位、Segmented 滑动指示器（`translate` 平移 + `width` / `height`，时长 `--dur-base`、缓动 `--ease`）。
- **MUST** 所有动效必须包在 `@media (prefers-reduced-motion: reduce)` 的关闭分支内（全局兜底见 `styles/base.css:113`，组件级见 `modal.css:70-76`、`segmented.css:128-135`）。
- **SHOULD** 入场位移统一 8px（`wf-enter-up` / `wf-exit-down`，`styles/components/motion.css:13-34`）；不得另造 6px / 10px 等位移量。

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

| #   | 例外                               | 位置                                                                                                                                                                   | 固定值 / 做法                                                    | 理由                                                                  | 边界                                                            |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | 深色桌面色带                       | `styles/shell.css:67-83`                                                                                                                                               | `#1c1c2b` / `#161616` / `#19202b` 四层不透明渐变                 | 斜切色带的渐变框无法由主题令牌组合                                    | 仅 `[data-theme='dark'] .shell`                                 |
| 2   | 书籍封面 / 状态胶囊固定色          | `styles/bookshelf.css:245-271`                                                                                                                                         | `#5b4de8` / `#0f7b4f` / `#9d5d00` / `#fff`                       | sage 下 `--brand` 与 `--ok` 同值、honey 下 `--brand` 与 `--warn` 近色 | 仅 `.book-status.wf-badge`；普通 Badge 不得引用                 |
| 3   | 主题预览卡镜像值                   | `styles/theme-switcher.css:153-199`                                                                                                                                    | `--mini-pane/surface/text/line/brand` 静态 hex / rgba            | 预览必须展示目标主题的静态外观；运行时品牌色可能被系统强调色覆盖      | 仅 `.ts-card--*`                                                |
| 4   | 品牌标                             | `styles/shell.css:142-145`、`shell/brandIcon.tsx:29`                                                                                                                   | `linear-gradient(148deg, #0078d4, #005a9e)` + `stroke="#fff"`    | 与生成的应用图标逐字同形同色，不随主题变化                            | 仅 `.tb-brand-mark`                                             |
| 5   | 头像渐变                           | `components/surface.css:334-342`                                                                                                                                       | `linear-gradient(135deg, var(--brand), var(--brand-2))` + `#fff` | 身份装饰需要品牌渐变；白色文字保证任意底色可读                        | 仅 `.wf-avatar`                                                 |
| 6   | 滚动条                             | `styles/base.css:70-93`                                                                                                                                                | `rgba(0,0,0,.22/.38)`、`rgba(255,255,255,.2/.35)`                | 原生滚动条不支持 `color-mix` / 主题令牌                               | 仅 `::-webkit-scrollbar-thumb`                                  |
| 7   | AI 气泡第三层                      | `styles/writer-ai.css:397-412`                                                                                                                                         | user 气泡 `--control-on-soft`；assistant 气泡 `--pane`           | `--soft-solid` 容器内需要再分层，保证气泡边界                         | 仅 AI 消息气泡                                                  |
| 8   | 书籍卡封面选中加强环               | `styles/bookshelf.css:183-188`                                                                                                                                         | brand 72% 混 `#000` + 62% 外发光 + `26px -10px`                  | 与封面上的编辑 / 删除实心按钮拉开形态与强度                           | 仅 `.book-card.is-selected`                                     |
| 9   | `wf-card--soft.interactive` 只换底 | `components/surface.css:44-62`                                                                                                                                         | hover 仅 `background: --soft-hover-solid`，无光晕                | 柔和底卡片本身无常态阴影，加光晕会显脏                                | 仅该组合；普通卡片仍走光晕公式                                  |
| 10  | 胶囊 / 标签预设色板                | `styles/chip-pill-tokens.css:39-71`、`styles/chip-preset-colors.css:39-181`                                                                                            | `--chip-bg/fg/base` 实色 hex                                     | 模块 / 子类数据色，需跨主题稳定，且由数据库色板注入                   | 仅 `.chip-m-*` / `.chip-p-*`；新增色进数据库色板                |
| 11  | 固定态活动栏轻微磨砂               | `styles/shell.css:336-355`                                                                                                                                             | `backdrop-filter: blur(10px) saturate(140%)` + `--pane` 55%      | 经用户确认的特例：固定态需透出桌面渐变                                | 仅 `body.act-pinned .activitybar`                               |
| 12  | 封面白字 / 活动胶囊白点            | `styles/book-form.css:82`、`styles/bookshelf.css:199,305,323`、`styles/shell.css:287`                                                                                  | `#fff`                                                           | 固定深色封面 / 品牌底上的文本与指示点，白色对比恒优                   | 仅上述封面 / 活动胶囊内部                                       |
| 13  | 既有微圆角 / 胶囊全圆              | `components/segmented.css:18,33`、`components/display-extras.css:142,148`、`components/surface.css:355,362`、`styles/entity-highlight.css:20`、`styles/writer.css:356` | `1/2/3/6/10/16px` 与 `99/999px`                                  | 细分隔 / 分段容器 / 色板与头像残留 / 胶囊全圆；本轮不重构             | 仅原地保留；新增只用 `--r-xs` / `--r-lg` / `--chip-pill-radius` |
| 14  | `.timeline-origin-head .wf-input`  | `styles/writer-timeline.css:78-86`                                                                                                                                     | `height: auto`（≈45）                                            | 字段根承担卡片外观，内衬由 section 提供，高度随内容                   | 仅时间线起点卡头输入框                                          |
| 15  | `.dossier-rel-pill__action`        | `styles/writer-dossier-relation.css:111-123`                                                                                                                           | 14×14                                                            | 关系胶囊内微操作                                                      | 仅关系胶囊                                                      |
| 16  | `.dossier-rel-remove`              | `styles/writer-dossier-relation.css:155-170`                                                                                                                           | 18×18                                                            | 自定义字段删除微操作                                                  | 仅字段键值行                                                    |
| 17  | 展示类胶囊                         | `components/surface.css:170-184,239-254`                                                                                                                               | `.wf-tag` ≈23 / `.wf-badge` ≈21                                  | 展示类，非交互控件，不参与控件等高                                    | 纯展示；不得用于可点击控件                                      |
| 18  | `.row-act`                         | `components/row-actions.css:13-16`                                                                                                                                     | 22×22                                                            | 行操作按钮域，见 §4.3                                                 | 仅行内浮现操作                                                  |

---

## 10. 历史债务表

| #   | 债务                                           | 现状                                                                                                                     | 目标                                  | 证据                                                           |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------- |
| 1   | 控件高度多档并存（已收敛）                     | 已统一为单档 36（2026-11-13）                                                                                            | 保持统一，新增控件走 `--control-h-md` | 见 §3.3 各行                                                   |
| 2   | 局部控件高度魔法值（已清理）                   | `--cw-control-h` / `--ai-ctl-h` 已删除；活动栏筛选浮层改走 `--control-h-md`                                              | 禁止新增                              | `styles/theme.css:24-26`                                       |
| 3   | 16px 中间档                                    | 当前 0 处                                                                                                                | 保持禁止                              | 2026-11-09 grep；正文 16→18 见 `73a968d`                       |
| 4   | 字号半档密集                                   | 11 / 11.5 / 12 / 12.5 / 13 / 13.5 并存                                                                                   | 保留白名单；新增不再加档              | 本文 §2.1                                                      |
| 5   | 裸时长                                         | `0.1s`×42、`0.15s`×43、`0.18s`×27、`0.2s`×15、`0.22s`×11、`0.25s`×1、`0.32s`×8、`0.4s`×1、`180ms`×10（含令牌定义与注释） | 全部收敛到 `--dur-*` / `--ease*`      | 2026-11-09 grep                                                |
| 6   | z-index 字面量                                 | 仅 970/971/972 令牌化；60/100/101/900/940/980/990/1000/1040/1100 仍为字面量                                              | 收敛到 `--z-*`（见 §6.2）             | 本文 §6.2                                                      |
| 7   | 三态顺序相反                                   | `TrashListView` error → loading；`CleanWordsTable` loading → error                                                       | 统一 loading → error → empty          | `TrashListView.tsx:237-242`、`CleanWordsTable.tsx:69-74`       |
| 8   | 死代码 `.wf-listitem` / `.list-item`（已清理） | 已删除无 TSX 调用点的规则（2026-11-10）                                                                                  | 保持无死代码                          | 本批提交                                                       |
| 9   | 已移除组件的残留 CSS                           | Accordion / Avatar / Checkbox / Divider / Drawer / Radio 的 CSS 仍在，组件层无 TSX 调用点；Stepper 已删除（2026-11-13）  | 分批清理；清理前不得被新代码引用      | `surface.css`、`display-extras.css`、`overlay.css`、`form.css` |
| 10  | 加载态无统一组件                               | 7 个 `xx-loading` 类并存（entity-card / foreshadow / inspiration / timeline / trash / ctp / cw）                         | 上提共享 loading 组件                 | 上述 7 个样式文件                                              |
| 11  | `docs/ui/components.md` 陈旧                   | 原写 29 项并列出 8 个不存在的组件                                                                                        | 本批已改为 23 项（21 组件 + 2 钩子）  | 本批文档 diff                                                  |
| 12  | `docs/ui/design-tokens.md` 陈旧                | 原称「令牌只在 theme.css」「唯一硬编码色是 shell.css」「z-index 全部令牌」                                               | 本批已修正                            | 本批文档 diff                                                  |

---

## 11. 提交前自检

- [ ] 颜色 / 圆角 / 阴影 / 时长 / 缓动是否全部来自令牌？新增字面量是否已登记例外？
- [ ] 正文控件高度是否统一 36？chrome 是否落在 24 / 36 / 42？同一行控件是否等高？
- [ ] 字号是否在白名单内？正文是否走 `--doc-*`？
- [ ] 列表行内衬、选中态、hover 回落是否符合 §4？
- [ ] 三态顺序是否为 loading → error → empty？已有数据时错误是否未替换内容？
- [ ] 卡片 hover 是否无 `transform`？光晕公式是否与 §7.2 一致？
- [ ] 对话框是否走 `Modal + Window`？其它浮层是否复用既有 z 档位？
- [ ] 是否复制了整份组件，而不是用 props / 插槽 / CSS 变量表达差异？
- [ ] 新增 / 修改界面文案是否走 `t()`（`AGENTS.md` §10）？
- [ ] 若为功能 / 交互变更，是否同步教学书种子（`AGENTS.md` §7.5）？

---

最后核对：2026-11-13

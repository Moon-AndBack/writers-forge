# AGENTS.md

面向 AI 编码代理的项目级规范。所有改动必须遵守本文件；与用户明确指令冲突时，以用户指令为准。

## 1. 项目概览

`writers-forge` 是基于 Electron + TypeScript + React 的跨平台桌面写作应用：Electron 负责主进程与窗口，React 负责渲染界面，better-sqlite3 负责本地持久化。

技术栈版本要点：

- Electron 44（`electron` ^44.6.0）
- electron-vite 5（`electron-vite` ^5.0.0）
- Vite 7（`vite` ^7.3.7）
- TypeScript 5.9（`typescript` ^5.9.3）
- React 19（`react` / `react-dom` ^19.3.0）
- react-router-dom 7（^7.18.4）
- i18next 26（^26.4.3）+ react-i18next 17（^17.0.16）
- better-sqlite3 13（^13.0.3，N-API 预编译，无需重建）
- ESLint 10（flat config，`eslint.config.mjs`）+ Prettier 3

构建与打包：electron-vite 构建，electron-builder 打包。主进程产物为 CJS（`package.json` 无 `"type": "module"`，入口 `./out/main/index.js`）。

## 2. 目录分层规范

目标目录结构（新功能应向此结构收敛）：

```
src/
  main/                     # 主进程（Node 环境）
    index.ts                # 入口：app 生命周期装配
    window.ts               # 窗口创建/管理
    database/               # 数据访问模块
      index.ts              # 连接单例 getDb()/closeDb() + schema
      documents.ts          # documents 模块：DocumentRow + 增删查
    ipc/
      index.ts              # registerIpc() 聚合
      documents.ts          # documents:list/create/delete handlers
  preload/
    index.ts                # contextBridge 最小暴露
    index.d.ts              # Window.api 类型声明
  renderer/
    index.html
    src/
      main.tsx              # 挂载
      App.tsx               # 布局 + 路由表
      styles/global.css     # 全局样式
      pages/                # 页面级组件（Home/About/Documents）
      i18n/                 # 国际化：config / context / LocaleProvider + locales/{zh-CN,en}
      components/           # 可复用 UI 组件（预留）
```

分层原则：

- **渲染层按「页面 → 组件」分层**：一次路由 / 一屏一个文件放 `pages/`；跨页面复用的 UI 放 `components/`；样式集中在 `styles/`。
- **主进程按「职责模块」分层**：数据访问放 `database/`，IPC 通道放 `ipc/`，窗口管理放 `window.ts`；入口 `index.ts` 只做装配，不堆业务逻辑。
- **preload 保持最小**：只做 `contextBridge` 暴露，类型放 `index.d.ts`。
- 新增功能按模块建目录，禁止把多个职责平铺进单文件。

> 说明：上表为目标结构。当前代码已基本对齐（`src/main` 已拆为 `window.ts` + `database/` + `ipc/`，渲染层含 `pages/` 与 `styles/`）；`components/` 为预留目录，出现可复用 UI 时再建立。

## 3. 文件大小约束（硬性）

- **单个源码文件不得超过 500 行**。达到或接近 500 行时，必须按职责拆分为子模块 / 子组件 / 自定义 hooks 等。
- 拆分原则：单一职责、按领域内聚；拆分后保持导入路径清晰，不得复制粘贴重复逻辑。

## 4. 安全与边界约束

- 若将来重新引入 `template/` 目录，视为只读设计资产，不得修改 / 删除。
- 破坏性操作（删除文件、安装依赖、数据库迁移、生产部署、`git push` 等）需先经用户确认。
- 优先最小改动；`edit` 锚点须逐字精确。
- **使用 Playwright（含 Playwright MCP）进行渲染层 / UI 验证时，一律使用无头（headless）模式**，不得启动有头（headed）浏览器窗口。原因：保持自动化验证稳定、避免弹出窗口干扰用户、适配 CI / 无显示环境。

## 5. 常用命令

- `npm run dev`：开发（electron-vite dev）
- `npm run build`：构建（electron-vite build）
- `npm run typecheck`：类型检查（node + web）
- `npm run lint`：ESLint 检查
- `npm run format`：Prettier 格式化
- `npm run build:win`：Windows 打包（build + electron-builder --win）

**提交钩子只校验不写盘**：`.husky/pre-commit` 用 `git diff --cached --name-only --diff-filter=ACMR -z` 读取暂存文件，按扩展名分组：`*.ts/tsx/js/mjs/cjs/jsx` 跑 `eslint`（无 `--fix`）与 `prettier --check`，`*.css/md/json/yml/yaml/html` 跑 `prettier --check`，最后执行 `npm run typecheck`；不合规即拒绝提交。脚本只读，不 `git stash`、不 `git add`、不写任何文件；提交前先跑 `npm run format`。**禁止**改回 `--fix` / `--write` 或任何会写盘 / 改索引的方案（2026-11 已移除 lint-staged：其 `updateIndex` 以任务前后 `git diff` 字符串比对判断改动文件，而底层 `tinyexec` 按 64KB 管道块解码 UTF-8，跨块的多字节字符被截断成替换符，使未改动文件也被误判并 `git add` 进索引，夹带未暂存改动；`--no-stash` / `--diff` 均无法绕过）。

## 6. 已知事项 / 技术备注

- better-sqlite3 为 N-API 预编译，跨 Node / Electron ABI 稳定，无需 electron-rebuild（`electron-builder.yml` 中 `npmRebuild: false`）。
- `@vitejs/plugin-react` 固定 `^5`（v6 需 Vite 8，与 electron-vite 5 不兼容）。
- 单文件 500 行上限为项目硬约束。

## 7. 测试与验证约束

- **任务完成后禁止编写或运行冒烟测试**：包括临时验证脚本、探针、无头浏览器（Playwright）断言脚本、为验证而临时启动的服务器等。用户已明确「完成后不要写冒烟测试」。
- **仅诊断时允许**：只有在排查缺陷、复现问题、定位回归根因（即「诊断」场景）时，才可编写必要的验证脚本。
- **交付即完成**：日常改动的验收以静态检查（`npm run typecheck`、`npm run lint`、`npm run build`）与代码审查为准，不为「证明完成」额外构建验证基建。
- 确需诊断性验证时，应先在报告中说明诊断理由，验证完成后必须清理全部临时产物（脚本、服务、截图、沙箱目录）。

## 7.5 教学书籍种子维护（发布检查项）

- **教学书是首启唯一书籍**：首次启动（数据目录为空）时，`src/main/database/chapterSeed.ts` 的 `resetChapterDataOnce` 会重灌唯一书籍「Writer's Forge · 使用指南」——卷 = 功能分区、章 = 具体功能，正文为块级 JSON（heading 步骤标题 + bulletList 步骤 + bold 关键词）；大纲域同步建「分组 = 分区、条目 = 功能要点」的教学大纲（另有置顶独立条目）；实体域播种四类示范实体。数据源集中在 `seedGuideBook/`（`volumes.ts` 卷章与书籍元信息、`outline.ts` 大纲内容，`seedGuideBook.ts` 仅聚合导出）与 `seedBlocks.ts`（块构造器 + 大纲整条 JSON 构造）。
- **同步义务（硬性）**：**新增任何功能，或做出不兼容变更（数据结构变更、交互破坏性改动，如按钮位置 / 快捷键 / 流程变化）时，必须同步修改教学书的种子数据**（`seedGuideBook/`，必要时连带 `entitySeed.ts`），保证首次启动的教学书始终反映当前功能集，且教学文案与实际交互（按钮、快捷键、范围、默认值）逐条一致。
- **发布检查**：发布前将「教学书种子是否已随本批功能 / 变更更新」作为检查项核对；教学内容与实现不一致视同缺陷。
- **幂等边界**：种子重灌由 `src/main/database/chapterSeed.ts` 的 `MIGRATION_KEY` 常量（settings 键，当前值见该常量）守卫（只执行一次，不因用户删书重灌）；更换重灌键可强制老库重灌。

## 8. UI 设计规范（视觉系统）

> 详细取值、代表位置、例外与历史债务见 [`docs/ui/design-language.md`](docs/ui/design-language.md)。本节为可判定的硬性约束：**MUST** = 硬性，**SHOULD** = 建议。

### 8.1 单一真源与配色

- **MUST** 颜色、动效时长、缓动只从 `src/renderer/src/styles/theme.css` 的 `--*` 令牌取用；圆角主档用 `--r-xs`（4）/ `--r-lg`（8）；阴影优先用 `--sh-*` / `--panel-ring`。新增不得写颜色 / 时长 / 缓动 / 圆角字面量；卡片光晕公式（§8.8）与已登记例外除外。
- **MUST** 组件填充用不透明 `--*-solid`（或 `--pane` / `--control-on-soft`）；`--soft` 等半透明档只允许用于确需透出下层的浮层，不得用于卡片 / 控件主体。
- **MUST** 任何字面量例外必须同时满足：① 在 `design-language.md` 的「例外登记表」登记；② 在代码处用 `/* 例外：… */` 注明；③ 不扩大使用范围。
- **MUST** Acrylic 材质下，承载正文 / 控件的表面必须保持 alpha = 1；固定态活动栏的轻微磨砂是唯一已登记例外。
- **SHOULD** 语义色只表达状态：`--ok` / `--warn` / `--danger` 不作品牌强调；`--brand` 可被系统强调色覆盖，不作固定插画色。

### 8.2 表面层级

- **MUST** 按五层组织：L0 桌面 `.shell`（`--desk-*`）→ L1 栏 / 编辑区（`--pane`）→ L2 分区（`--soft-solid`，内衬 6px，圆角 `--r-lg`）→ L3 卡片（`--soft-solid`，内衬 14×16，`--r-lg`，`--sh-xs` / `--sh-sm`）→ L4 控件 / 只读块（`--control-on-soft` + `--control-on-soft-line` 内描边，只读块 10×12、输入类 9×12）。浮层独立于五层，用 `--pane` + `--sh-float` / `--sh-popup`。
- **MUST** 同色软底不得再套同色软底卡；需要再分层时改用 `--control-on-soft`、`--pane`，或仅用描边 / 间距分区。
- **MUST** 内衬固定：栏内衬 8px、分区内衬 6px、卡片 14×16px、弹窗 body 4×20×16px（上 / 左右 / 下）；不得在同类容器另立内衬。
- **SHOULD** 层级优先用底色 + 间距 / 描边表达，不用阴影堆叠制造伪层级。

### 8.3 排版

- **MUST** 界面字号只允许：10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15；特殊档 9.5 / 12.8 / 20 / 22 / 28 仅限已登记位置；正文用 `calc(18px * var(--doc-zoom))`。
- **MUST** 不得新增 16px 或其他中间档；新字号需求先复用白名单，确需新增时同步更新 `design-language.md` 白名单并说明用途。
- **MUST** 正文容器（编辑器 / 右栏大纲 / 回收站详情）使用 `--doc-font` + `calc(18px * var(--doc-zoom))` + `--doc-line` + `--doc-letter`；右栏只读通用底座用 12.8px / 1.75。
- **MUST** 文本层级：`--text` 主文本；`--text-dim` 次级 / 只读正文；`--text-mute` 元信息 / 占位 / 禁用提示。不得用 `opacity` 代替 `--text-mute`。
- **SHOULD** 字重只用 400 / 500 / 600 / 700：400 正文；500 控件标签 / 分段项；600 卡片标题 / 选中行主名 / 小节标签；700 页面标题 / 大数字 / 强调。

### 8.4 控件与间距

- **MUST** 同一行（工具栏、筛选栏、表单行、弹窗底栏）的控件必须等高；以最高控件对齐，不得用 `align-items: center` 掩盖高度差。
- **MUST** 控件高度统一三档：**md 38 / sm 30 / lg 44**（px），取自 `--control-h-*`。设置弹窗内全部控件用 **md 38**；**sm 30** 用于右栏 / 工具条 / 密集面板；**lg 44** 用于主表单强调行。现存非控件字面量仅色板 `--lg` 32 与 `.act-filter__search-btn` 40（已登记例外）；`30.8 / 25.4 / 31` 已不存在，新代码不得再引用其它高度值。
- **MUST** chrome 尺寸域独立于三档：状态栏控件 **24** / 活动栏按钮 **36** / 标题栏 **42**（px）。chrome 是界面框架，不受 38 / 30 / 44 约束；新增 chrome 控件必须落在对应域内。
- **MUST** 禁止再写局部控件高度魔法值（如 `--cw-control-h`、`--ai-ctl-h`）；统一由组件尺寸档位或 `--wf-*` 共享变量提供。
- **MUST** 间距以 4px 为基准网格，默认节奏 8px；允许的既有半档仅限分区内衬 6、列表行 10、卡片内衬 14×16；新增间距优先 4 / 8 / 12 / 16 / 20 / 24 / 32。

### 8.5 列表行与选中态

- **MUST** 树 / 导航行内衬 9×10、数据行 8×10、行内 gap 10、圆角 `--r-xs`；同类行不得另立内衬。
- **MUST** 选中态统一公式：`background: color-mix(in srgb, var(--brand) 12%, var(--pane))`（行位于 `--soft-solid` 卡内时混 `--soft-solid`）；主名 `color: var(--brand)` + `font-weight: 600`；状态点转 `--brand`。
- **MUST** 选中行 hover 回落 `--soft-hover-solid`（卡内用 `--control-on-soft`），不得在品牌底上叠加第二层品牌色。
- **MUST** 禁止整行加粗、左侧色条、下划线等第二套选中语言；禁止只换文字色不换底（或反之）的不完整选中态。
- **MUST** 行操作按钮 22×22，绝对定位右缘，`visibility` + `opacity` 在 `:hover` / `:focus-within` 浮现；主名用 `margin-right` 让位（现有 48 / 52 / 72 / 95），不得用 `padding` 让位。
- **MUST** 行 hover 仅过渡背景色，时长用 `--dur-fast`。

### 8.6 状态呈现

- **MUST** 无数据时的判定顺序固定：loading → error → empty → content；loading 必须先于 error / empty，error 必须先于 empty。
- **MUST** 已有数据时，读取错误不得替换已展示内容；错误以行内提示 / 重试条呈现，保留旧数据。
- **MUST** 空态一律用 `EmptyState`（紧凑 180px / 常规 260px），错误态一律用 `LoadErrorState`（danger 标题 + 重试）；禁止用空态冒充错误，或自写第二套空态 / 错误态。
- **SHOULD** 300ms 内可完成的读取不闪现 loading；超过 300ms 再展示加载文案 / 骨架。

### 8.7 浮层与弹窗

- **MUST** 对话框一律组合 `Modal + Window`（`Window` 负责面板 / 标题 / 底栏），不得直接写遮罩 + 面板。
- **MUST** 弹窗宽度只用 360 / 480 / 640 / 880 四档（`Window` 的 sm / md / lg / xl）；底栏按钮 `min-width: 104px`。
- **MUST** 浮层层级只允许使用 `--z-*` 令牌；目标档位：下拉 60 / 状态栏 900 / 格式工具条 940 / tooltip 990 / modal 1000 / select 1040 / toast 1100。当前仅 `--z-hover-card`(970) / `--z-popover`(971) / `--z-popover-nested`(972) 已令牌化，其余字面量待收敛，新代码不得再写裸 `z-index`。
- **SHOULD** 新增浮层落在既有档位之间；不得抢占更高层级，也不得用 `z-index: 9999` 兜底。

### 8.8 动效与卡片 hover

- **MUST** 卡片（书籍卡、主题卡及今后新增的卡片类组件）在鼠标移入 / hover 时**不得**使用位移或缩放（`transform: translate / scale / rotate` 等）；hover 反馈仅允许**颜色 / 描边 / 阴影**变化。
- **MUST** 卡片 hover 统一采用**边缘光晕**：`0 0 0 1px color-mix(in srgb, var(--brand) 45%, transparent)` + `0 0 24px -6px color-mix(in srgb, var(--brand) 50%, transparent)` + `var(--sh-sm)` + `var(--panel-ring)`；选中加强为 `0 0 0 2px color-mix(in srgb, var(--brand) 30%, transparent)` + `0 0 26px -8px color-mix(in srgb, var(--brand) 55%, transparent)` + 基础阴影。
- **MUST** 卡片 hover 的 `transition` 只过渡 `box-shadow` / `border-color` / `background` / `color` 等属性，不得包含 `transform`。
- **MUST** 动效时长只用 `--dur-fast` / `--dur-base` / `--dur-slow`，缓动只用 `--ease` / `--ease-out`；禁止裸 `0.1s` / `0.2s` / `180ms` 等字面量。
- **MUST** 功能性 `transform`（Modal 进出场、折叠箭头、Switch 滑块、按钮按压）允许，但必须包在 `@media (prefers-reduced-motion: reduce)` 的关闭分支内。
- **SHOULD** 入场位移统一 8px（`wf-enter-up` / `wf-exit-down`），不得另造 6px / 10px 等位移量。

### 8.9 分隔线与装饰

- **MUST** 窗口内渐隐分隔线用 `var(--wf-window-fade-line)`，窗口外用 `var(--line)`；几何固定 1px 高、伪元素、`linear-gradient(to right, transparent, <line> 20%, <line> 80%, transparent)`。
- **MUST** 实线分隔一律 `1px solid var(--line)`；不得用背景块模拟可访问的分隔语义。
- **SHOULD** 装饰性渐隐 / 光斑不得承载状态信息；状态必须同时有文本或图标。

### 8.10 禁止清单与交付自检

- **MUST NOT** 以下 12 条：

  1. 卡片 / 行 hover 使用 `transform` 位移或缩放；
  2. 硬编码颜色（`#hex`、`rgb()`、`hsl()`）或裸阴影色值；
  3. 新增白名单外的字号档（尤其 16px）；
  4. 新增局部控件高度魔法值或第四档高度；
  5. 自造第二套选中态（左侧色条 / 下划线 / 整行加粗）；
  6. 裸 `z-index`、裸时长、裸缓动；
  7. 复制整份组件做平行实现（应走 props / 插槽 / CSS 变量）；
  8. 用 `--soft` 等半透明令牌填充卡片 / 控件主体；
  9. 给仅由主题令牌引起的 `color` / `background` / `box-shadow` 挂 `transition`；
  10. 滥用 `backdrop-filter`（仅窗口材质、Modal 遮罩、固定态活动栏允许）；
  11. 用空态冒充错误，或错误态替换已有内容；
  12. 覆盖共享组件样式而不写 `/* 例外：… */` 注释与登记。

- **MUST** 交付前逐条自检：① 颜色 / 圆角 / 阴影 / 时长 / 缓动全部走令牌；② 控件高度落在 38 / 30 / 44；③ 同一行控件等高；④ 列表行内衬与选中态符合 §8.5；⑤ 三态顺序 loading → error → empty；⑥ 卡片 hover 无 `transform`；⑦ 对话框走 `Modal + Window` 且浮层 z 层级用令牌；⑧ 新增字面量例外已登记；⑨ 新增 / 修改文案已走 `t()`（§10）；⑩ 组件复用而非复制（§9）。

## 9. 组件通用化约束

- **通用组件优先**：功能 / 类型相同的组件必须实现为通用共享组件（置于 `src/renderer/src/components/` 或对应共享层），禁止在各页面复制平行实现。
- **差异通过参数 / 插槽表达**：特殊要求通过 props、配置、children / 插槽、CSS 变量或条件类在调用处覆写，**不得**为此复制整份组件。
- **判定标准**：新建组件前先检索是否已存在同类型组件；两处以上出现相同结构 / 行为即应上提共享；重构触碰到同类组件时顺手收敛。
- **例外**：确有不可调和的域差异时允许独立实现，但须在代码注释处登记理由。
- **存量治理**：现存平行实现（如章节 / 大纲两套列表面板）按此约束分批收敛（行为 hook、共享行组件、CSS 收敛优先，域特有逻辑保留在页面层）。

## 10. 国际化（i18n）约束

- **界面文案必须走 `t()`**：新增 / 修改任何面向用户的界面文案，**必须**经 react-i18next 的 `t()` 取用，**不得**硬编码中文字符串（含按钮、标题、提示、空态、`aria-label`、`title`、`placeholder`、`alt`、toast、确认框等一切可感知文本）。
- **资源组织**：文案资源统一放 `src/renderer/src/i18n/locales/<locale>/`，按命名空间（ns）一文件一 ns 对象；组件以 `useTranslation('<ns>')` 加载本 ns，并以同 ns 点分路径取用（如 `t('filter.all')`、`t('dialog.deleteBook.title')`）。跨 ns 场景**应**在组件内多次 `useTranslation`，不要依赖字符串前缀拼接。
- **key 命名规范**：`<group>.<leaf>` 点分小写 camelCase，层级语义化、稳定，不随 UI 微调改名；含插值用 `{{name}}`（如 `t('removeTag', { tag })`）；需内联富文本（如数值加粗）用 `<b>` 标记并配合 `<Trans components={{ b: <b /> }} />` 渲染，**不得**在 JSX 里手工拼文案与标签。
- **新增 ns 须双端注册**：新增命名空间时，**必须**同时在 `locales/zh-CN/` 与 `locales/en/` 下建同名文件，并在两处 `locales/*/index.ts` 汇总登记（顺序一致）；**禁止**只加一侧。
- **zh-CN 为真源、en 同步且标注待校**：`zh-CN` 为 key 真源；新增 / 修改 key 时**必须**同步补齐 `en` 译文，`en` 文件头部**必须**保留「**机翻占位 · 待校**」标注。`en` 经 `satisfies ZhCNResources` 与 zh-CN 保持 key 全等——缺 key / 多 key 会在 `npm run typecheck` 报错，**不得**为省事跳译。
- **语言与持久化**：支持档位固定 `zh-CN` / `en`（`SUPPORTED_LOCALES`）。语言真源为 `settings` 表 `locale` 键；缺省按 `navigator.language` 经 `resolveLocale` 规整、回退 `DEFAULT_LOCALE`（`zh-CN`）。切换语言**必须**经 `LocaleProvider` 三处同步（i18next + `document.documentElement.lang` + `settings.locale` 落库），**不得**在别处另存语言状态。
- **类型安全以 zh-CN 为准**：`i18n/types.d.ts` 的 `CustomTypeOptions`（`defaultNS: 'common'`、`resources: ZhCNResources`）为 `t()` 提供 key 补全与校验；新增 key 后若类型报错，**应**修资源而非放宽类型。
- **不译项（保持原文）**：品牌标识「Writer's Forge」、用户 / 演示数据（书稿正文、示例卷章名）、分类枚举 `BOOK_CATEGORIES` 与封面色 `COVER_COLORS[].label`（数据常量，与主进程镜像同步）。以上**不得**拆进 i18n 资源。
- **二期边界（本期不纳入 i18n，保持中文原文）**：章 / 卷中文数字编号（「第X章」「卷X」）、相对时间（「刚刚 / N 分钟前 / N 小时前 / N 天前」）、主进程日志与种子数据。以上为已知技术债，**不要**顺手改动，待专门批次统一处理。
- **`<html lang>` 首帧**：`index.html` 静态首帧写 `lang="zh-CN"`，运行期由 `LocaleProvider` 校正为实际语言；新增页面**不得**自行改写 `document.documentElement.lang`。

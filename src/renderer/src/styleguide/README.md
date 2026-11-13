# Style Guide（组件样式展示页）

开发期组件画廊：直接渲染**真实 React 组件**，用于观察通用 UI 套件在四套主题下的样子。
不属于产品功能，不进入构建产物。

## 如何打开

1. `npm run dev` 启动 electron-vite（Electron 窗口会正常打开）。
2. 在**外部浏览器**访问 dev server 的 `/styleguide.html`，例如：

   ```
   http://localhost:5173/styleguide.html
   ```

   端口以 `npm run dev` 终端输出的 `Local:` 为准（5173 被占用时 vite 会自动改用其他端口）。

3. 页面顶部可切换「跟随系统 / 亮色 / 暗色 / 浅绿 / 浅黄」，选择写入
   `localStorage['styleguide:theme']`，刷新后保留。展示页不读写应用 `settings` 表，
   也不触发正式主题的 View Transition。

> 也可在 Electron 开发者工具 Console 执行
> `location.href = 'http://localhost:5173/styleguide.html'` 后手动返回，但推荐用外部浏览器，
> 避免把应用窗口导航离开正式入口。

## 范围

- **通用 UI 套件**（`src/renderer/src/components/ui/`）：
  Badge / Button / Card / ChipInput / ColorSwatchPicker / Combobox / Dropdown / FormField /
  IconButton / Input / Modal / Progress / SearchInput / Segmented / Select / Splitter /
  Switch / Tag / Textarea / Toast（hook）/ Tooltip（hook）/ Window / EntityStyleCard。
- **状态组件**（`src/renderer/src/components/`）：EmptyState / LoadErrorState。
- **死代码专页**：Checkbox / Radio / Accordion / Avatar / Divider / Drawer —— 这些类名只剩
  CSS，没有 TSX 实现，页面上以「无 TSX 实现 · 请勿使用」醒目标注，仅用于观察与后续清理决策。

**不包含**应用外壳（活动栏 / 标题栏 / 状态栏）与业务域组件（编辑器、大纲、剧情、时间线、
设定档案等）。它们依赖页面上下文与数据，不属于「组件样式」范畴。

### 为什么没有 Splitter

`Splitter` 组件自身不 `import` 任何 CSS，其 `.splitter` 规则位于
`src/renderer/src/styles/writer.css`（写作页三栏布局域）。为了让展示页保持独立，
本页不引入整套写作布局样式，因此 Splitter 只记录类名与行为说明，不做视觉展示。
如需查看实际效果，请在写作页拖动分栏。

## 为什么是 dev-only

`electron.vite.config.ts` 的 renderer 未配置额外 `rollupOptions.input`，electron-vite 构建时
只以 `src/renderer/index.html` 为入口。`styleguide.html` 仅由 Vite dev server 按根目录静态
文件提供，因此：

- `npm run build` 的 `out/` 中**不会**出现 `styleguide.html`；
- 打包后的应用没有该页面，也不增加安装包体积；
- 展示页可自由 import 任何组件而无需担心生产树摇与 chunk 划分。

## 为什么不用 `template/`

AGENTS §4 把 `template/` 定义为**只读设计资产**，且 ESLint / 工具链默认忽略该目录。
把可执行代码放进 `template/` 会同时违反「只读」与「可维护」两条约束，故使用独立目录
`src/renderer/src/styleguide/`，入口放在 `src/renderer/styleguide.html`。

## 文案与 i18n 豁免

展示页是**开发工具**，面向开发者，文案直接写简体中文，不接入 `t()` / `useTranslation`。
这不适用于 AGENTS §10 对**面向用户界面文案**的强制要求。

但页面仍会 `await initI18n('en')`：`Tag` / `Window` / `Select` / `Combobox` / `Splitter`
等组件内部无条件调用 `useTranslation`，且组件内建文案（关闭按钮 aria-label、空候选提示等）
需要真实资源包才能渲染。固定英文同时可顺带验证 `en` 资源 key 完整。

## 维护约定

- **新增 / 修改通用 UI 组件时，同步更新本页对应分区**：至少补一个默认态示例，
  有 variant / size / tone / 状态时补齐矩阵；类名写进 `Demo` 的 `classes`。
- 只 import 真实组件，**不要**在展示页手写 HTML 复刻（死代码分区除外——那里本来就没有 TSX）。
- 展示页自身样式（`styleguide.css` / `styleguide-showcase.css`）只允许使用
  `styles/theme.css` 的 `--*` 令牌：不写裸颜色 / 圆角 / 阴影 / 时长 / 缓动 / z-index；
  卡片与示例块 hover 不得使用 `transform`。
- 布局保持「header 不浮动 + 内容区内部滚动」，不要引入 `position: sticky` / `fixed`
  或新的浮层层级。
- 新增死代码样式时，在 `sections/legacy.tsx` 补一块并标注「无 TSX 实现 · 请勿使用」；
  若后续补齐了 TSX 实现，应把示例迁到对应分区并从死代码页删除。
- 单文件不超过 500 行；超出时按分区继续拆分。

## 目录

```
src/renderer/styleguide.html              # dev 入口
src/renderer/src/styleguide/
  main.tsx                                # 挂载 + initI18n('en') + 首帧前落主题
  theme.ts                                # 五档主题 / localStorage / matchMedia
  ThemeBar.tsx                            # 顶部主题条
  StyleguideApp.tsx                       # 布局 + 六分区装配
  Section.tsx                             # Section / Demo / Sample 通用壳
  styleguide.css                          # 展示页框架样式（纯令牌）
  styleguide-showcase.css                 # 展示零件样式（纯令牌，由 styleguide.css 拆分）
  sections/
    tokens.tsx                            # 设计令牌
    buttons.tsx                           # 按钮与操作
    forms.tsx                             # 表单控件
    surfaces.tsx                          # 卡片与状态
    overlays.tsx                          # 浮层
    legacy.tsx                            # 死代码专页
```

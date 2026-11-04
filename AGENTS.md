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

**提交钩子只校验不写盘**：`.husky/pre-commit` → lint-staged 对暂存文件运行 `eslint`（无 `--fix`）与 `prettier --check`，不合规即拒绝提交，且不改动工作区；提交前先跑 `npm run format`。**禁止**改回 `--fix` / `--write`——钩子写盘会触发 lint-staged 的补丁回放，失配时回退 `git apply --3way`（隐含 `--index`）把未暂存改动写入索引，导致提交夹带 WIP。

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

## 8. UI 交互约束

- **卡片组件禁用「弹起」动画**：卡片（书籍卡、主题卡及今后新增的卡片类组件）在鼠标移入 / hover 时**不得**使用位移或缩放（`transform: translate / scale / rotate` 等）；hover 反馈仅允许**颜色 / 描边 / 阴影**变化。
- 卡片 hover 统一采用**边缘光晕**效果（与书籍卡 `bookshelf.css` 的 `.book-card:hover` 一致，即品牌色描边环 + 外发光增强投影），`transition` 只过渡 `box-shadow` / `border-color` / `background` / `color` 等属性，不得包含 `transform`。

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

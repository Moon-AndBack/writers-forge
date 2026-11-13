# Writer's Forge 文档

面向长篇创作场景的跨平台桌面写作应用：Electron 承载主进程与窗口，React 19 渲染界面，better-sqlite3 负责本地书稿与设定数据的持久化，全部数据离线存放于用户目录。

## 技术栈

| 依赖                    | 版本               | 用途                                     |
| ----------------------- | ------------------ | ---------------------------------------- |
| Electron                | ^44.6.0            | 桌面运行时、主进程与窗口                 |
| electron-vite           | ^5.0.0             | 主进程 / preload / 渲染层三端构建        |
| Vite                    | ^7.3.7             | 渲染层开发服务器与产物打包               |
| React / React DOM       | ^19.3.0            | 渲染层 UI                                |
| react-router-dom        | ^7.18.4            | 页面路由                                 |
| TypeScript              | ^5.9.3             | 全项目类型检查（Node / Web 双 tsconfig） |
| better-sqlite3          | ^13.0.3            | 本地 SQLite 持久化（N-API 预编译）       |
| TipTap                  | ^3.31.4            | 正文富文本编辑器                         |
| i18next / react-i18next | ^26.4.3 / ^17.0.16 | 国际化（zh-CN / en）                     |
| openai                  | ^7.45.1            | AI 服务商客户端                          |
| electron-builder        | ^26.15.3           | 安装包构建                               |
| ESLint / Prettier       | ^10.12.0 / ^3.9.9  | 代码检查与格式化                         |

## 文档索引

| 文档                                                                   | 用途                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`architecture/overview.md`](./architecture/overview.md)               | 进程模型、启动时序、安全边界、目录分层                                |
| [`architecture/database.md`](./architecture/database.md)               | 连接单例、建表装配、迁移、种子、诊断                                  |
| [`architecture/ipc-preload.md`](./architecture/ipc-preload.md)         | 188 个 IPC 通道、7 个主→渲染事件、preload 24 个命名空间               |
| [`ui/window.md`](./ui/window.md)                                       | 窗口创建、尺寸持久化、材质（仅 acrylic / none）、自绘标题栏、宽度磁吸 |
| [`ui/components.md`](./ui/components.md)                               | `components/ui/` 下 23 项通用组件与钩子的 API                         |
| [`ui/design-language.md`](./ui/design-language.md)                     | 表面层级、排版、间距、控件高度、选中态、三态、浮层、动效、例外与债务  |
| [`ui/design-tokens.md`](./ui/design-tokens.md)                         | `styles/theme.css` 令牌体系与四套主题                                 |
| [`conventions/i18n.md`](./conventions/i18n.md)                         | 21 个命名空间、zh-CN 真源、类型校验、双语同步                         |
| [`specs/clean-words.md`](./specs/clean-words.md)                       | 9 类违禁词、1274 条内置词来源、过滤口径与批量启停                     |
| [`specs/database/table-layers.md`](./specs/database/table-layers.md)   | 49 张表的分层规范                                                     |
| [`specs/world-library.md`](./specs/world-library.md)                   | 五类实体统一设定库、23 条子类预设、4 个关系语义码                     |
| [`integrations/ai-and-onedrive.md`](./integrations/ai-and-onedrive.md) | AI 服务商接入与 OneDrive 备份                                         |

## 阅读路径

**新人入门**（先建立全局模型，再动手改代码）

1. [`architecture/overview.md`](./architecture/overview.md) — 搞清楚进程模型与启动时序
2. [`architecture/database.md`](./architecture/database.md) — 理解本地数据从哪来、存到哪
3. [`architecture/ipc-preload.md`](./architecture/ipc-preload.md) — 主进程与界面如何通信

**UI 开发**（改界面、加组件、调样式前必读）

1. [`ui/window.md`](./ui/window.md) — 窗口外壳、标题栏与尺寸行为
2. [`ui/components.md`](./ui/components.md) — 复用现有通用组件，避免平行实现
3. [`ui/design-language.md`](./ui/design-language.md) — 表面层级、控件高度、选中态与三态等视觉规则
4. [`ui/design-tokens.md`](./ui/design-tokens.md) — 令牌与主题的取用方式
5. [`conventions/i18n.md`](./conventions/i18n.md) — 新文案的落位与双语同步

**数据与集成**（改表结构、接外部服务）

1. [`specs/database/table-layers.md`](./specs/database/table-layers.md) — 表的分层与归属
2. [`specs/world-library.md`](./specs/world-library.md) — 设定库的实体与关系语义
3. [`integrations/ai-and-onedrive.md`](./integrations/ai-and-onedrive.md) — AI 与备份链路
4. [`architecture/database.md`](./architecture/database.md) — 回到迁移与诊断的落地细节

## 权威性声明

- **代码是唯一真源**，文档只做解释。`src/`、`package.json`、`AGENTS.md` 与数据库 DDL 的优先级高于任何描述。
- 每篇文档末尾均标注 `最后核对：YYYY-MM-DD`，表示该篇与代码逐条比对过的日期；日期久远不等于内容失效，但需重新核对后再引用。
- 发现文档与代码不一致时，**以代码为准**，并直接提交文档修正（同一提交内说明差异原因），不要保留两种说法。

## 维护规则（摘自 `AGENTS.md`，硬约束）

- **单文件 500 行上限**：源码文件达到或接近 500 行必须按职责拆分，拆分后不得复制粘贴重复逻辑（§3）。
- **界面文案必须走 `t()`**：新增 / 修改任何用户可见文本（按钮、标题、空态、`aria-label`、`title`、`placeholder`、toast 等）不得硬编码中文；新增命名空间须在 `zh-CN` 与 `en` 双端注册（§10）。
- **通用组件不得平行实现**：同类型 UI 优先上提为共享组件，差异用 props / 插槽 / CSS 变量表达（§9）。
- **教学书种子须随功能同步**：新增功能或不兼容变更（数据结构、按钮位置 / 快捷键 / 流程变化）必须同步 `seedGuideBook/`（必要时含 `entitySeed.ts`），教学内容与实际交互不一致视同缺陷（§7.5）。
- **DDL 变更须双写**：任何建表 / 改表都须同步 `src/main/database/diagnostics/expected.ts` 的结构清单与 [`specs/database/table-layers.md`](./specs/database/table-layers.md)，漏写会被结构自检判为问题。
- **卡片 hover 禁用位移 / 缩放**：卡片类组件只允许颜色、描边、阴影变化，统一使用边缘光晕，`transition` 不得包含 `transform`（§8）。
- **视觉系统按 §8 与 `design-language.md`**：颜色 / 圆角 / 阴影 / 时长 / 缓动只取 `theme.css` 令牌；控件高度统一 36；选中态、三态、浮层层级与例外登记按 [`ui/design-language.md`](./ui/design-language.md) 执行。

## 常用命令

| 命令                | 说明                                            |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | 开发模式（electron-vite dev）                   |
| `npm run start`     | 预览已构建产物（electron-vite preview）         |
| `npm run build`     | 构建三端产物到 `out/`                           |
| `npm run icon`      | 生成 `build/icon.svg` / `icon.png` / `icon.ico` |
| `npm run typecheck` | 类型检查（node + web）                          |
| `npm run lint`      | ESLint 检查（flat config）                      |
| `npm run format`    | Prettier 格式化                                 |
| `npm run build:win` | 构建并打包 Windows 安装包到 `dist/`             |

提交钩子（`.husky/pre-commit`）**只校验不写盘**：脚本用 `git diff --cached` 读取暂存文件，对代码运行 `eslint`（不带 `--fix`）与 `prettier --check`，对样式 / 文档 / 配置运行 `prettier --check`，最后执行 `npm run typecheck`；不合规即拒绝提交，且不会改动工作区；提交前请先运行 `npm run format`（自查可用 `npm run format:check`）。

## 数据目录

用户数据（SQLite 数据库、日志、缓存）位置由 `src/main/appPaths.ts` 的 `configureAppPaths()` 决定：

- 打包安装态：系统 `appData` 下的 `Writer's Forge`
- 本地开发态：项目根目录下的 `user_data/`（由 `.gitignore` 忽略）

入口在 app ready 之前调用 `configureAppPaths()` 固定 `userData`，因此开发与正式数据互不干扰；排查问题前先确认自己看的是哪个目录。

## 首次克隆

`build/` 整体不入库（见 `.gitignore`），需先执行 `npm run icon` 生成图标：否则开发态窗口图标缺失，`npm run build:win` 也会因缺少 `build/icon.ico` 失败。安装依赖、镜像配置与更多环境说明见仓库根目录 [`README.md`](../README.md)。

最后核对：2026-11-13

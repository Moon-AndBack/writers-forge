# Writer's Forge

基于 Electron + React 的跨平台桌面写作应用，面向长篇创作场景，使用本地 SQLite 存储书稿与设定数据。

## 技术栈

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| Electron | ^44.6.0 | 桌面应用运行时与主进程 |
| electron-vite | ^5.0.0 | 主进程 / preload / 渲染层构建 |
| Vite | ^7.3.7 | 渲染层开发服务器与打包 |
| React / React DOM | ^19.3.0 | 渲染层 UI |
| react-router-dom | ^7.18.4 | 页面路由 |
| TypeScript | ^5.9.3 | 全项目类型检查 |
| better-sqlite3 | ^13.0.3 | 本地 SQLite 持久化 |
| TipTap | ^3.31.4 | 富文本编辑器 |
| i18next / react-i18next | ^26.4.3 / ^17.0.16 | 国际化（简体中文 / English） |
| electron-builder | ^26.15.3 | 安装包构建 |
| ESLint / Prettier | ^10.12.0 / ^3.9.9 | 代码检查与格式化 |

## 环境要求

- **Node.js ≥ 22**（`better-sqlite3` 的 `engines` 要求）
- npm（随 Node.js 安装）
- Windows / macOS / Linux

`better-sqlite3` 使用 N-API 预编译二进制，跨 Node.js 与 Electron ABI 稳定，无需执行 `electron-rebuild`；`electron-builder.yml` 中已设置 `npmRebuild: false`。

## 快速开始

```bash
npm install
npm run dev
```

仓库内 `.npmrc` 已配置 npmmirror 的 Electron 二进制镜像（`electron_mirror`），仅影响安装阶段，可按需覆盖。

### 生成应用图标（首次克隆后必做）

`build/` 目录未纳入版本库（已在 `.gitignore` 中整体忽略），其中的 `icon.svg` / `icon.png` / `icon.ico` 需在本地生成：

```bash
npm run icon
```

该脚本等价于 `node scripts/generate-icon.mjs`，零依赖，秒级完成。

若跳过此步：开发态窗口图标会缺失（`src/main/window.ts` 读取 `build/icon.png`），且 `npm run build:win` 会因缺少 `build/icon.ico` 导致打包失败。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发模式（electron-vite dev） |
| `npm run build` | 构建主进程、preload 与渲染层产物到 `out/` |
| `npm run typecheck` | 类型检查（Node 与 Web 两套 tsconfig） |
| `npm run lint` | ESLint 检查（flat config） |
| `npm run format` | Prettier 格式化 |
| `npm run build:win` | 构建并打包 Windows 安装包（输出到 `dist/`） |
| `npm run start` | 预览已构建产物（electron-vite preview） |

## 目录结构

```text
src/
├── main/                  # 主进程
│   ├── database/          # SQLite 连接、schema、数据访问与种子数据
│   ├── ipc/               # IPC 通道注册
│   ├── ai/                # AI 服务与 providers
│   ├── onedrive/          # OneDrive 同步
│   └── match/             # 文本匹配
├── preload/               # contextBridge 暴露（api / types）
├── shared/                # 主进程与渲染层共享类型、常量
└── renderer/
    ├── index.html
    └── src/
        ├── pages/         # 书架、欢迎页、写作页（章节 / 卷 / 大纲 / 实体 / 时间线 / 情节）
        ├── components/    # 共享 UI（categories / dialogs / editor / ui）
        ├── shell/         # 标题栏、活动栏、状态栏
        ├── i18n/          # i18next 配置与 zh-CN / en 资源
        ├── styles/        # 全局与组件样式
        ├── theme/         # 主题
        ├── onboarding/    # 首次启动引导
        ├── diagnostics/   # 数据健康自检
        ├── lib/           # 通用工具
        └── assets/        # 字体等静态资源
```

## 项目规范

开发约定见 [`AGENTS.md`](./AGENTS.md)，涵盖目录分层、单文件 500 行上限、i18n 文案管理、Git 提交规范等。

## 许可证

[MIT](./LICENSE) © 2026 Moon-AndBack

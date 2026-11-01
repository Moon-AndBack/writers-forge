import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 应用名（同时用作打包态的 userData 目录名）：
 * - 打包安装（app.isPackaged）→ "Writer's Forge"
 * - 本地开发（electron-vite dev）→ "Writer's Forge Dev"
 */
export const APP_DIR_NAME = app.isPackaged ? "Writer's Forge" : "Writer's Forge Dev"

/** 开发态 userData 目录名：置于项目根目录下，已由 .gitignore 忽略。 */
const DEV_USER_DATA_DIR_NAME = 'user_data'

/**
 * 解析最终 userData 目录（不负责创建）：
 * - 打包安装态：`<系统 AppData>/Writer's Forge`（行为不变）
 * - 本地开发态：`<项目根>/user_data`
 *
 * 项目根取 `app.getAppPath()`：electron-vite dev 以项目根为应用目录启动
 * （`package.json` 的 main 为 `./out/main/index.js`，应用目录即仓库根），
 * 该值在 app ready 之前即可读取，且不随启动时的 cwd 漂移；
 * 因此不再用 `process.cwd()` 兜底。
 */
function resolveUserDataDir(): string {
  if (app.isPackaged) return join(app.getPath('appData'), APP_DIR_NAME)
  return join(app.getAppPath(), DEV_USER_DATA_DIR_NAME)
}

/**
 * 在 app ready 之前固定应用名与 userData 路径。
 *
 * 必须早于任何 app.getPath('userData') / getDb() 调用，
 * 因此由入口模块在顶层同步执行。
 * 显式 setPath，避免依赖 setName 的隐式目录推导行为。
 */
export function configureAppPaths(): void {
  const userDataDir = resolveUserDataDir()

  // setPath 要求目标目录已存在；开发态首次启动时 user_data/ 尚未创建。
  if (!app.isPackaged) mkdirSync(userDataDir, { recursive: true })

  app.setName(APP_DIR_NAME)
  app.setPath('userData', userDataDir)
}

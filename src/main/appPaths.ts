import { app } from 'electron'
import { join } from 'node:path'

/**
 * 应用数据目录名：
 * - 打包安装（app.isPackaged）→ "Writer's Forge"
 * - 本地开发（electron-vite dev）→ "Writer's Forge Dev"
 */
export const APP_DIR_NAME = app.isPackaged ? "Writer's Forge" : "Writer's Forge Dev"

/**
 * 在 app ready 之前固定应用名与 userData 路径。
 *
 * 必须早于任何 app.getPath('userData') / getDb() 调用，
 * 因此由入口模块在顶层同步执行。
 * 显式 setPath，避免依赖 setName 的隐式目录推导行为。
 */
export function configureAppPaths(): void {
  app.setName(APP_DIR_NAME)
  app.setPath('userData', join(app.getPath('appData'), APP_DIR_NAME))
}

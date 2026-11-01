import { app, BrowserWindow, Menu } from 'electron'
import { configureAppPaths } from './appPaths'
import { closeDb, getDb } from './database'
import { runDiagnostics } from './database/diagnostics'
import { registerIpc } from './ipc'
import { configureLogger, logger } from './logger'
import { registerResizeSnap } from './resizeSnap'
import { createMainWindow } from './window'

// 必须在 app ready 之前、且早于任何 app.getPath('userData') / getDb() 调用
configureAppPaths()

// 日志系统：须在 configureAppPaths() 之后（固定 userData）、getDb() 之前初始化。
// 同时注册崩溃 / 未捕获异常捕获与主进程→渲染进程的转发桥。
configureLogger()

/** 入口模块日志 scope。 */
const log = logger.scope('app')

app.whenReady().then(() => {
  log.info('app ready', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform
  })

  // 自绘标题栏：移除系统应用菜单栏
  Menu.setApplicationMenu(null)

  // 初始化数据库（触发建表）并注册 IPC
  try {
    getDb()
  } catch (error) {
    log.error('数据库初始化失败', error)
    throw error
  }

  // 数据健康自检：在数据库就绪（含 foreign_keys=ON）之后、窗口创建之前同步执行一次。
  // 结果存主进程内存，供渲染层经 `diagnostics:get` 拉取——此时序保证渲染层挂载时
  // 报告必然已就绪（getDb() 同步且早于 createMainWindow()），无竞态。
  const diagnosticsReport = runDiagnostics()

  registerIpc(diagnosticsReport)
  log.info('IPC 注册完成')

  const mainWindow = createMainWindow()
  // 注册宽度磁吸监听（默认不启用，由书籍页 IPC 开启）
  registerResizeSnap(mainWindow)

  app.on('activate', () => {
    // macOS：点击 Dock 图标且无窗口时重建
    if (BrowserWindow.getAllWindows().length === 0) {
      log.info('activate 且无窗口，重建主窗口')
      registerResizeSnap(createMainWindow())
    }
  })
})

app.on('window-all-closed', () => {
  // macOS 之外的平台关闭全部窗口即退出
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // 此时窗口的 close 拦截尚未执行（渲染层 flush 未完成），不可关库。
  log.info('before-quit，等待窗口关闭与渲染层 flush')
})

app.on('will-quit', () => {
  // will-quit 在所有窗口关闭之后触发，此时渲染层 flush 已完成，关库才安全。
  log.info('will-quit，关闭数据库')
  closeDb()
})

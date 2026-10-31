import { ipcMain } from 'electron'
import { logger } from '../logger'
import { bookStatsAll, streakDays, todayWords, totalWords } from '../database/stats'

/** 统计域日志 scope。 */
const log = logger.scope('stats')

/**
 * 写作统计域 IPC：通道前缀 `stats:`。
 *
 * 通道 → 入参 / 出参：
 * - stats:totalWords   ()  → number（全书累计有效字数）
 * - stats:todayWords   ()  → number（今日写作，净增量的 `max(0, …)`）
 * - stats:streakDays   ()  → number（连续写作天数）
 * - stats:bookStatsAll ()  → Record<bookId, BookStats>（批量：一次取全部书的章数 / 字数 / 进度）
 *
 * 设计：读操作，无入参、无副作用；批量 `bookStatsAll` 避免书架逐书 IPC（N+1）。
 */
export function registerStatsIpc(): void {
  ipcMain.handle('stats:totalWords', () => totalWords())
  ipcMain.handle('stats:todayWords', () => todayWords())
  ipcMain.handle('stats:streakDays', () => streakDays())
  ipcMain.handle('stats:bookStatsAll', () => {
    try {
      return bookStatsAll()
    } catch (error) {
      log.error('stats:bookStatsAll 失败', error)
      return {}
    }
  })
}

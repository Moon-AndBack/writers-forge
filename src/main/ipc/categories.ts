import { ipcMain } from 'electron'
import { logger } from '../logger'
import { listCategories } from '../database/categories'

/** 分类域日志 scope。 */
const log = logger.scope('categories')

/**
 * 分类域 IPC：通道前缀 `categories:`（官方分类 + 旧版自定义分类统一两级树的**只读**入口）。
 *
 * 通道 → 入参 / 出参：
 * - categories:list   ()                 → CategoryRow[]（全树：官方 + 旧版自定义，`channel` / `parent_id`
 *   / `sort_order` / `id` 升序；渲染层自行按 `parentId` 组装层级）
 *
 * 自定义分类的创建 / 重命名 / 删除入口已随设置页一并移除；旧版自定义分类行冻结保留，
 * 仍随本通道返回给书籍表单、书架标签与 AI 书籍画像使用。
 */
export function registerCategoriesIpc(): void {
  ipcMain.handle('categories:list', () => {
    try {
      const categories = listCategories()
      log.debug('categories:list 完成', { count: categories.length })
      return categories
    } catch (error) {
      log.error('categories:list 失败', error)
      return []
    }
  })
}

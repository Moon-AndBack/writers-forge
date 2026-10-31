import { ipcMain } from 'electron'
import { logger } from '../logger'
import { listCategories } from '../database/categories'
import {
  CategoryWriteError,
  createCustomCategory,
  deleteCustomCategory,
  renameCustomCategory
} from '../database/categoriesWrite'

/** 分类域日志 scope。 */
const log = logger.scope('categories')

/** 校验正整数 id。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 校验非空字符串（trim 后非空）。 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 判断是否为普通对象（用于校验 IPC 入参）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 分类域 IPC：通道前缀 `categories:`（官方分类 + 用户自定义分类的统一两级树）。
 *
 * 通道 → 入参 / 出参：
 * - categories:list   ()                 → CategoryRow[]（全树：官方 + 自定义，`channel` / `parent_id`
 *   / `sort_order` / `id` 升序；渲染层自行按 `parentId` 组装层级）
 * - categories:create ({ name, parentId? }) → CategoryRow | null（非法 / 重名 → null；**不含用户文案**）
 * - categories:rename (id, name)          → CategoryRow | null（非法 / 重名 / 非自定义 / 不存在 → null）
 * - categories:delete (id)                → { ok: true }
 *   | { ok: false, reason: 'inUse', usageCount } | { ok: false, reason: 'notCustom' | 'notFound' }
 *   （**结构化错误**：被引用时回传占用书数，文案由渲染层渲染，主进程不产出用户文案）
 *
 * 校验强度：入参先在本层收敛（正整数 / 非空字符串 / 对象形态），非法一律回退安全默认；
 * 数据层 `database/categoriesWrite.ts` 再自行兜底（重名 / 父级 / 自定义性），双层守门。
 * 领域错误（`CategoryWriteError`）按通道语义**静默降级**（null / 结构化失败）；
 * 非预期异常记录后原样上抛。
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

  ipcMain.handle('categories:create', (_event, input: unknown) => {
    if (!isRecord(input) || !isNonEmptyString(input.name)) {
      log.warn('categories:create 入参非法', { input })
      return null
    }
    const parentRaw = input.parentId
    if (parentRaw !== undefined && parentRaw !== null && !isPositiveInt(parentRaw)) {
      log.warn('categories:create parentId 非法', { parentId: parentRaw })
      return null
    }
    const parentId = parentRaw === undefined || parentRaw === null ? null : parentRaw

    try {
      const created = createCustomCategory({ name: input.name, parentId })
      log.debug('categories:create 成功', { id: created.id })
      return created
    } catch (error) {
      if (error instanceof CategoryWriteError) {
        log.warn('categories:create 被拒绝', { code: error.code })
        return null
      }
      log.error('categories:create 失败', { input, error })
      throw error
    }
  })

  ipcMain.handle('categories:rename', (_event, id: unknown, name: unknown) => {
    if (!isPositiveInt(id) || !isNonEmptyString(name)) {
      log.warn('categories:rename 入参非法', { id })
      return null
    }
    try {
      const updated = renameCustomCategory(id, name)
      log.debug('categories:rename 成功', { id })
      return updated
    } catch (error) {
      if (error instanceof CategoryWriteError) {
        log.warn('categories:rename 被拒绝', { id, code: error.code })
        return null
      }
      log.error('categories:rename 失败', { id, error })
      throw error
    }
  })

  ipcMain.handle('categories:delete', (_event, id: unknown) => {
    if (!isPositiveInt(id)) {
      log.warn('categories:delete 入参非法', { id })
      return { ok: false, reason: 'notFound' }
    }
    try {
      const result = deleteCustomCategory(id)
      if (result.ok) log.debug('categories:delete 成功', { id })
      else log.warn('categories:delete 未删除', { id, reason: result.reason })
      return result
    } catch (error) {
      log.error('categories:delete 失败', { id, error })
      throw error
    }
  })
}

/**
 * 分类域 · **写入侧**（自定义分类的增 / 改 / 删）。
 *
 * 拆分缘由（§3 单文件 ≤500 行）：只读侧 `categories.ts` 已达 459 行（其中 ~320 行为
 * 官方分类种子字面量），继续堆 CRUD 会越线。故按「读 / 写」职责拆出本文件：
 * - `categories.ts`：类型 + `listCategories` + 官方种子（**只读**，本批未改）；
 * - `categoriesWrite.ts`（本文件）：自定义分类 CRUD + 占用统计 + 领域错误。
 *
 * 不变量（对齐 `schema/categories.ts`）：
 * - 自定义分类 **必须** `channel = NULL` + `is_custom = 1`（表级 CHECK 兜底）；
 * - `origin_id` 为起点官方 ID，自定义分类恒为 NULL；
 * - `parent_id` 为自引用外键（`ON DELETE CASCADE`）：本批数据层允许挂到**自定义一级**
 *   之下（形参为前向兼容保留），但**渲染层只创建一级**（见交付报告「层级判定」）。
 *
 * 事务：每个写操作各自单事务（查重 + 排序位计算 + 写入在同一事务内，避免竞态）。
 * 回读：写后经 `listCategories()` 取回领域对象（避免重复实现行映射，n≈180 可忽略）。
 */
import type Database from 'better-sqlite3'
import { getDb } from './index'
import { listCategories } from './categories'
import type { CategoryRow } from './categories'

/** 自定义分类写操作的领域错误码（IPC 层据此回传结构化失败，**不产出用户文案**）。 */
export type CategoryWriteErrorCode =
  'invalidName' | 'duplicateName' | 'invalidParent' | 'notFound' | 'notCustom'

/** 自定义分类写操作领域错误：`code` 供调用方判定失败原因。 */
export class CategoryWriteError extends Error {
  readonly code: CategoryWriteErrorCode

  constructor(code: CategoryWriteErrorCode, message: string) {
    super(message)
    this.name = 'CategoryWriteError'
    this.code = code
  }
}

/** 创建自定义分类入参（本批 UI 仅传 `name`；`parentId` 为前向兼容保留）。 */
export interface CreateCustomCategoryInput {
  name: string
  /** 父分类 id（须为自定义一级分类）；null / 省略 = 一级分类。 */
  parentId?: number | null
}

/** 删除结果：被书籍引用时回传**占用书数**；非自定义 / 不存在给出原因（文案由渲染层渲染）。 */
export type DeleteCustomCategoryResult =
  | { ok: true }
  | { ok: false; reason: 'inUse'; usageCount: number }
  | { ok: false; reason: 'notCustom' }
  | { ok: false; reason: 'notFound' }

/** 仅取判定 / 回读所需的最小列。 */
interface CategoryProbeRow {
  id: number
  isCustom: number
}

/**
 * 统计**该分类及其全部后代**被书籍引用的**去重书数**。
 *
 * - `books.categories` 存分类 ID 数组的 JSON 文本（无外键）→ 用 `json_each` 展开比对；
 * - `json_valid` 预过滤：脏数据（非合法 JSON）按空数组处理，不阻断统计；
 * - 递归 CTE 覆盖级联删除场景：删一级前端时，其（若有）二级被引用也计入占用，
 *   从而**阻止会连带删掉被引用二级**的删除操作（见交付报告「删除占用检查」）。
 */
const COUNT_USAGE_SQL = `
  WITH RECURSIVE subtree(id) AS (
    SELECT @id
    UNION ALL
    SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
  )
  SELECT COUNT(DISTINCT b.id) AS usageCount
  FROM books b,
       json_each(CASE WHEN json_valid(b.categories) THEN b.categories ELSE '[]' END) je
  WHERE je.value IN (SELECT id FROM subtree)
`

/** 归一化名称：去首尾空白（写入真源即 trim 后的值）。 */
function normalizeName(name: string): string {
  return name.trim()
}

/**
 * 断言名称可用：与**任何**现有分类（含官方）重名即拒绝。
 *
 * 口径：对 trim 后的入参名与库内 `name` 做 `COLLATE NOCASE` 比较（ASCII 大小写不敏感，
 * 中文为精确比较）；`excludeId` 用于重命名时排除自身。
 */
function assertNameAvailable(db: Database.Database, name: string, excludeId: number | null): void {
  const hit =
    excludeId === null
      ? db.prepare('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE LIMIT 1').get(name)
      : db
          .prepare('SELECT 1 FROM categories WHERE id != ? AND name = ? COLLATE NOCASE LIMIT 1')
          .get(excludeId, name)
  if (hit) throw new CategoryWriteError('duplicateName', '已存在同名分类')
}

/** 校验父分类：须存在、为自定义、且为一级（禁止三级及以上）。 */
function resolveParentId(db: Database.Database, parentId: number | null): number | null {
  if (parentId === null) return null
  const parent = db
    .prepare('SELECT id FROM categories WHERE id = ? AND is_custom = 1 AND parent_id IS NULL')
    .get(parentId) as { id: number } | undefined
  if (!parent) {
    throw new CategoryWriteError('invalidParent', '父分类不存在或不是自定义一级分类')
  }
  return parent.id
}

/** 统计某分类及其全部后代被多少本书引用（去重书数）。 */
export function countCategoryUsage(id: number): number {
  const row = getDb().prepare(COUNT_USAGE_SQL).get({ id }) as { usageCount: number } | undefined
  return row ? Number(row.usageCount) : 0
}

/**
 * 创建自定义分类（单事务）：强制 `channel = NULL` + `is_custom = 1`；
 * `sort_order` 取目标父级下自定义分类的最大值 + 1。
 * 名称为空 / 重名 / 父分类非法时抛 {@link CategoryWriteError}。
 */
export function createCustomCategory(input: CreateCustomCategoryInput): CategoryRow {
  const name = normalizeName(input.name)
  if (name === '') throw new CategoryWriteError('invalidName', '分类名不能为空')
  const requestedParent = input.parentId ?? null

  const db = getDb()
  return db.transaction((): CategoryRow => {
    const parentId = resolveParentId(db, requestedParent)
    assertNameAvailable(db, name, null)

    const orderRow = db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
         FROM categories WHERE is_custom = 1 AND parent_id IS ?`
      )
      .get(parentId) as { next: number }

    const result = db
      .prepare(
        `INSERT INTO categories (origin_id, channel, parent_id, name, sort_order, is_custom)
         VALUES (NULL, NULL, @parentId, @name, @sortOrder, 1)`
      )
      .run({ parentId, name, sortOrder: orderRow.next })

    const created = listCategories().find((row) => row.id === Number(result.lastInsertRowid))
    if (!created) throw new Error('创建自定义分类后回读失败')
    return created
  })()
}

/**
 * 重命名自定义分类（单事务）：仅允许 `is_custom = 1`；同样查重名（排除自身）。
 * 不存在 / 非自定义 / 名称为空 / 重名时抛 {@link CategoryWriteError}。
 */
export function renameCustomCategory(id: number, name: string): CategoryRow {
  const nextName = normalizeName(name)
  if (nextName === '') throw new CategoryWriteError('invalidName', '分类名不能为空')

  const db = getDb()
  return db.transaction((): CategoryRow => {
    const probe = db
      .prepare('SELECT id, is_custom AS isCustom FROM categories WHERE id = ?')
      .get(id) as CategoryProbeRow | undefined
    if (!probe) throw new CategoryWriteError('notFound', '分类不存在')
    if (probe.isCustom !== 1) throw new CategoryWriteError('notCustom', '仅自定义分类可重命名')

    assertNameAvailable(db, nextName, id)
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(nextName, id)

    const updated = listCategories().find((row) => row.id === id)
    if (!updated) throw new Error('重命名自定义分类后回读失败')
    return updated
  })()
}

/**
 * 删除自定义分类（单事务）：
 * - 不存在 → `notFound`；非自定义（官方分类）→ `notCustom`；
 * - **先查占用**（含后代，见 {@link countCategoryUsage}）：`> 0` → 不删并回传占用书数；
 * - `= 0` 才物理删除；其（若有）二级由 schema 的 `ON DELETE CASCADE` 联动删除
 *   ——因占用检查已覆盖后代，被引用的二级不会被连带删除。
 */
export function deleteCustomCategory(id: number): DeleteCustomCategoryResult {
  const db = getDb()
  return db.transaction((): DeleteCustomCategoryResult => {
    const probe = db
      .prepare('SELECT id, is_custom AS isCustom FROM categories WHERE id = ?')
      .get(id) as CategoryProbeRow | undefined
    if (!probe) return { ok: false, reason: 'notFound' }
    if (probe.isCustom !== 1) return { ok: false, reason: 'notCustom' }

    const usageCount = countCategoryUsage(id)
    if (usageCount > 0) return { ok: false, reason: 'inUse', usageCount }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    return { ok: true }
  })()
}

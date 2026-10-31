import { getDb } from './index'

/**
 * 通用「组内排序」工具：合并章节域（`chapterGroups.ts`）与大纲域（`outline/shared.ts`）
 * 两份同构的 `renumber*InGroup` 实现（§9 通用组件优先 / 差异以参数表达）。
 *
 * **两个口径差异（务必分清）**：
 * 1. **取下一序**（`nextSortOrderInGroup`）：**不过滤软删行**——回收站中的行仍占号，
 *    新行 / 还原行追加到既有最大序之后，避免与待还原行撞序号；
 * 2. **组内重排**（`renumberInGroup`）：**只含未删行**——把当前展示序压成 0 起连续，
 *    软删行不参与，避免回收站行把活跃行的序号顶出空洞。
 *
 * 表名以**字面量白名单**校验（`OrderableTable`），禁止外部输入拼接 SQL。
 */

/** 允许参与排序的表白名单（字面量，禁止外部拼接表名）。 */
const ORDERABLE_TABLES = ['chapters', 'outline_items'] as const

/** 可排序表名（白名单字面量联合）。 */
export type OrderableTable = (typeof ORDERABLE_TABLES)[number]

/** 运行时白名单校验（防御绕过类型的外部调用）。 */
function assertOrderableTable(table: OrderableTable): OrderableTable {
  if (!(ORDERABLE_TABLES as readonly string[]).includes(table)) {
    throw new Error(`ordering: 非法表名（${String(table)}）`)
  }
  return table
}

/**
 * 组内下一个 `sort_order`（= `MAX(sort_order) + 1`，空组 0）。
 *
 * **口径 1：不过滤软删行**。`whereSql` 由调用方给**组谓词**（含 `book_id` 与
 * `volume_id` 判定，必要时附加领域过滤），参数按序放 `params`。
 * 例：`nextSortOrderInGroup('chapters', 'book_id = ? AND volume_id = ?', [bookId, volumeId])`。
 */
export function nextSortOrderInGroup(
  table: OrderableTable,
  whereSql: string,
  params: readonly unknown[]
): number {
  const safeTable = assertOrderableTable(table)
  const row = getDb()
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM ${safeTable} WHERE ${whereSql}`)
    .get(...params) as { next: number } | undefined
  return row?.next ?? 0
}

/**
 * 组内重排的规格。
 * - `bookId`：**必带**——大纲域「置顶独立区」（`volume_id IS NULL`）是**按书**隔离的，
 *   仅凭 `volume_id IS NULL` 会把全库多书的独立区混在一起重排（章节域 `volume_id` NOT NULL，
 *   此参数冗余但无害，统一签名以免两套）；
 * - `volumeId`：`null` → `volume_id IS NULL`（组谓词），数字 → `volume_id = ?`；
 * - `leadOrderSql`：领域排序键前缀（如章节的 `PIN_RANK_SQL`），统一在末尾补 `sort_order, id`；
 * - `extraWhereSql`：附加**可信字面量**过滤（如 `scope = 'entry'`），同时进 `SELECT` 与
 *   `UPDATE` 守卫。**禁止外部输入**（不参数化，仅内部常量）。
 */
export interface RenumberGroupSpec {
  table: OrderableTable
  bookId: string
  volumeId: number | null
  leadOrderSql?: string
  extraWhereSql?: string
}

/**
 * 按当前**展示顺序**把某组未删行的 `sort_order` 重写为 0 起连续；
 * 空组直接返回（无行可写）。
 *
 * **口径 2：只含未删行**（`deleted_at IS NULL`）。展示顺序 = `leadOrderSql`（可选）→
 * `sort_order` → `id`，与各域列表查询的组内排序保持一致。
 */
export function renumberInGroup(spec: RenumberGroupSpec): void {
  const safeTable = assertOrderableTable(spec.table)

  const params: unknown[] = [spec.bookId]
  const groupPredicate = spec.volumeId === null ? 'volume_id IS NULL' : 'volume_id = ?'
  if (spec.volumeId !== null) params.push(spec.volumeId)

  const whereParts = ['book_id = ?', groupPredicate]
  if (spec.extraWhereSql) whereParts.push(`(${spec.extraWhereSql})`)
  const whereSql = whereParts.join(' AND ')

  const orderSql = [spec.leadOrderSql, 'sort_order', 'id']
    .filter((part): part is string => part !== undefined && part !== '')
    .join(', ')

  const db = getDb()
  const ids = (
    db
      .prepare(
        `SELECT id FROM ${safeTable} WHERE ${whereSql} AND deleted_at IS NULL ORDER BY ${orderSql}`
      )
      .all(...params) as Array<{ id: number }>
  ).map((row) => row.id)
  if (ids.length === 0) return

  const update = db.prepare(`UPDATE ${safeTable} SET sort_order = ? WHERE id = ? AND ${whereSql}`)
  for (let index = 0; index < ids.length; index += 1) {
    update.run(index, ids[index], ...params)
  }
}

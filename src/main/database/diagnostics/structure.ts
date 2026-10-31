import type Database from 'better-sqlite3'
import { EXPECTED_INDEXES, EXPECTED_TABLES } from './expected'
import { createIssue, formatItems } from './helpers'
import type { DiagnosticsIssue } from './types'

/**
 * **结构检查**（严格相等）：实测「表 / 列 / 索引」与 `./expected` 的设计清单逐项比对。
 *
 * 判据（用户已拍板）：**严格相等**——缺失与多出**都**记为问题。
 * - 表：`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
 * - 列：`PRAGMA table_info(<table>)`（`books` 表为驼峰列名，不归一化）
 * - 索引：`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`
 * - **只比索引名集合**，不比对索引的列 / WHERE 定义（理由见 `./expected` 文件头）
 *
 * ⚠️ 必须过滤 `sqlite_%`：`sqlite_sequence`（AUTOINCREMENT 产物）与
 * `sqlite_autoindex_*`（UNIQUE 约束产物）是 SQLite 自动生成对象，**不是设计不符**。
 *
 * **缺表的连带处理**：表不存在时其列检查**跳过**（只记一条 `missingTable`），
 * 不抛错、不中断其它检查——单点损坏不应掩盖其余结构信息。
 */

/** 实测表名集合（已过滤 `sqlite_%`）。供不变量检查判断「某表是否存在」。 */
export function readTableNames(db: Database.Database): Set<string> {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

/** 实测命名索引集合（已过滤 `sqlite_%`，含 `sqlite_autoindex_*`）。 */
function readIndexNames(db: Database.Database): Set<string> {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name.trim()))
}

/** 实测某表列名集合（经 `PRAGMA table_info`；表不存在时调用方须自行跳过）。 */
function readColumnNames(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

/* ---------- 三项比对 ---------- */

function checkTables(actual: Set<string>, issues: DiagnosticsIssue[]): void {
  for (const expected of EXPECTED_TABLES) {
    if (!actual.has(expected.name)) {
      issues.push(
        createIssue('structure.missingTable', { table: expected.name, n: 1, items: expected.name })
      )
    }
  }
  const expectedNames = new Set(EXPECTED_TABLES.map((table) => table.name))
  const extra = [...actual].filter((name) => !expectedNames.has(name))
  if (extra.length > 0) {
    issues.push(
      createIssue('structure.extraTable', { items: formatItems(extra.sort()), n: extra.length })
    )
  }
}

/** 逐表比对列（**已存在的表才检查**；缺表由 {@link checkTables} 报出，此处跳过）。 */
function checkColumns(
  db: Database.Database,
  tableNames: Set<string>,
  issues: DiagnosticsIssue[]
): void {
  for (const expected of EXPECTED_TABLES) {
    if (!tableNames.has(expected.name)) continue

    const actual = readColumnNames(db, expected.name)
    const missing = expected.columns.filter((column) => !actual.has(column))
    const expectedColumnSet = new Set(expected.columns)
    const extra = [...actual].filter((column) => !expectedColumnSet.has(column))

    if (missing.length > 0) {
      issues.push(
        createIssue('structure.missingColumn', {
          table: expected.name,
          items: formatItems(missing),
          n: missing.length
        })
      )
    }
    if (extra.length > 0) {
      issues.push(
        createIssue('structure.extraColumn', {
          table: expected.name,
          items: formatItems(extra.sort()),
          n: extra.length
        })
      )
    }
  }
}

function checkIndexes(actual: Set<string>, issues: DiagnosticsIssue[]): void {
  const missing = EXPECTED_INDEXES.filter((index) => !actual.has(index))
  if (missing.length > 0) {
    issues.push(
      createIssue('structure.missingIndex', { items: formatItems(missing), n: missing.length })
    )
  }
  const expectedSet = new Set(EXPECTED_INDEXES)
  const extra = [...actual].filter((index) => !expectedSet.has(index))
  if (extra.length > 0) {
    issues.push(
      createIssue('structure.extraIndex', { items: formatItems(extra.sort()), n: extra.length })
    )
  }
}

/** 执行结构检查（表 / 列 / 索引，严格相等）。 */
export function checkStructure(db: Database.Database): DiagnosticsIssue[] {
  const issues: DiagnosticsIssue[] = []
  const tableNames = readTableNames(db)
  checkTables(tableNames, issues)
  checkColumns(db, tableNames, issues)
  checkIndexes(readIndexNames(db), issues)
  return issues
}

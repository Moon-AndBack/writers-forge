import { getDb } from '../index'
import { logger } from '../../logger'
import { checkForeignKeys, checkIntegrity, checkInvariants } from './checks'
import { createIssue } from './helpers'
import { checkStructure, readTableNames } from './structure'
import { checkWorldConsistency } from './worldChecks'
import type { DiagnosticsIssue, DiagnosticsReport } from './types'

/** 自检域日志 scope。 */
const log = logger.scope('diagnostics')

export type { DiagnosticsIssue, DiagnosticsIssueCode, DiagnosticsReport } from './types'
export { EXPECTED_INDEXES, EXPECTED_TABLES } from './expected'

/**
 * 数据健康自检（启动时执行一次）。
 *
 * 检查范围（用户已拍板）：
 * 1. **结构**（严格相等）：表 / 列 / 命名索引与 `./expected` 的设计清单一致，
 *    多出与缺失都记为问题；`sqlite_%` 自动对象（`sqlite_sequence` /
 *    `sqlite_autoindex_*`）已过滤，不算不符；
 * 2. **A 类外键悬空**：`PRAGMA foreign_key_check`（一次覆盖全部声明外键）；
 * 3. **B 类应用层不变量**：B1–B7（见 `./checks`）+ 统一设定库 / 剧情关联一致性
 *    （见 `./worldChecks`：孤儿子表 / 类型错位 / 关系自反 / 场景关联悬空）；
 * 4. **文件完整性**：`PRAGMA quick_check`。
 *
 * 设计要点：
 * - **同步执行**：全部为同步 PRAGMA / 查询，实测合计约数十毫秒量级（10 万段落库），
 *   不会显著推迟窗口创建；调用点见 `src/main/index.ts`（`getDb()` 之后）；
 * - **单项失败不中断**：表缺失时其列检查与依赖它的不变量自动跳过（只记 `missingTable`）；
 *   任一子步骤抛错则整体降级为一条 `diagnostics.*` 问题，**绝不**让自检把启动搞崩；
 * - **不产出用户可见文案**（AGENTS §10）：只回传 `code` + `params`，由渲染层经 `t()` 渲染。
 */
export function runDiagnostics(): DiagnosticsReport {
  const issues: DiagnosticsIssue[] = []

  try {
    const db = getDb()
    const tableNames = readTableNames(db)

    issues.push(...checkStructure(db))
    issues.push(...checkForeignKeys(db))
    issues.push(...checkInvariants(db, tableNames))
    issues.push(...checkWorldConsistency(db, tableNames))
    issues.push(...checkIntegrity(db))
  } catch (error) {
    // 自检自身异常：记录并降级为一条问题，保证调用方（启动路径）永不因自检失败而中断。
    log.error('数据库自检执行失败', error)
    if (issues.length === 0) {
      issues.push(createIssue('diagnostics.internalError', {}))
    } else {
      issues.push(createIssue('diagnostics.checkFailed', { n: issues.length }))
    }
  }

  const report: DiagnosticsReport = {
    status: issues.length === 0 ? 'clean' : 'problems',
    issues,
    checkedAt: new Date().toISOString()
  }

  if (report.status === 'clean') {
    log.info('数据自检通过', { checkedAt: report.checkedAt })
  } else {
    log.warn('数据自检发现问题', {
      issueCount: report.issues.length,
      codes: report.issues.map((issue) => issue.code)
    })
  }

  return report
}

import type Database from 'better-sqlite3'
import { createIssue, formatItems, labeledId } from './helpers'
import type { DiagnosticsIssue } from './types'

/**
 * **文件完整性** + **A 类外键悬空**检查。
 *
 * - 完整性用 `PRAGMA quick_check`：覆盖 B 树 / 页 / 索引一致性，实测约 17ms @10 万段落
 *   （`integrity_check` 约 59ms 更彻底）。选自检**同步**跑在启动路径上，
 *   取 `quick_check` 以不显著推迟窗口创建；正常返回单行 `ok`，损坏时返回错误文本行数组。
 * - A 类用 `PRAGMA foreign_key_check`：一次性覆盖全部声明外键（含复合外键），
 *   空数组 = 无悬空；实测约 6ms @10 万段落。返回 `{ table, rowid, parent, fkid }`。
 */

/** 完整性检查：`quick_check` 非 `ok` 即报（错误行作为语言中立的诊断文本回传）。 */
export function checkIntegrity(db: Database.Database): DiagnosticsIssue[] {
  const rows = db.pragma('quick_check') as Array<Record<string, unknown>>
  const messages = rows
    .map((row) => String(Object.values(row)[0] ?? ''))
    .filter((message) => message !== '' && message !== 'ok')
  if (messages.length === 0) return []
  return [createIssue('integrity.corrupt', { items: formatItems(messages), n: messages.length })]
}

/**
 * A 类：外键悬空（`PRAGMA foreign_key_check`）。
 *
 * 同类问题**按父表聚合**为一条（`parent` = 被引用的父表名）：`n` = 悬空行总数，
 * `items` = 前若干 `子表#rowid` 标识。
 */
export function checkForeignKeys(db: Database.Database): DiagnosticsIssue[] {
  const rows = db.pragma('foreign_key_check') as Array<{
    table: string
    rowid: number
    parent: string
    fkid: number
  }>
  if (rows.length === 0) return []

  const byParent = new Map<string, string[]>()
  for (const row of rows) {
    const list = byParent.get(row.parent) ?? []
    list.push(`${row.table}#${String(row.rowid)}`)
    byParent.set(row.parent, list)
  }

  const issues: DiagnosticsIssue[] = []
  for (const [parent, items] of byParent) {
    issues.push(
      createIssue('foreignKey.orphan', {
        parent,
        items: formatItems(items),
        n: items.length
      })
    )
  }
  return issues
}

/* ---------- B 类：应用层不变量 ---------- */

/**
 * B 类不变量检查（DB 约束管不到、须由应用层守住的跨行事实）。
 *
 * **口径：只看未软删行**（`deleted_at IS NULL`）——软删卷的卷纲行会级联软删，
 * 此时「无未删卷纲行」是**正常态**，不应报错。
 *
 * 逐条：
 * - **B1**（核心）每卷必有卷纲行（`scope='volume'`）：建卷即同事务建卷纲，
 *   缺失意味着数据被外力破坏；
 * - **B7** 每卷至多一条卷纲行（部分唯一索引 `idx_outline_items_volume_scope` 已强制；
 *   老库 / 外力可能绕过，故独立复核）；
 * - **B2** 分组容器卷（`kind='group'`）下不得有章节（仅大纲页可见，不可挂章）；
 * - **B3** 特殊章须有前段（`special_prefix`）与非空名段（`title`）；
 * - **B4** 普通章 `pin` 必须为 NULL（表级 CHECK 已强制；老库缺 CHECK 时可能残留）；
 * - **B5** 特殊章不得置于自定义卷（`kind='custom'`；系统「未分卷」卷借用 custom，
 *   但它是还原 / 移入的兜底容器，按 `is_unfiled=0` 排除）；
 * - **B6** `outline_items` 的 `kind` / `volume_id` / `scope` 一致性（三条表级 CHECK 取反）。
 *
 * ⚠️ **不校验 CHECK 约束本身**：SQLite 无 PRAGMA 可枚举 CHECK，须解析 `sqlite_master.sql`
 * 文本，复杂度高、收益低，本批不做（B4 / B6 以数据校验覆盖其语义）。
 */
export function checkInvariants(
  db: Database.Database,
  tableNames: Set<string>
): DiagnosticsIssue[] {
  const issues: DiagnosticsIssue[] = []
  // 表缺失时（已由结构检查报 missingTable）跳过依赖它的不变量，避免抛错中断；
  // 每条只按其**真实依赖**判存在性，缺一张表不会连带吞掉其余不变量。
  const has = (table: string): boolean => tableNames.has(table)

  if (has('volumes') && has('outline_items')) {
    // B1：每卷必有卷纲行（依赖 volumes + outline_items）。
    const noOutline = db
      .prepare(
        `SELECT v.id AS id, v.title AS title FROM volumes v
         WHERE v.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM outline_items o
             WHERE o.volume_id = v.id AND o.scope = 'volume' AND o.deleted_at IS NULL
           )`
      )
      .all() as Array<{ id: number; title: string }>
    if (noOutline.length > 0) {
      issues.push(
        createIssue('invariant.volumeWithoutOutline', {
          items: formatItems(noOutline.map((row) => labeledId(row.id, row.title))),
          n: noOutline.length
        })
      )
    }
  }

  if (has('outline_items')) {
    // B7：每卷至多一条卷纲行（只依赖 outline_items）。
    const dupOutline = db
      .prepare(
        `SELECT volume_id AS volumeId, COUNT(*) AS total FROM outline_items
         WHERE scope = 'volume' AND deleted_at IS NULL AND volume_id IS NOT NULL
         GROUP BY volume_id HAVING COUNT(*) > 1`
      )
      .all() as Array<{ volumeId: number; total: number }>
    if (dupOutline.length > 0) {
      issues.push(
        createIssue('invariant.duplicateVolumeOutline', {
          items: formatItems(dupOutline.map((row) => `${row.volumeId} ×${row.total}`)),
          n: dupOutline.length
        })
      )
    }

    // B6：outline_items 的 kind / volume_id / scope 一致性（只依赖本表）。
    checkOutlineItemInvariants(db, issues)
  }

  // B2 / B5：章与卷的跨表不变量（依赖 chapters + volumes）。
  if (has('chapters') && has('volumes')) {
    const inGroup = db
      .prepare(
        `SELECT c.id AS id, c.title AS title FROM chapters c
         JOIN volumes v ON v.id = c.volume_id
         WHERE c.deleted_at IS NULL AND v.kind = 'group'`
      )
      .all() as Array<{ id: number; title: string }>
    if (inGroup.length > 0) {
      issues.push(
        createIssue('invariant.chapterInGroupVolume', {
          items: formatItems(inGroup.map((row) => labeledId(row.id, row.title))),
          n: inGroup.length
        })
      )
    }

    const specialInCustom = db
      .prepare(
        `SELECT c.id AS id, c.title AS title FROM chapters c
         JOIN volumes v ON v.id = c.volume_id
         WHERE c.deleted_at IS NULL AND c.kind = 'special'
           AND v.kind = 'custom' AND v.is_unfiled = 0`
      )
      .all() as Array<{ id: number; title: string }>
    if (specialInCustom.length > 0) {
      issues.push(
        createIssue('invariant.specialChapterInCustomVolume', {
          items: formatItems(specialInCustom.map((row) => labeledId(row.id, row.title))),
          n: specialInCustom.length
        })
      )
    }
  }

  // B3 / B4：只依赖 chapters 单表（含老库可能缺 CHECK 的列）。
  if (has('chapters')) checkChapterFieldInvariants(db, issues)

  return issues
}

/** B3（特殊章两段齐全）/ B4（普通章无 pin）。 */
function checkChapterFieldInvariants(db: Database.Database, issues: DiagnosticsIssue[]): void {
  const brokenSpecial = db
    .prepare(
      `SELECT id, title FROM chapters
       WHERE deleted_at IS NULL AND kind = 'special'
         AND (special_prefix IS NULL OR TRIM(special_prefix) = '' OR TRIM(title) = '')`
    )
    .all() as Array<{ id: number; title: string }>
  if (brokenSpecial.length > 0) {
    issues.push(
      createIssue('invariant.specialChapterMissingPrefix', {
        items: formatItems(brokenSpecial.map((row) => labeledId(row.id, row.title))),
        n: brokenSpecial.length
      })
    )
  }

  const pinnedNormal = db
    .prepare(
      `SELECT id, title FROM chapters WHERE deleted_at IS NULL AND pin IS NOT NULL AND kind <> 'special'`
    )
    .all() as Array<{ id: number; title: string }>
  if (pinnedNormal.length > 0) {
    issues.push(
      createIssue('invariant.normalChapterPinned', {
        items: formatItems(pinnedNormal.map((row) => labeledId(row.id, row.title))),
        n: pinnedNormal.length
      })
    )
  }
}

/**
 * B6：`outline_items` 的 `kind` / `volume_id` / `scope` 一致性（三条表级 CHECK 取反）：
 * - `kind='entry'` 必挂卷、`kind='standalone'` 不得挂卷；
 * - `scope='volume'` 必挂卷。
 */
function checkOutlineItemInvariants(db: Database.Database, issues: DiagnosticsIssue[]): void {
  const rows = db
    .prepare(
      `SELECT id, kind, scope, volume_id AS volumeId FROM outline_items
       WHERE deleted_at IS NULL
         AND (
           (kind = 'entry' AND volume_id IS NULL)
           OR (kind = 'standalone' AND volume_id IS NOT NULL)
           OR (scope = 'volume' AND volume_id IS NULL)
         )`
    )
    .all() as Array<{ id: number; kind: string; scope: string; volumeId: number | null }>
  if (rows.length > 0) {
    issues.push(
      createIssue('invariant.outlineItemConsistency', {
        items: formatItems(
          rows.map((row) => `#${row.id} (${row.kind}/${row.scope}/vol:${row.volumeId ?? 'null'})`)
        ),
        n: rows.length
      })
    )
  }
}

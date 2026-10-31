import type Database from 'better-sqlite3'

// 自 `database/index.ts` 拆出（仅搬运，守卫键 / SQL / 逻辑未改动），供 `getDb()` 装配调用。

/** 一次性迁移守卫键：books 删列（`author` / `targetWords`）。 */
const BOOKS_DROP_COLUMNS_KEY = 'books:dropAuthorTargetWords:v1'

/**
 * 一次性迁移：`DROP COLUMN` 删除 books 的 `author` / `targetWords` 两列。
 *
 * 背景：两列已从 `database/index.ts` 建表 DDL 移除，但 `CREATE TABLE IF NOT EXISTS`
 * 对老表既不补列、也不删列，故此处显式收敛结构。仅当 `PRAGMA table_info` 探测到列仍存在时
 * 才执行，并以 settings 键守卫幂等（只执行一次）；整体事务包裹，任一步失败即回滚、不置守卫键，
 * 下次启动自动重试。两列既非主键、无索引、也未被外键引用，`DROP COLUMN` 安全。
 */
export function migrateBooksDropColumns(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(BOOKS_DROP_COLUMNS_KEY)
  if (done) return

  const existing = new Set(
    (instance.prepare('PRAGMA table_info(books)').all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  )
  // 列名取自下方固定白名单（非用户输入），拼接安全。
  const targets = ['author', 'targetWords'].filter((name) => existing.has(name))

  instance.transaction(() => {
    for (const column of targets) {
      instance.exec(`ALTER TABLE books DROP COLUMN ${column}`)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(BOOKS_DROP_COLUMNS_KEY)
  })()
}

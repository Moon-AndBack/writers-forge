import Database from 'better-sqlite3'
import { getDb } from './index'

/** 读取单个设置项，不存在返回 null。 */
export function getSetting(key: string): string | null {
  const statement: Database.Statement<[string], { value: string }> = getDb().prepare(
    'SELECT value FROM settings WHERE key = ?'
  )
  const row = statement.get(key)
  return row ? row.value : null
}

/** 写入单个设置项，存在则更新值与 updated_at。 */
export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, value)
}

/** 读取全部设置项为普通对象。 */
export function getAllSettings(): Record<string, string> {
  const statement: Database.Statement<[], { key: string; value: string }> = getDb().prepare(
    'SELECT key, value FROM settings'
  )
  const rows = statement.all()

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

/** 删除单个设置项，返回是否真的删除了记录。 */
export function deleteSetting(key: string): boolean {
  const result = getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
  return Number(result.changes) > 0
}

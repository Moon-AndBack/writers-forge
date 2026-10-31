import type Database from 'better-sqlite3'
import {
  HIERARCHY_SEMANTIC_CODES,
  HIERARCHY_SEMANTIC_CODE_NAMES
} from './worldSemanticCodes'

/**
 * 一次性迁移：关系类型体系收敛为「上级 / 下级 / 平级 / 属于」四码，并清空存量关系。
 *
 * 背景：旧语义码（`member_of` / `owns` / `part_of` / `trains_in` / `leader_of` /
 * `mentor_of` / `family_of` / `ally_of` / `enemy_of` / `controls` / `related_to`）
 * 全部下线，字典只保留层级三码 + 归属码；用户已授权**破坏性清空**存量关系数据。
 *
 * 步骤（同一事务）：
 * 1. `DELETE FROM world_refs` —— 清空所有关系（含老库 `semantic_code IS NULL` 的行）；
 * 2. `DELETE FROM world_semantic_codes WHERE code NOT IN (...)` —— 下线旧语义码；
 * 3. `INSERT OR IGNORE` 重灌四码字典（已存在则保留，不覆盖展示名）。
 *
 * 幂等：settings 键 `worldRefs:hierarchy:v1` 守卫（只执行一次）；事务包裹，任一步失败即
 * 回滚且不置键，下次启动自动重试。**键不随新增 `belongs_to` 提升**：老库执行过本迁移后
 * 由 `seedSemanticCodeDictionary()` 每次启动幂等补齐第四码，避免二次清空用户已建关系。
 * 须在 `world_refs` / `world_semantic_codes` 建表之后、种子之前调用。
 * 关系属性表已下线（`worldRefs:dropAttrs:v1` 先行 DROP），本迁移不再触碰该表。
 */
const WORLD_REFS_HIERARCHY_KEY = 'worldRefs:hierarchy:v1'

/** 执行关系体系收敛（幂等）。 */
export function migrateWorldRefsHierarchy(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(WORLD_REFS_HIERARCHY_KEY)
  if (done) return

  // 白名单占位符由固定常量长度生成（非用户输入），拼接安全。
  const keepPlaceholders = HIERARCHY_SEMANTIC_CODE_NAMES.map(() => '?').join(', ')
  const deleteOldCodes = instance.prepare(
    `DELETE FROM world_semantic_codes WHERE code NOT IN (${keepPlaceholders})`
  )
  const insertCode = instance.prepare(
    `INSERT OR IGNORE INTO world_semantic_codes (code, from_type, to_type, note)
     VALUES (?, ?, ?, ?)`
  )

  instance.transaction(() => {
    instance.exec('DELETE FROM world_refs')
    deleteOldCodes.run(...HIERARCHY_SEMANTIC_CODE_NAMES)
    for (const code of HIERARCHY_SEMANTIC_CODES) {
      insertCode.run(code.code, code.fromType, code.toType, code.note)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(WORLD_REFS_HIERARCHY_KEY)
  })()
}

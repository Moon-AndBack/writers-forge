import type Database from 'better-sqlite3'
import type { CharacterAgeAnchor } from './worldEntityTypes'

/**
 * 统一设定库 · 角色年龄锚点读写（`world_character_age`）。
 *
 * 每条时间线独立存一个「绝对年 → 年龄」锚点，不存出生年：
 * - 绝对年口径与剧情场景一致（纪前为负 / 元年 0 / 纪后为正）；
 * - 年龄为周岁（非负整数），负年龄只在渲染层推算时表示「尚未出生」；
 * - 主键 `(entity_id, timeline_id)` 保证同一实体同一条时间线只有一个锚点。
 *
 * 写路径为**全量替换**（先删后插），空数组等价于清除；由调用方事务包裹。
 */
export function loadCharacterAges(db: Database.Database, entityId: number): CharacterAgeAnchor[] {
  const rows = db
    .prepare(
      `SELECT timeline_id AS timelineId, anchor_year AS anchorYear, age
       FROM world_character_age WHERE entity_id = ? ORDER BY timeline_id`
    )
    .all(entityId) as CharacterAgeAnchor[]
  return rows
}

/** 全量替换某角色的年龄锚点（空数组 = 清除；按 `timeline_id` 去重，后项覆盖前项）。 */
export function replaceCharacterAges(
  db: Database.Database,
  entityId: number,
  anchors: readonly CharacterAgeAnchor[]
): void {
  db.prepare('DELETE FROM world_character_age WHERE entity_id = ?').run(entityId)
  if (anchors.length === 0) return
  const byTimeline = new Map<string, CharacterAgeAnchor>()
  for (const anchor of anchors) byTimeline.set(anchor.timelineId, anchor)
  const insert = db.prepare(
    `INSERT INTO world_character_age (entity_id, timeline_id, anchor_year, age)
     VALUES (?, ?, ?, ?)`
  )
  for (const anchor of byTimeline.values()) {
    insert.run(entityId, anchor.timelineId, anchor.anchorYear, anchor.age)
  }
}

import { getDb } from './index'
import { setPlotSceneEntities } from './plotSceneEntities'
import { GUIDE_PLOT_LINES } from './seedGuideBook'
import { DEMO_ENTITIES } from './worldEntitySeedEntities'

/**
 * 统一设定库 demo 种子 · **剧情场景关联**分片（批F）。
 *
 * 从 `worldEntitySeed.ts` 拆出以守住单文件 ≤500 行（§3）：教学书剧情场景经
 * `GUIDE_PLOT_LINES[].scenes[].entityKeys` 声明关联的示范实体（按 `worldEntitySeed` 的
 * demo `key` 引用），本函数在实体创建后按**场景标题**定位 `plot_scenes` 行并整体写入
 * `plot_scene_world_entities`（`setPlotSceneEntities` 先删后插，天然幂等）。
 *
 * 调用时机：`seedDemoWorldEntities` 的播种事务内、实体与引用写入之后（`idByKey` 已就绪）。
 * 另导出 `relinkGuidePlotSceneEntities`（第 9 批）：教学书重灌时演示实体随之重建、id 变化，
 * 由 `chapterSeed.ts` 在实体播种后按**名称**兜底回填，与按 key 回填互为幂等保险。
 */
export function seedGuidePlotSceneEntities(
  bookId: string,
  idByKey: ReadonlyMap<string, number>
): void {
  const findScene = getDb().prepare(
    `SELECT id FROM plot_scenes
     WHERE book_id = ? AND title = ? AND deleted_at IS NULL
     ORDER BY id LIMIT 1`
  )
  for (const line of GUIDE_PLOT_LINES) {
    for (const scene of line.scenes) {
      if (!scene.entityKeys || scene.entityKeys.length === 0) continue
      const row = findScene.get(bookId, scene.title) as { id: number } | undefined
      // 老库未重灌教学书 / 场景被用户删除：跳过，不阻断其余播种。
      if (!row) continue
      const entityRows = scene.entityKeys
        .map((key) => idByKey.get(key))
        .filter((id): id is number => id !== undefined)
        .map((entityId) => ({ entityId }))
      if (entityRows.length === 0) continue
      setPlotSceneEntities(row.id, entityRows)
    }
  }
}

/**
 * 按**实体名称**重建 demo key → 实体 id 映射（不依赖播种事务内的 `idByKey`）。
 *
 * 用途：教学书重灌后演示实体已按新文案重建，id 随之变化，此时需要从统一设定库中
 * 找回同名实体，才能重新建立场景关联。找不到（用户改名 / 删除）的 key 直接跳过，不阻断重灌。
 */
function resolveGuideEntityIds(bookId: string): Map<string, number> {
  const findEntity = getDb().prepare(
    `SELECT id FROM world_entities
     WHERE book_id = ? AND entity_type = ? AND name = ? AND deleted_at IS NULL
     ORDER BY id LIMIT 1`
  )
  const idByKey = new Map<string, number>()
  for (const demo of DEMO_ENTITIES) {
    const row = findEntity.get(bookId, demo.entityType, demo.name) as { id: number } | undefined
    if (row) idByKey.set(demo.key, row.id)
  }
  return idByKey
}

/**
 * 教学书重灌后的**关联设定兜底回填**（第 9 批）：演示实体 id 已随重建变化，
 * 无法复用播种事务内的 `idByKey`，故按现有实体名称重建
 * `plot_scene_world_entities`，保证「关联设定」示范始终可用。
 */
export function relinkGuidePlotSceneEntities(bookId: string): void {
  seedGuidePlotSceneEntities(bookId, resolveGuideEntityIds(bookId))
}

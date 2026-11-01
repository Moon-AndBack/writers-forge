import { getDb } from './index'
import { deleteSetting, getSetting, setSetting } from './settings'
import { addWorldRef, createWorldEntity } from './worldEntities'
import type { WorldEntityType } from './worldEntities'
import { plainTextToDocJson } from './richText'
import { HIERARCHY_SEMANTIC_CODES } from './worldSemanticCodes'
import { seedGuidePlotSceneEntities } from './worldEntityPlotSeed'
import { DEMO_ENTITIES } from './worldEntitySeedEntities'
import { ensureCustomSubtypeByName, ensurePresetSubtypes, listWorldSubtypes } from './worldSubtypes'

/**
 * 教学书「Writer's Forge · 使用指南」的统一设定库 demo 种子。
 *
 * 实体数据在 `worldEntitySeedEntities.ts`（§3 拆分）；本文件负责播种流程。
 * 覆盖五大类（worldview / character / item / faction / power_system）：
 * - 世界观：砚境（世界）、文心城（地点）；两者之间以「上级」示范世界观参与关联关系；
 * - 境界体系：**3 个示例**（文心九境 / 百艺殊途 / 果位与闰位），每个只落「体系」表
 *   的 `kind`；第 6 批起渠道 / 层级 / 晋升边 / 角色境界已下线；
 * - 角色：砚秋（主角）、笔灵（配角）；
 * - 物品功法：锻笔剑（武器）、过目成诵（天赋）走预设子表；
 *   墨玉砚（自定义类型「法器」）走 `world_custom`；
 * - 势力：抄书阁（宗门）、砚京（王朝）、墨阁（商会）分别走
 *   `world_sect` / `world_dynasty` / `world_guild`。
 *
 * 另播种：关系类型字典（上级 / 下级 / 平级 / 属于）、实体间引用（世界观 / 势力层级与
 * 归属语义示范）、**教学书剧情场景的关联设定**
 * （`plot_scene_world_entities`，按 `seedGuideBook/plot.ts` 的 `entityKeys` 回填）。
 *
 * 子类（第 4 批）：种子只声明子类**名称**；`seedEntities` 经 `world_subtypes` 解析 id，
 * 预设名直接复用（角色四类 主角 / 配角 / 龙套 / 反派 均为预设），未命中（如 `法器`）
 * 则新建自定义分类。
 *
 * 幂等：`settings` 键 `worldEntities:seeded:<bookId>` 守卫；同一书只播一次。
 * 若标记缺失但该书已有统一库行（老库重灌 / 标记被清），先物理清空该书实体
 * （子表 / 别名 / 标签 / 自定义键值 / 引用随外键级联）再重播，避免重复。
 * 教学书重灌（`chapterSeed.ts` 的 `MIGRATION_KEY`）会在事务内调用 `clearWorldEntitySeedMarker`，
 * 使演示实体与教学书文案同步刷新。
 */

/** 实体间引用：源 key / 目标 key / 语义码 / 补充说明。 */
interface DemoRef {
  from: string
  to: string
  code: string
  role: string
}

/**
 * 关系示范（世界观与其它四域一样可参与关联关系）：
 * - 砚境 → 文心城「上级」：世界观条目之间也可表达层级；
 * - 砚京 → 抄书阁「上级」：王朝是宗门的上级；
 * - 抄书阁 → 砚京「下级」：宗门受王朝辖制；
 * - 抄书阁 → 墨阁「平级」：同列势力，互不统属；
 * - 锻笔剑 → 砚秋「属于」：物品属于角色（角色 → 物品由界面自动反向写成此方向）；
 * - 砚秋 → 抄书阁「属于」：角色属于势力。
 *
 * 四条码（上级 / 下级 / 平级 / 属于）各至少一条。
 */
const DEMO_REFS: readonly DemoRef[] = [
  { from: 'world', to: 'city', code: 'superior', role: '砚境腹地' },
  { from: 'dynasty', to: 'faction', code: 'superior', role: '砚京下辖' },
  { from: 'faction', to: 'dynasty', code: 'subordinate', role: '受砚京辖制' },
  { from: 'faction', to: 'guild', code: 'peer', role: '同为势力' },
  { from: 'sword', to: 'hero', code: 'belongs_to', role: '砚秋的佩剑' },
  { from: 'hero', to: 'faction', code: 'belongs_to', role: '抄书阁的抄书人' }
]

/** 已播种标记的 settings key（按书隔离）。 */
function seedMarkerKey(bookId: string): string {
  return `worldEntities:seeded:${bookId}`
}

/**
 * 清除指定书籍的 demo 播种标记。
 *
 * 调用点：`chapterSeed.ts` 的教学书重灌事务（第 9 批）。
 * 选择「重灌时删标记」而非再起一套键名：标记本身就是「该书 demo 是否已播」的唯一真源，
 * 删除后 `seedDemoWorldEntities` 自然走既有的「先物理清空、后按新文案重播」分支，
 * 无需第二套重灌键 / 额外清理逻辑，幂等语义不变。
 */
export function clearWorldEntitySeedMarker(bookId: string): void {
  deleteSetting(seedMarkerKey(bookId))
}

/**
 * 写入关系类型字典（全局，幂等）。
 *
 * 字典真源为 `worldSemanticCodes.ts` 的 `HIERARCHY_SEMANTIC_CODES`（上级 / 下级 / 平级
 * 三级 + 属于，`from_type` / `to_type` 均为空 = 全模块通用）；本函数只在每次启动时补齐，
 * `ON CONFLICT(code) DO NOTHING` 保证不覆盖已有展示名。旧语义码由
 * `worldRefsHierarchyMigration.ts` 一次性清理。
 */
export function seedSemanticCodeDictionary(): void {
  const insert = getDb().prepare(
    `INSERT INTO world_semantic_codes (code, from_type, to_type, note) VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO NOTHING`
  )
  for (const code of HIERARCHY_SEMANTIC_CODES) {
    insert.run(code.code, code.fromType, code.toType, code.note)
  }
}

/**
 * 子类名称 → 分类 id 解析器（第 4 批）。
 *
 * 播种只持有子类**名称**（数据常量），分类 id 运行时按 `(bookId, entityType, name)` 查；
 * 命中预设直接复用，未命中（如 `法器`）新建一条自定义分类。
 * 同一批次内缓存，避免重复查询 / 重复建行。
 */
function createSubtypeResolver(
  bookId: string
): (entityType: WorldEntityType, name: string) => number | null {
  const byKey = new Map<string, number>()
  const remember = (entityType: string, name: string, id: number): void => {
    byKey.set(`${entityType}\u0000${name}`, id)
  }
  for (const row of listWorldSubtypes(bookId)) remember(row.entityType, row.name, row.id)
  return (entityType, name) => {
    if (name.trim() === '') return null
    const key = `${entityType}\u0000${name}`
    const found = byKey.get(key)
    if (found !== undefined) return found
    const id = ensureCustomSubtypeByName(bookId, entityType, name)
    remember(entityType, name, id)
    return id
  }
}

/** 播种五类实体（含别名 / 标签 / 正文），返回 key → id。 */
function seedEntities(bookId: string): Map<string, number> {
  const idByKey = new Map<string, number>()
  const resolveSubtypeId = createSubtypeResolver(bookId)
  for (const demo of DEMO_ENTITIES) {
    const created = createWorldEntity({
      bookId,
      entityType: demo.entityType,
      subtypeId: resolveSubtypeId(demo.entityType, demo.subTypeName),
      name: demo.name,
      role: demo.role,
      grade: demo.grade,
      rank: demo.rank,
      aliases: demo.aliases,
      tags: demo.tags,
      body: demo.body,
      // 新库首启即带富文本 JSON（与 `body` 同源，避免编辑器打开为空 / 保存覆盖旧正文）。
      bodyJson: plainTextToDocJson(demo.body),
      worldviewFields: demo.worldviewFields,
      itemFields: demo.itemFields,
      factionFields: demo.factionFields,
      customFields: demo.customFields
    })
    idByKey.set(demo.key, created.id)
  }
  return idByKey
}

/** 播种境界体系「体系」子表（仅 kind）。 */
function seedPowerSystems(idByKey: ReadonlyMap<string, number>): void {
  for (const demo of DEMO_ENTITIES) {
    if (demo.entityType !== 'power_system') continue
    const systemId = idByKey.get(demo.key)
    if (systemId === undefined) continue
    // 体系子行（一对一）：插入主行时触发器已补建空子行，故这里必须 upsert
    //（`OR IGNORE` 会把 kind 静默丢掉）。
    getDb()
      .prepare(
        `INSERT INTO world_power_system (entity_id, kind) VALUES (?, ?)
         ON CONFLICT(entity_id) DO UPDATE SET kind = excluded.kind`
      )
      .run(systemId, demo.kind ?? '')
  }
}

/** 播种实体间通用引用（按 key 解析，语义码须已入字典）。 */
function seedRefs(bookId: string, idByKey: ReadonlyMap<string, number>): void {
  for (const ref of DEMO_REFS) {
    const fromId = idByKey.get(ref.from)
    const toId = idByKey.get(ref.to)
    if (fromId === undefined || toId === undefined) continue
    addWorldRef({
      bookId,
      fromId,
      toId,
      semanticCode: ref.code,
      role: ref.role
    })
  }
}

/**
 * 为指定书籍播种统一设定库 demo 数据（幂等）。
 *
 * 调用点：`database/index.ts` 的 `getDb()`，在 `resetChapterDataOnce` 之后对教学书调用；
 * 书行须已存在。仅当目标书存在于 `books` 表时才播种并落标记。
 */
export function seedDemoWorldEntities(bookId: string): void {
  const db = getDb()
  const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId)
  if (!book) return
  if (getSetting(seedMarkerKey(bookId)) === '1') return

  // 分类表兜底：教学书由 `resetChapterDataOnce` 直插 books（不走 `createBook`），
  // 故播种前幂等补齐 23 条预设子类，保证种子按名称解析到预设而非误建自定义分类。
  ensurePresetSubtypes(bookId)

  db.transaction(() => {
    // 标记缺失但已有实体（老库重灌 / 标记被清）：物理清空该书，子表与附属表随外键级联。
    db.prepare('DELETE FROM world_entities WHERE book_id = ?').run(bookId)
    // 角色子类拆分批：旧演示分类「器灵」已改由预设「配角」承载，清掉遗留的空自定义行
    //（实体刚被清空，旧分类必然无引用；只针对演示专用名，不动其它自定义分类）。
    db.prepare(
      `DELETE FROM world_subtypes
       WHERE book_id = ? AND entity_type = 'character' AND is_custom = 1 AND name = '器灵'
         AND NOT EXISTS (SELECT 1 FROM world_entities WHERE subtype_id = world_subtypes.id)`
    ).run(bookId)
    seedSemanticCodeDictionary()
    const idByKey = seedEntities(bookId)
    seedPowerSystems(idByKey)
    seedRefs(bookId, idByKey)
    seedGuidePlotSceneEntities(bookId, idByKey)
    setSetting(seedMarkerKey(bookId), '1')
  })()
}

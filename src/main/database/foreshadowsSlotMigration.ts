import type Database from 'better-sqlite3'
import { createForeshadowsSchema, foreshadowsTableDdl } from './schema/foreshadows'

/**
 * 一次性迁移：伏笔两个埋点槽位由「主 / 第二」泛化槽位收敛为**语义固定**的双槽位。
 *
 * 旧结构（`anchor_*` 三态 + `anchor2_*` 三态，靠「一章 + 一大纲」组合约束区分）：
 *   `anchor_kind` / `chapter_id` / `outline_item_id` / `paragraph_idx` / `quote` /
 *   `char_start` / `char_end` + `anchor2_*` 同构七列。
 * 新结构（类型固定，槽位由 kind 唯一决定）：
 *   `body_*`（仅章节）+ `outline_*`（仅大纲条目），各自 6 列。
 *
 * 为什么整表重建而不是 `ALTER TABLE RENAME COLUMN`：
 * 1. `RENAME COLUMN` **不会改写 CHECK 约束里的列名**——`anchor_kind` 的
 *    `CHECK (anchor_kind IN ('chapter','outline','none'))` 改名后会指向不存在的列，
 *    约束失效 / 写入报错；`anchor2_kind` 的取值域也要从三态收窄为两态，`RENAME`
 *    无法改约束表达式。
 * 2. 需要**删除** `outline_item_id`（正文槽）与 `anchor2_chapter_id`（大纲槽），
 *    而 `DROP COLUMN` 受 CHECK / 索引 / 外键引用限制，本表两条都踩。
 * 3. 数据要跨槽位**重排**（见下），逐列改名后还得再做一轮搬移，不如一次投影落位。
 * 故对齐 `worldEntitiesDropSubTypeText.ts` 的整表重建先例：建新表 → 显式列复制 →
 * 删旧表 → 改名 → 恢复自增序号 → 重建索引 → 外键自检。
 *
 * 数据迁移口径（老库 `anchor_kind` 可能为 `'outline'`）：
 * 旧数据允许「主槽 = 大纲锚点、第二槽 = 章节锚点」的组合，因此**不能**只按列位置
 * 直接映射，而要按 `kind` 归位：
 * - 章节锚点取「主槽 kind='chapter'，否则第二槽 kind='chapter'」（主槽优先）；
 * - 大纲锚点取「主槽 kind='outline'，否则第二槽 kind='outline'」（主槽优先）。
 * 两者互不覆盖，任意旧组合（含 `anchor_kind='outline'` + `anchor2_kind='chapter'`）
 * 都能无损落到 `body_*` / `outline_*`。旧数据中同类型双埋属非法态（数据层早已禁止），
 * 万一存在则保留主槽、丢弃第二槽。
 *
 * 幂等：以 `PRAGMA table_info` **是否仍含旧列 `anchor_kind`** 为唯一判据（列探测比
 * 守卫键更可靠：用户替换 / 回滚数据库文件后守卫键可能残留）。迁移完成后写入
 * settings 键 `foreshadows:bodyOutlineSlots:v1` 作为审计标记，不参与跳过判定。
 */
const SLOT_MIGRATION_KEY = 'foreshadows:bodyOutlineSlots:v1'

/** 新表列顺序（与 {@link buildCopyExpressions} 的投影表达式一一对应）。 */
const TARGET_COLUMNS: readonly string[] = [
  'id',
  'book_id',
  'title',
  'description',
  'description_json',
  'recovery_note',
  'status',
  'body_kind',
  'body_chapter_id',
  'body_paragraph_idx',
  'body_quote',
  'body_char_start',
  'body_char_end',
  'outline_kind',
  'outline_item_id',
  'outline_paragraph_idx',
  'outline_quote',
  'outline_char_start',
  'outline_char_end',
  'recover_anchor_kind',
  'recover_chapter_id',
  'recover_outline_item_id',
  'recover_paragraph_idx',
  'recover_quote',
  'recover_char_start',
  'recover_char_end',
  'created_at',
  'updated_at',
  'deleted_at'
]

/** 实测某表列名集合（表不存在时返回空集）。 */
function readColumnNames(instance: Database.Database, table: string): Set<string> {
  const rows = instance.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

/** 写入迁移审计键（迁移内直读写，避免重入 `getDb()`；已存在则不动，避免每次启动刷新时间戳）。 */
function markMigrationDone(instance: Database.Database): void {
  instance
    .prepare(`INSERT INTO settings (key, value) VALUES (?, '1') ON CONFLICT(key) DO NOTHING`)
    .run(SLOT_MIGRATION_KEY)
}

/** 恢复 AUTOINCREMENT 序号：取旧序号与新最大 id 的较大者（避免删过的 id 被复用）。 */
function restoreAutoincrementSeq(instance: Database.Database, oldSeq: number | null): void {
  if (oldSeq === null) return
  const current = instance
    .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'foreshadows'")
    .get() as { seq: number } | undefined
  if (current) {
    instance
      .prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'foreshadows'")
      .run(oldSeq)
  } else {
    instance
      .prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('foreshadows', ?)")
      .run(oldSeq)
  }
}

/**
 * 生成 `INSERT ... SELECT` 的投影表达式（按旧库**实际列**生成，缺列回落新表默认值）。
 *
 * 章节锚点 / 大纲锚点各自由 `kind` 归位，`quote` 为 NOT NULL 列故回落空串，
 * 其余可空列回落 `NULL`。`recover_*` 与条目字段原样复制。
 */
function buildCopyExpressions(columns: Set<string>): string[] {
  const col = (name: string, fallback: string): string => (columns.has(name) ? name : fallback)
  // 旧槽位类型表达式（极端老库可能还没有 anchor2_* 列，视为 'none'）。
  const primaryKind = columns.has('anchor_kind') ? 'anchor_kind' : `'none'`
  const secondaryKind = columns.has('anchor2_kind') ? 'anchor2_kind' : `'none'`

  /** 从两个旧槽位中取指定类型锚点的某字段：主槽优先，其次第二槽，都缺则回落。 */
  const fromSlot = (
    kind: 'chapter' | 'outline',
    primaryColumn: string,
    secondaryColumn: string,
    fallback: string
  ): string =>
    `CASE WHEN ${primaryKind} = '${kind}' THEN ${col(primaryColumn, fallback)} ` +
    `WHEN ${secondaryKind} = '${kind}' THEN ${col(secondaryColumn, fallback)} ` +
    `ELSE ${fallback} END`

  return [
    'id',
    'book_id',
    'title',
    'description',
    // 富文本真源：极老库（触发本次重建 = 仍有 `anchor_kind`）必然没有该列，回落 NULL，
    // 由后续 `foreshadowsRichDescriptionMigration` 从 `description` 回填；若库已同时含
    // 该列则原样保留，避免重建丢数据。
    col('description_json', 'NULL'),
    col('recovery_note', `''`),
    'status',
    // 正文埋点：只收章节锚点。
    `CASE WHEN ${primaryKind} = 'chapter' OR ${secondaryKind} = 'chapter' ` +
      `THEN 'chapter' ELSE 'none' END`,
    fromSlot('chapter', 'chapter_id', 'anchor2_chapter_id', 'NULL'),
    fromSlot('chapter', 'paragraph_idx', 'anchor2_paragraph_idx', 'NULL'),
    fromSlot('chapter', 'quote', 'anchor2_quote', `''`),
    fromSlot('chapter', 'char_start', 'anchor2_char_start', 'NULL'),
    fromSlot('chapter', 'char_end', 'anchor2_char_end', 'NULL'),
    // 大纲埋点：只收大纲条目锚点。
    `CASE WHEN ${primaryKind} = 'outline' OR ${secondaryKind} = 'outline' ` +
      `THEN 'outline' ELSE 'none' END`,
    fromSlot('outline', 'outline_item_id', 'anchor2_outline_item_id', 'NULL'),
    fromSlot('outline', 'paragraph_idx', 'anchor2_paragraph_idx', 'NULL'),
    fromSlot('outline', 'quote', 'anchor2_quote', `''`),
    fromSlot('outline', 'char_start', 'anchor2_char_start', 'NULL'),
    fromSlot('outline', 'char_end', 'anchor2_char_end', 'NULL'),
    // 回收点：结构未变，原样复制（缺列回落默认值）。
    col('recover_anchor_kind', `'none'`),
    col('recover_chapter_id', 'NULL'),
    col('recover_outline_item_id', 'NULL'),
    col('recover_paragraph_idx', 'NULL'),
    col('recover_quote', `''`),
    col('recover_char_start', 'NULL'),
    col('recover_char_end', 'NULL'),
    'created_at',
    'updated_at',
    'deleted_at'
  ]
}

/** 执行迁移（幂等；失败整体回滚，外键开关在 finally 复位）。 */
export function migrateForeshadowsBodyOutlineSlots(instance: Database.Database): void {
  const columns = readColumnNames(instance, 'foreshadows')
  // 新库首启（表尚未建）或已收敛（无 anchor_kind）：只记审计键后返回。
  if (!columns.has('anchor_kind')) {
    markMigrationDone(instance)
    return
  }

  // 建表 / 删表 / 改名期间关闭外键：避免 DROP 与 RENAME 触发级联 / 引用重写。
  instance.pragma('foreign_keys = OFF')
  try {
    instance.transaction(() => {
      const oldSeqRow = instance
        .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'foreshadows'")
        .get() as { seq: number } | undefined

      instance.exec('DROP TABLE IF EXISTS foreshadows_new')
      instance.exec(foreshadowsTableDdl('foreshadows_new'))
      instance.exec(
        `INSERT INTO foreshadows_new (${TARGET_COLUMNS.join(', ')})
         SELECT ${buildCopyExpressions(columns).join(',\n                ')}
         FROM foreshadows`
      )
      instance.exec('DROP TABLE foreshadows')
      instance.exec('ALTER TABLE foreshadows_new RENAME TO foreshadows')
      restoreAutoincrementSeq(instance, oldSeqRow?.seq ?? null)
      // 旧表索引随 DROP 消失，重建新索引（同时保证新库路径与迁移路径索引一致）。
      createForeshadowsSchema(instance)

      // 只校验本表外键：避免其他域的历史脏数据阻塞本迁移。
      const violations = instance.pragma('foreign_key_check(foreshadows)') as unknown[]
      if (violations.length > 0) {
        throw new Error(`foreshadows 双槽位重建后外键校验失败：${violations.length} 行`)
      }
      markMigrationDone(instance)
    })()
  } finally {
    instance.pragma('foreign_keys = ON')
  }
}

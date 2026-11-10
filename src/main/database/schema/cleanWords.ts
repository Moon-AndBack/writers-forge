import type Database from 'better-sqlite3'
import {
  CLEAN_WORD_CATEGORY_CHECK,
  toCleanWordCategory,
  type CleanWordCategory
} from '../cleanWordCategories'
import { importCleanWords } from '../cleanWords'
import { listBuiltinCleanWords } from '../cleanWordSeed'

/**
 * 违禁词库 schema（`clean_word_list`）+ 旧工具明细表下线迁移 + 内置词库首次播种。
 *
 * 定位：**全局共享**的违禁 / 敏感词表（不含 `book_id`，所有书籍共用一份），
 * 供正文检测与替换提示使用；命中只提示不阻断，词库内容由数据层分批导入。
 *
 * 结构（1 表 + 2 命名索引）：
 * - `word`：词条本体，**唯一**（`UNIQUE (word)`）——一个词只归一个类别，避免同一处
 *   文本被重复命中、也避免同一词在两个类别下各报一次；
 * - `category`：命中类别（`sexual` / `minorSexual` / `gambling` / `drug` / `fraud` /
 *   `violence` / `weapon` / `minor` / `other`，单一真源见 `../cleanWordCategories.ts`），
 *   SQL CHECK 守卫；
 * - `source`：来源（`builtin` 内置词库 / `user` 用户自建），SQL CHECK 守卫；
 *   `builtin` 行**不可删除只能禁用**（见 `../cleanWords.ts` 的 `deleteCleanWord`）；
 * - `replacement`：建议替代词，空串表示「只提示、不给替代」；
 * - `enabled`：启用状态（`0` / `1`），SQL CHECK 守卫，检测只扫 `enabled = 1`；
 * - `sort_order`：词表内展示顺序真源（同序按 `id` 升序兜底）；
 * - `updated_at`：写入时由数据层刷新（`datetime('now')`）。
 *
 * 索引取舍（查询模式见 `../cleanWords.ts`）：
 * - `idx_clean_word_list_enabled_category (enabled, category)`：**检测热路径**
 *   `WHERE enabled = 1` 走最左前缀，可按类别分组展示而免回表排序；
 * - `idx_clean_word_list_source_category (source, category)`：设置页按来源过滤的最左前缀，
 *   同时覆盖 `countCleanWords` 的 `GROUP BY source, category` 扫描。
 * - 纯类别过滤（不带 `enabled` / `source`）在全表只有数千行的量级下直接扫表即可，
 *   不为它单独建 `(category)` 索引（写入放大不划算）。
 * - `UNIQUE (word)` 由 SQLite 生成隐式索引（`sqlite_autoindex_*`），属自动对象，
 *   **不**登记 `diagnostics/expected.ts` 的 `EXPECTED_INDEXES`。
 *
 * 幂等：全部 `CREATE ... IF NOT EXISTS`；内置词条的首次灌入由本文件末尾的
 * `seedBuiltinCleanWords` 负责（settings 键守卫，只执行一次）。
 */
export function createCleanWordsSchema(db: Database.Database): void {
  db.exec(cleanWordTableDdl())
  createCleanWordIndexes(db)
}

/**
 * `clean_word_list` 建表 DDL（迁移重建 `_new` 表时复用同一份定义，避免结构漂移）。
 *
 * 表名由调用方传入（仅迁移内部使用 `clean_word_list_new`），不接受外部输入。
 */
export function cleanWordTableDdl(tableName = 'clean_word_list'): string {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other'
        CHECK (category IN (${CLEAN_WORD_CATEGORY_CHECK})),
      source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('builtin', 'user')),
      replacement TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (word)
    )
  `
}

/** 建两个命名索引（迁移重建表后复用，与新库同一份定义）。 */
export function createCleanWordIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_clean_word_list_enabled_category
      ON clean_word_list(enabled, category)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_clean_word_list_source_category
      ON clean_word_list(source, category)
  `)
}

/** 一次性迁移守卫键：旧工具明细表（禁用词 / 替代词）下线。 */
const LEGACY_WORD_TABLES_DROP_KEY = 'cleanWords:dropWorldDetails:v1'

/** 类别 schema 迁移守卫键（记录用；是否为旧表以 `sqlite_master` 的 CHECK 文本为准）。 */
const CLEAN_WORD_CATEGORIES_KEY = 'cleanWords:categories:v1'

/** 读取主表建表 SQL（用于判断 CHECK 是否已含新类别 `'minorSexual'`）。 */
function readCleanWordTableSql(instance: Database.Database): string {
  const row = instance
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'clean_word_list'")
    .get() as { sql: string } | undefined
  return row?.sql ?? ''
}

/** 旧表行（列名与 `clean_word_list` 逐字对应，类别按原始字符串读入后再映射）。 */
interface LegacyCleanWordRow {
  id: number
  word: string
  category: string
  source: string
  replacement: string
  enabled: number
  sort_order: number
  updated_at: string
}

/** 恢复 AUTOINCREMENT 序号：取旧序号与新最大 id 的较大者（参考 `worldPowerSystemMigration`）。 */
function restoreCleanWordSequence(instance: Database.Database, oldSeq: number | null): void {
  if (oldSeq === null) return
  const current = instance
    .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'clean_word_list'")
    .get() as { seq: number } | undefined
  if (current) {
    instance
      .prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'clean_word_list'")
      .run(oldSeq)
  } else {
    instance
      .prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('clean_word_list', ?)")
      .run(oldSeq)
  }
}

/** 写入类别迁移守卫键。 */
function markCleanWordCategoriesDone(instance: Database.Database): void {
  instance
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(CLEAN_WORD_CATEGORIES_KEY)
}

/**
 * 一次性迁移：把 `clean_word_list.category` 的 CHECK 从旧 6 类收敛到新 9 类。
 *
 * 背景：SQLite **无法 ALTER CHECK**，只能重建主表；旧类别按
 * `toCleanWordCategory`（`../cleanWordCategories.ts`）映射——`political` / `profanity` /
 * `ads` → `other`，其余未知值也回退 `other`，**用户词条与全部字段（id / word /
 * category / enabled / replacement / source / sort_order / updated_at）一律保留**。
 *
 * 幂等：以 `sqlite_master.sql` 是否已含 `'minorSexual'` 为**结构性判据**，新库 /
 * 已迁移库直接返回（不依赖守卫键，避免键丢失 / 库回滚错配导致重复重建）；
 * `cleanWords:categories:v1` 仅作迁移完成记录。整体事务包裹，失败回滚且不置键。
 *
 * 顺序（不可交换）：
 * 1. `PRAGMA foreign_keys = OFF` 在**事务外**（事务内设置被忽略）；
 * 2. 建 `clean_word_list_new` → 读旧行 + JS 映射类别 → 预编译 INSERT 写入；
 * 3. `DROP TABLE clean_word_list` → `ALTER TABLE clean_word_list_new RENAME TO clean_word_list`；
 * 4. 恢复 `sqlite_sequence` → 重建两个索引 → `PRAGMA foreign_key_check`（有违例抛错回滚）；
 * 5. `finally` 恢复 `PRAGMA foreign_keys = ON`。
 *
 * 须在 `createCleanWordsSchema` 之后（表已存在）、`migrateDropLegacyWordTables` 之前调用。
 */
export function migrateCleanWordCategories(instance: Database.Database): void {
  const tableSql = readCleanWordTableSql(instance)
  // 无表（理论上不会发生，createCleanWordsSchema 已先执行）/ 已是新结构：直接返回。
  if (tableSql === '' || tableSql.includes("'minorSexual'")) return

  const oldSeqRow = instance
    .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'clean_word_list'")
    .get() as { seq: number } | undefined
  const oldSeq = oldSeqRow?.seq ?? null

  instance.pragma('foreign_keys = OFF')
  try {
    instance.transaction(() => {
      instance.exec('DROP TABLE IF EXISTS clean_word_list_new')
      instance.exec(cleanWordTableDdl('clean_word_list_new'))

      const rows = instance
        .prepare(
          `SELECT id, word, category, source, replacement, enabled, sort_order, updated_at
           FROM clean_word_list`
        )
        .all() as LegacyCleanWordRow[]
      const insert = instance.prepare(
        `INSERT INTO clean_word_list_new
           (id, word, category, source, replacement, enabled, sort_order, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const row of rows) {
        insert.run(
          row.id,
          row.word,
          toCleanWordCategory(row.category),
          row.source,
          row.replacement,
          row.enabled,
          row.sort_order,
          row.updated_at
        )
      }

      instance.exec('DROP TABLE clean_word_list')
      instance.exec('ALTER TABLE clean_word_list_new RENAME TO clean_word_list')

      restoreCleanWordSequence(instance, oldSeq)
      createCleanWordIndexes(instance)

      const violations = instance.prepare('PRAGMA foreign_key_check').all() as unknown[]
      if (violations.length > 0) {
        throw new Error(`clean_word_list 重建后外键校验失败：${violations.length} 行`)
      }

      markCleanWordCategoriesDone(instance)
    })()
  } finally {
    instance.pragma('foreign_keys = ON')
  }
}

/**
 * 待下线表：`schema/worldDetails.ts` 原「实体维度禁用词 / 替代词映射」两表，
 * 已由全局 `clean_word_list` 取代（用户已确认旧数据无需保留）。
 */
const DROPPED_LEGACY_WORD_TABLES: readonly string[] = [
  'world_forbidden_words',
  'world_substitutions'
]

/**
 * 一次性迁移：`DROP TABLE` 下线旧工具明细表（`world_forbidden_words` /
 * `world_substitutions`）。
 *
 * 背景：`CREATE TABLE IF NOT EXISTS` 不会删表，老库残留会让自检报
 * `structure.extraTable` / `structure.extraIndex`。删表前已人工核对两表行数均为 0。
 *
 * 幂等：settings 键 `cleanWords:dropWorldDetails:v1` 守卫（只执行一次），
 * `DROP TABLE IF EXISTS` 本身也幂等；整体事务包裹，任一步失败即回滚且不置键，
 * 下次启动自动重试。只删固定白名单表名（非用户输入），拼接安全。
 * 须在 `createCleanWordsSchema` 之后调用（与自检清单对齐）。
 */
export function migrateDropLegacyWordTables(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(LEGACY_WORD_TABLES_DROP_KEY)
  if (done) return

  instance.transaction(() => {
    for (const table of DROPPED_LEGACY_WORD_TABLES) {
      instance.exec(`DROP TABLE IF EXISTS ${table}`)
    }
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(LEGACY_WORD_TABLES_DROP_KEY)
  })()
}

/** 内置词库播种守卫键。 */
const BUILTIN_SEED_KEY = 'cleanWords:seed:v1'

/**
 * 首次启动把内置违禁词灌入 `clean_word_list`（`source = 'builtin'`）。
 *
 * - 词条来源：`listBuiltinCleanWords()`（`../cleanWordSeed`，860 条原始词条 / 853 个
 *   不重复词；跨类别重复词按**后出现的类别**落库，`word` 唯一，故实际入库 853 行）。
 * - 写入走 `importCleanWords(words, 'builtin')`：同一事务批量 upsert，新词 `enabled = 1`，
 *   已存在的同词**保留用户 `enabled` 意图**（不复活用户已禁用的词）。
 * - 守卫键 `cleanWords:seed:v1`：只执行一次；清空内置库后不会自动重灌
 *   （用户主动删 / 禁的意图优先于词库）。
 * - 与 `migrateDropLegacyWordTables` 一样在事务内执行，失败回滚且不置键，下次启动重试。
 * - 守卫值存导入结果 `{ inserted, updated, skipped }` 的 JSON，便于排查。
 * - 须在 `createCleanWordsSchema` 之后调用；须在 `getDb()` 初始化阶段调用——本函数与
 *   `importCleanWords` 均以 `instance` / 单例 `db` 落库，此刻两者为同一连接。
 */
export function seedBuiltinCleanWords(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(BUILTIN_SEED_KEY)
  if (done) return

  instance.transaction(() => {
    // 内置词表仍以旧三类（ads / sexual / violence）维护：入库前经单一真源映射到新 9 类
    // （ads → other；下一批由种子重新归类到 sexual / gambling / fraud）。
    const words = listBuiltinCleanWords().map(
      (entry): { word: string; category: CleanWordCategory } => ({
        word: entry.word,
        category: toCleanWordCategory(entry.category)
      })
    )
    // 外层事务 + `importCleanWords` 内层事务：better-sqlite3 会自动降级为 SAVEPOINT。
    const result = importCleanWords(words, 'builtin')
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(BUILTIN_SEED_KEY, JSON.stringify(result))
  })()
}

/**
 * 违禁词库初始化装配：建表 → 类别 schema 迁移 → 旧工具明细表下线 → 内置词库首次播种
 * （**顺序不可调换**）。
 *
 * 供 `getDb()` 单行调用，避免在 `index.ts`（单文件 500 行硬上限）里堆叠多条调用。
 */
export function applyCleanWordsSetup(instance: Database.Database): void {
  createCleanWordsSchema(instance)
  migrateCleanWordCategories(instance)
  migrateDropLegacyWordTables(instance)
  seedBuiltinCleanWords(instance)
}

import type Database from 'better-sqlite3'
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
 * - `category`：命中类别（`political` / `sexual` / `violence` / `ads` / `profanity` /
 *   `other`），SQL CHECK 守卫；
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS clean_word_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other'
        CHECK (category IN ('political', 'sexual', 'violence', 'ads', 'profanity', 'other')),
      source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('builtin', 'user')),
      replacement TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (word)
    )
  `)

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
    // 外层事务 + `importCleanWords` 内层事务：better-sqlite3 会自动降级为 SAVEPOINT。
    const result = importCleanWords(listBuiltinCleanWords(), 'builtin')
    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(BUILTIN_SEED_KEY, JSON.stringify(result))
  })()
}

/**
 * 违禁词库初始化装配：建表 → 旧工具明细表下线 → 内置词库首次播种（**顺序不可调换**）。
 *
 * 供 `getDb()` 单行调用，避免在 `index.ts`（单文件 500 行硬上限）里堆叠多条调用。
 */
export function applyCleanWordsSetup(instance: Database.Database): void {
  createCleanWordsSchema(instance)
  migrateDropLegacyWordTables(instance)
  seedBuiltinCleanWords(instance)
}

import type Database from 'better-sqlite3'
import { countEffectiveChars } from './wordCount'

/**
 * 一次性回填 `chapters.word_count`（老库升级路径）。
 *
 * 背景：书架统计原实现 `stats.bookStatsAll` 会 join `paragraphs` 把全库正文读进主进程内存，
 * 逐字符统计有效字数（百万字库 0.3–1s，同步阻塞）。现改为字数落列、保存时增量维护，
 * 但老库新增的 `word_count` 列默认 0，必须回填一次才能保持书架数字不变。
 *
 * 口径：与 `saveParagraphs` / 原 `bookStatsAll` 完全一致 —— `countEffectiveChars`，
 * 排除 `\p{P}` 标点、`\p{S}` 符号、`\p{Z}` 空白、`\p{C}` 控制符。
 *
 * 范围：**全部章（含软删章）**。删章不清列，回收站还原后字数才能直接恢复；
 * 统计仍按 `deleted_at IS NULL` 过滤，软删行不影响书架数字。
 *
 * 事务与幂等：整体单事务，遍历未删 / 软删全部章、逐章读段落写回列值，最后置守卫键
 * `chapters:wordCount:v1`（同事务）；任一步失败整体回滚且不置键，下次启动自动重试。
 *
 * 开销：全库扫描，仅升级后首次启动执行一次；百万字库约 0.5–2s（读段落 + 逐字符统计 +
 * 写回），之后书架统计只读列。调用点在 `database/index.ts` 的 `getDb()`，同步执行，
 * 会推迟首窗创建（`getDb()` 早于 `createMainWindow()`）。
 */
const WORD_COUNT_MIGRATION_KEY = 'chapters:wordCount:v1'

/** 回填 `chapters.word_count`（幂等，受 settings 守卫键保护）。 */
export function migrateChapterWordCounts(instance: Database.Database): void {
  const done = instance
    .prepare('SELECT 1 FROM settings WHERE key = ?')
    .get(WORD_COUNT_MIGRATION_KEY)
  if (done) return

  instance.transaction(() => {
    const chapters = instance.prepare('SELECT id FROM chapters').all() as Array<{ id: number }>
    const readTexts = instance.prepare('SELECT text FROM paragraphs WHERE chapter_id = ?')
    const update = instance.prepare('UPDATE chapters SET word_count = ? WHERE id = ?')

    for (const chapter of chapters) {
      const rows = readTexts.all(chapter.id) as Array<{ text: string }>
      update.run(countEffectiveChars(rows.map((row) => row.text)), chapter.id)
    }

    instance
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(WORD_COUNT_MIGRATION_KEY)
  })()
}

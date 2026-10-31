import type Database from 'better-sqlite3'

/**
 * 写作统计 schema：`daily_stats`（按自然日累计的有效字数增量）。
 *
 * 设计要点：
 * - `date` 为**本地日历日**键（`YYYY-MM-DD`，取法见 `database/stats.ts` 的 `localDateKey`），
 *   主键唯一，天然幂等；
 * - `words` 为当日**净增量**（保存正文前后有效字数之差累加），允许为负——跨日删除旧文会
 *   使当日净增为负，查询层（`todayWords`）再 `max(0, …)` 兜底展示；
 * - 该表仅为「今日写作 / 连续写作天数」服务，是**增量流水**；「累计字数」另取每本书真实
 *   正文字数和（`bookStatsAll`），不以本表求和为准（种子书正文不经保存写入，本表不含其历史）。
 *
 * 幂等建表（`CREATE ... IF NOT EXISTS`），老库在 `getDb()` 首次打开时执行补齐，无数据回填。
 */
export function createDailyStatsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      words INTEGER NOT NULL DEFAULT 0
    )
  `)
}

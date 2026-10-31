import { getDb } from './index'
import { countEffectiveChars } from './wordCount'

/**
 * 写作统计域：每日写作增量流水（`daily_stats`）+ 全书真实字数 / 章数聚合。
 *
 * 口径决策：
 * - **今日写作 / 连续写作天数**：基于 `daily_stats`（`date` 为本地日历日，`words` 为当日净增量）。
 *   统计栏是**书架（全书）口径**，故本表**不按书分**——用户需求即「书架统计栏」。
 * - **累计字数**：取**所有书成书正文的实际有效字数和**（`bookStatsAll` 求和），而非 `daily_stats`
 *   求和。原因：种子书正文不经 `documents:saveParagraphs` 写入，`daily_stats` 不含其历史，
 *   求和会漏算；直接按正文字数聚合才与卡片一致且真实。
 */

/** 单本书的真实统计：章数 / 已定稿章数 / 有效字数 / 进度。 */
export interface BookStats {
  /** 未删除章数 */
  chapters: number
  /** 未删除章中状态为 `done`（定稿）的章数 */
  done: number
  /** 全部未删除章正文的有效字数之和（口径见 wordCount.ts） */
  words: number
  /**
   * 写作进度 0–100：**按定稿章数占比**推导（`done / chapters`，四舍五入；无章为 0）。
   * 说明：书籍未设定字数目标，无法用字数/目标字数；定稿占比是当前唯一
   * 真实可用的进度信号，替代此前种子书硬编码的 `progress` 值。
   */
  progress: number
}

interface BookAggRow {
  bookId: string
  chapters: number
  done: number
}

interface TextRow {
  bookId: string
  text: string
}

/**
 * 本地日历日键（`YYYY-MM-DD`）。
 *
 * 取法：直接用 `Date` 的**本地**年 / 月 / 日（`getFullYear` 等），即跟随本机时区与日历日，
 * 与用户直觉一致；不使用 UTC（`toISOString`），避免东八区凌晨写作被记到前一日。
 * 跨时区 / 夏令时切换时以「本机当前日」为准，历史键不回改。
 */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 某章当前的有效字数（读段落表按 `chapter_id` 求和），用于保存前后差量。
 *
 * 归属列随 `documents` 表删除改为 `chapter_id`（段落直接挂章），无 `document_id`。
 */
export function chapterEffectiveWords(chapterId: number): number {
  const rows = getDb()
    .prepare('SELECT text FROM paragraphs WHERE chapter_id = ?')
    .all(chapterId) as Array<{ text: string }>
  return countEffectiveChars(rows.map((row) => row.text))
}

/**
 * 登记**当日净增量**：把「本次保存后有效字数 − 保存前有效字数」UPSERT 累加到今日。
 *
 * 为何用差量而非累加总量：反复保存同一内容时差量为 0，天然不重复计数；只有真实增删才改变当日值。
 * 负值处理：删字 / 删段使差量为负，直接累加（当日净增可为负）；展示层 `todayWords` 以 `max(0, …)`
 * 兜底，连续天数以 `words > 0` 判定，均不受负值误伤。
 *
 * 注意：差值**并入「今天」**（而非保存发生的历史日），符合「今日写作」语义。
 *
 * @param before 保存前该文档的有效字数（调用方在写库前取得）
 * @param texts  本次保存的段落文本
 * @returns 实际登记的差量（0 表示无变化，未写库）。
 */
export function recordDailyDelta(before: number, texts: readonly string[]): number {
  const after = countEffectiveChars(texts)
  const delta = after - before
  if (delta === 0) return 0

  getDb()
    .prepare(
      `INSERT INTO daily_stats (date, words) VALUES (?, ?)
       ON CONFLICT(date) DO UPDATE SET words = words + excluded.words`
    )
    .run(localDateKey(), delta)
  return delta
}

/** 今日写作字数（可为负的净增量，展示口径取 `max(0, …)`）。 */
export function todayWords(): number {
  const row = getDb()
    .prepare('SELECT words FROM daily_stats WHERE date = ?')
    .get(localDateKey()) as { words: number } | undefined
  return Math.max(0, row?.words ?? 0)
}

/**
 * 连续写作天数：从「有记录锚点」向前逐日回溯。
 *
 * 判定：
 * - 锚点 = 今天若今日 `words > 0`，否则取昨天（今日尚未写作不算断档，保留昨日连续数）；
 * - 从锚点起向前逐日要求 `date` 存在于「`words > 0` 的日期集合」，缺一天即止；
 * - 跨日以本地日历日为准；未来日期的记录不参与。
 */
export function streakDays(): number {
  const dates = new Set(
    (
      getDb().prepare('SELECT date FROM daily_stats WHERE words > 0').all() as Array<{
        date: string
      }>
    ).map((row) => row.date)
  )

  const cursor = new Date()
  if (!dates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (dates.has(localDateKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/**
 * 全部书的真实统计（**批量单次查询**，键为 `bookId`）。
 *
 * 性能：一次 `GROUP BY chapters` 取章数 / 定稿数，一次 join `paragraphs` 取全部正文文本，
 * 在内存按书聚合有效字数——避免「逐书 N 次查询 / N 次 IPC」。无章的书籍不出现在结果中，
 * 由调用方按缺省 0 处理。
 */
export function bookStatsAll(): Record<string, BookStats> {
  const db = getDb()

  const aggRows = db
    .prepare(
      `SELECT book_id AS bookId, COUNT(*) AS chapters,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
       FROM chapters WHERE deleted_at IS NULL GROUP BY book_id`
    )
    .all() as BookAggRow[]

  const textRows = db
    .prepare(
      `SELECT c.book_id AS bookId, p.text AS text
       FROM paragraphs p JOIN chapters c ON c.id = p.chapter_id
       WHERE c.deleted_at IS NULL`
    )
    .all() as TextRow[]

  const textsByBook = new Map<string, string[]>()
  for (const row of textRows) {
    const list = textsByBook.get(row.bookId)
    if (list) list.push(row.text)
    else textsByBook.set(row.bookId, [row.text])
  }

  const result: Record<string, BookStats> = {}
  for (const row of aggRows) {
    const chapters = row.chapters
    const done = row.done ?? 0
    result[row.bookId] = {
      chapters,
      done,
      words: countEffectiveChars(textsByBook.get(row.bookId) ?? []),
      progress: chapters > 0 ? Math.round((done / chapters) * 100) : 0
    }
  }
  return result
}

/** 全书累计有效字数（= `bookStatsAll` 各书字数之和，与卡片同口径）。 */
export function totalWords(): number {
  const all = bookStatsAll()
  let sum = 0
  for (const stats of Object.values(all)) sum += stats.words
  return sum
}

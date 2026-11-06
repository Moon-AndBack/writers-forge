import { getDb } from './index'
import { listBooks } from './books'
import {
  GUIDE_BOOK,
  GUIDE_OUTLINE,
  GUIDE_OUTLINE_STANDALONE,
  GUIDE_PLOT_LINES,
  GUIDE_VOLUMES
} from './seedGuideBook'
import type { SeedChapter, SeedOutlineDoc } from './seedBlocks'
import { createChapter, createVolume, setChapterPin } from './chapters'
import { createOutlineGroup, createOutlineItem } from './outline/chapters'
import { saveOutlineContent } from './outline/content'
import { createPlotLine, createPlotScene } from './plot'
import { relinkGuidePlotSceneEntities } from './worldEntityPlotSeed'
import { clearWorldEntitySeedMarker, seedDemoWorldEntities } from './worldEntitySeed'
import { getSetting, setSetting } from './settings'
import { saveParagraphs } from './paragraphs'
import { CHAPTER_SEED_VERSION } from './chapterSeedLog'
import { logger } from '../logger'

/** 章节种子域日志 scope。 */
const log = logger.scope('chapterSeed')

/**
 * 种子域一次性数据重建（新结构 → 教学书）。
 *
 * 首次启动（或旧库升级）时，把**教学书**「Writer's Forge · 使用指南」重建为唯一示范内容：
 * - 书籍：`seedGuideBook/volumes.ts` 的 `GUIDE_BOOK`（固定 id `guide`）；
 * - 卷 / 章：卷 = 功能分区（`kind='normal'` 正文卷）、章 = 具体功能
 *   （正文块级 JSON：heading + bulletList + bold，经 `saveParagraphs` 挂 `chapter_id`）；
 * - 卷纲：`createVolume` 建卷时**同事务**自动建卷纲行（`scope='volume'`），教学书无需另建；
 * - 大纲：分组 = 功能分区（`createOutlineGroup` → `volumes.kind='group'` 行）、
 *   条目 = 功能要点（`createOutlineItem` 挂分组 id），另有一条置顶独立条目；
 *   条目正文**整条内联**进 `outline_items.content_json`（经 `saveOutlineContent`）。
 *
 * **幂等**：以 `settings` 键 `MIGRATION_KEY` 常量标记，只执行一次；
 * 绝不每次启动清库，也不会因用户之后删空章节而再次填充
 * （更换重灌键可强制老库重灌）。
 *
 * 重灌范围（第 8 批收敛）：仅重建**教学书**（`GUIDE_BOOK.id`）的数据——章节域 / 大纲域 /
 * 示范剧情线 / 演示设定实体；用户自建书籍的正文、卷章、大纲、剧情与设定数据都不受影响。
 *
 * 版本与变更日志见 `chapterSeedLog.ts`：`CHAPTER_SEED_VERSION` 为当前版本，
 * 该文件记录逐版教学文案与结构变化。
 */

/** 迁移完成标记的 settings key（值随 `CHAPTER_SEED_VERSION` 提升，强制老库重灌种子）。 */
const MIGRATION_KEY = `chapterData:${CHAPTER_SEED_VERSION}:migrated`

/**
 * 重建教学书的卷 / 章（章节域）。卷序即 `GUIDE_VOLUMES` 顺序；
 * 卷经 `createVolume`（同事务建卷纲行），章经 `createChapter`。
 */
function seedGuideChapters(bookId: string): void {
  for (const volume of GUIDE_VOLUMES) {
    const createdVolume = createVolume(bookId, { kind: volume.kind, title: volume.title })
    for (const chapter of volume.chapters) {
      seedGuideChapter(bookId, createdVolume.id, chapter)
    }
  }
}

/** 建单章并写正文 / pin（`SeedChapter` → `createChapter` 参数映射）。 */
function seedGuideChapter(bookId: string, volumeId: number, chapter: SeedChapter): void {
  const createdChapter = createChapter(bookId, {
    volumeId,
    title: chapter.title ?? '',
    specialPrefix: chapter.specialPrefix ?? null,
    kind: chapter.kind ?? 'normal',
    status: chapter.status
  })
  if (chapter.paragraphs && chapter.paragraphs.length > 0) {
    // 正文直接以 chapterId 落 paragraphs（documents 表已删除）。
    saveParagraphs(createdChapter.id, chapter.paragraphs)
  }
  if (createdChapter.kind === 'special' && chapter.pin !== undefined) {
    // pin 是创建后动作（走 setChapterPin，组内同步重排）。
    setChapterPin(createdChapter.id, chapter.pin)
  }
}

/**
 * 大纲教学数据构建：分组 = `createOutlineGroup`（`volumes.kind='group'`），
 * 条目 = `createOutlineItem(bookId, 分组 id, title)`，正文经 `saveOutlineContent` 内联。
 */
function seedGuideOutline(bookId: string): void {
  for (const group of GUIDE_OUTLINE) {
    const createdGroup = createOutlineGroup(bookId, group.group)
    for (const entry of group.entries) {
      const createdEntry = createOutlineItem(bookId, createdGroup.id, entry.title)
      writeOutlineDoc(createdEntry.id, entry.doc)
    }
  }
  // 置顶独立条目（volumeId = null，不挂任何卷 / 分组）。
  const standalone = createOutlineItem(bookId, null, GUIDE_OUTLINE_STANDALONE.title)
  writeOutlineDoc(standalone.id, GUIDE_OUTLINE_STANDALONE.doc)
}

/** 大纲正文写入（整条内联：`content_json` + `text`，对齐 `saveOutlineContent` 口径）。 */
function writeOutlineDoc(itemId: number, doc: SeedOutlineDoc): void {
  saveOutlineContent(itemId, doc.contentJson, doc.text)
}

/**
 * 剧情教学数据构建：2 线 × 各 3 场景（`GUIDE_PLOT_LINES`），经
 * `createPlotLine` / `createPlotScene` 正式写入（同书 `line_id` 约束由
 * `createPlotScene` 校验；出场实体不落库，由正文自动匹配）。
 */
function seedGuidePlot(bookId: string): void {
  for (const line of GUIDE_PLOT_LINES) {
    const createdLine = createPlotLine(bookId, line.name, {
      lineType: line.lineType,
      lineColor: line.lineColor,
      timelineId: line.timelineId ?? 'default',
      defaultOrigin: line.defaultOrigin ?? ''
    })
    for (const scene of line.scenes) {
      createPlotScene(bookId, createdLine.id, {
        timeText: scene.timeText,
        timeEra: scene.timeEra,
        timeYear: scene.timeYear,
        timeDesc: scene.timeDesc,
        title: scene.title,
        description: scene.description
      })
    }
  }
}

/**
 * 清空**教学书**的章节域 + 大纲域 + 示范剧情线（教学书重灌前的擦除步骤）。
 *
 * 范围（按 `bookId` 隔离，只动教学书）：
 * - 章节域：`paragraphs` / `chapters`；
 * - 大纲域：`outline_items` / `volumes`（章节与大纲共用卷池）；
 * - 剧情域：`plot_lines`（其下 `plot_scenes` 与场景关联随外键级联物理删除）。
 *
 * 顺序**自底向上**（先子后父，不依赖外键级联）：
 * `paragraphs → chapters → outline_items → volumes`，最后清剧情线。
 * 用户自建书籍的正文 / 卷章 / 大纲 / 剧情**不受影响**。
 * 设定数据（统一设定库）不在此函数内清理：演示实体随教学书重灌由
 * `resetChapterDataOnce` 在清完本章节域后清标记并重播（见该函数）。
 */
function clearChapterDomain(db: ReturnType<typeof getDb>, bookId: string): void {
  db.prepare(
    `DELETE FROM paragraphs
     WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)`
  ).run(bookId)
  db.prepare('DELETE FROM chapters WHERE book_id = ?').run(bookId)
  db.prepare('DELETE FROM outline_items WHERE book_id = ?').run(bookId)
  db.prepare('DELETE FROM volumes WHERE book_id = ?').run(bookId)
  // 示范剧情线一并清空：重灌时若不删会追加出重复的剧情线与场景。
  db.prepare('DELETE FROM plot_lines WHERE book_id = ?').run(bookId)
}

/** 灌入教学书：书籍行（幂等：按 id 存在即跳过）+ 卷章 + 大纲 + 剧情。 */
function seedGuideBook(): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO books (id, title, intro, categories, status, coverColor)
     VALUES (@id, @title, @intro, @categories, @status, @coverColor)
     ON CONFLICT(id) DO NOTHING`
  ).run({
    id: GUIDE_BOOK.id,
    title: GUIDE_BOOK.title,
    intro: GUIDE_BOOK.intro,
    categories: JSON.stringify(GUIDE_BOOK.categories),
    status: GUIDE_BOOK.status,
    coverColor: GUIDE_BOOK.coverColor
  })

  seedGuideChapters(GUIDE_BOOK.id)
  seedGuideOutline(GUIDE_BOOK.id)
  seedGuidePlot(GUIDE_BOOK.id)
  // 场景关联不在此处回填：演示实体在 `resetChapterDataOnce` 中随后被清空重建，
  // 实体 id 会变化，故关联由 `seedDemoWorldEntities`（按 key）与
  // `relinkGuidePlotSceneEntities`（按名称）在实体就绪后统一回填。
  // 设定 demo 数据（统一设定库，唯一来源）由 `seedDemoWorldEntities` 在书行灌入后播种。
  // 教学书首启即有默认时间线：列表 + 选中 id（settings JSON）；名称 / 起点落空串，
  // 中文默认名与默认起点由展示层 i18n 兜底（`timeline.defaultName` / `timeline.originDefault`）。
  // **仅在键不存在时初始化**（对齐 `ensureTimelineList` 语义）：已存在的列表可能带用户填写的
  // 起点描述，重灌教学书不得覆盖（否则每次 `CHAPTER_SEED_VERSION` 提升都会抹掉用户描述）。
  if (getSetting(`timeline:list:${GUIDE_BOOK.id}`) === null) {
    setSetting(
      `timeline:list:${GUIDE_BOOK.id}`,
      JSON.stringify([{ id: 'default', name: '', origin: '' }])
    )
    setSetting(`timeline:active:${GUIDE_BOOK.id}`, 'default')
  }
}

/**
 * 一次性重建章节数据（幂等，见文件头注释）。
 * 调用点：`database/index.ts` 的 `getDb()`，在建表与 `seedBooksIfEmpty` 之后。
 *
 * 时序（同一事务，任一步失败整体回滚、守卫键不置位 → 下次启动自动重试）：
 * 1. `clearChapterDomain`：清教学书章节域 / 大纲域 / 剧情线；
 * 2. `clearWorldEntitySeedMarker`：删 `worldEntities:seeded:guide`，让演示实体允许重播；
 * 3. `seedGuideBook`：书行（幂等）+ 卷章 + 大纲 + 剧情线；
 * 4. `seedDemoWorldEntities`：物理清空教学书统一设定库实体（子表 / 别名 / 标签 /
 *    自定义键值 / 关系随外键级联）后按新文案重播；
 * 5. `relinkGuidePlotSceneEntities`：实体 id 已变，按名称兜底回填剧情场景关联。
 *
 * 第 4、5 步只作用于 `GUIDE_BOOK.id`，用户自建书籍的设定数据不受影响。
 */
export function resetChapterDataOnce(): void {
  if (getSetting(MIGRATION_KEY) === '1') return

  const db = getDb()

  try {
    db.transaction(() => {
      // 擦除教学书的章节域 / 大纲域 / 示范剧情线（教学书为唯一内容真源，清后重灌）。
      clearChapterDomain(db, GUIDE_BOOK.id)
      // 演示实体随教学书一并重灌：删按书播种标记，使 `seedDemoWorldEntities` 不再跳过。
      clearWorldEntitySeedMarker(GUIDE_BOOK.id)
      // 旧 demo 书籍行清理由 seedBooksIfEmpty（books.ts）负责；此处仅灌教学书。
      seedGuideBook()
      // 实体必须在剧情线之后重播：场景已就绪，`seedGuidePlotSceneEntities` 才能按标题回填。
      seedDemoWorldEntities(GUIDE_BOOK.id)
      // 实体 id 已随重建变化：按名称兜底回填一次（`setPlotSceneEntities` 先删后插，幂等）。
      relinkGuidePlotSceneEntities(GUIDE_BOOK.id)
      setSetting(MIGRATION_KEY, '1')
    })()
  } catch (error) {
    log.error('教学书种子重建失败（事务已回滚）', error)
    throw error
  }

  const books = listBooks()
  log.info('教学书种子重建完成', { books: books.length })
}

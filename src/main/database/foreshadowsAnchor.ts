import type Database from 'better-sqlite3'
import type { ForeshadowAnchor, ForeshadowAnchorKind } from './foreshadows'

/**
 * 伏笔锚点的**落库归一化 + 列名映射**（写路径专用）。
 *
 * 拆出原因：锚点书域校验与三套列集合（正文埋点 / 大纲埋点 / 回收点）占篇幅大，
 * `foreshadows.ts` 已达 §3 的 500 行上限；本模块只做「入参归一化 → SET 列片段」，
 * 不持有数据库连接（`db` 由调用方传入）。
 *
 * 依赖方向：本模块仅 `import type` 引用 `foreshadows.ts` 的公开锚点类型
 * （类型导入在运行期被擦除，不构成循环依赖）。
 */

/** 归一化后的锚点落库形状（三个槽位共用，具体列名由 {@link AnchorColumnSet} 给出）。 */
export interface NormalizedAnchor {
  kind: ForeshadowAnchorKind
  chapterId: number | null
  outlineItemId: number | null
  paragraphIdx: number | null
  quote: string
  charStart: number | null
  charEnd: number | null
}

/** 正整数 id：非法回 null。 */
function toPositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** 可选非负整数（段落序号 / 字符偏移）：非法 / 负数回 null。 */
function toOptionalIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * 归一化并校验锚点：目标章 / 大纲条目须存在且属于同一本书（外键之外的书域约束）。
 * 非法锚点抛错，由 IPC `runWrite` 记录并原样上抛。`label` 仅用于错误文案区分
 * 正文埋点 / 大纲埋点 / 回收点（校验逻辑完全一致）。
 */
export function normalizeAnchor(
  db: Database.Database,
  bookId: string,
  anchor: ForeshadowAnchor | null | undefined,
  label = '埋设'
): NormalizedAnchor {
  if (anchor?.kind === 'chapter') {
    const chapterId = toPositiveInt(anchor.chapterId)
    if (chapterId === null) {
      throw new Error(`foreshadow: ${label}章节锚点缺少合法 chapterId`)
    }
    const chapter = db
      .prepare('SELECT book_id AS bookId FROM chapters WHERE id = ?')
      .get(chapterId) as { bookId: string } | undefined
    if (!chapter || chapter.bookId !== bookId) {
      throw new Error(`foreshadow: ${label}章节不属于该书（chapterId=${chapterId}）`)
    }
    return {
      kind: 'chapter',
      chapterId,
      outlineItemId: null,
      paragraphIdx: toOptionalIndex(anchor.paragraphIdx),
      quote: typeof anchor.quote === 'string' ? anchor.quote : '',
      charStart: toOptionalIndex(anchor.charStart),
      charEnd: toOptionalIndex(anchor.charEnd)
    }
  }
  if (anchor?.kind === 'outline') {
    const outlineItemId = toPositiveInt(anchor.outlineItemId)
    if (outlineItemId === null) {
      throw new Error(`foreshadow: ${label}大纲锚点缺少合法 outlineItemId`)
    }
    const item = db
      .prepare('SELECT book_id AS bookId FROM outline_items WHERE id = ?')
      .get(outlineItemId) as { bookId: string } | undefined
    if (!item || item.bookId !== bookId) {
      throw new Error(`foreshadow: ${label}大纲条目不属于该书（outlineItemId=${outlineItemId}）`)
    }
    return {
      kind: 'outline',
      chapterId: null,
      outlineItemId,
      // 大纲正文是富文本：`paragraphIdx` 记顶层块序号（heading / list / paragraph 同口径），
      // 正文标记靠它定位；旧数据可能为 null（此时标记层按失效跳过，不影响数据读取）。
      paragraphIdx: toOptionalIndex(anchor.paragraphIdx),
      quote: typeof anchor.quote === 'string' ? anchor.quote : '',
      charStart: toOptionalIndex(anchor.charStart),
      charEnd: toOptionalIndex(anchor.charEnd)
    }
  }
  return {
    kind: 'none',
    chapterId: null,
    outlineItemId: null,
    paragraphIdx: null,
    quote: '',
    charStart: null,
    charEnd: null
  }
}

/**
 * 锚点列集合。两组埋点列名**不对称**（`body_*` 无 `outline_item_id`、
 * `outline_*` 无 `chapter_id`），故不再由前缀拼列名，而是逐列显式声明；
 * 槽位不存的 id 列用 `null` 标注，写入时整列跳过（两槽位互不影响）。
 */
export interface AnchorColumnSet {
  kindColumn: string
  /** 章节目标列；`null` = 该槽位不存章节 id（大纲埋点）。 */
  chapterIdColumn: string | null
  /** 大纲条目目标列；`null` = 该槽位不存大纲条目 id（正文埋点）。 */
  outlineItemIdColumn: string | null
  paragraphIdxColumn: string
  quoteColumn: string
  charStartColumn: string
  charEndColumn: string
}

/** 正文埋点（`body_*`）：只存章节锚点。 */
export const BODY_COLUMNS: AnchorColumnSet = {
  kindColumn: 'body_kind',
  chapterIdColumn: 'body_chapter_id',
  outlineItemIdColumn: null,
  paragraphIdxColumn: 'body_paragraph_idx',
  quoteColumn: 'body_quote',
  charStartColumn: 'body_char_start',
  charEndColumn: 'body_char_end'
}

/** 大纲埋点（`outline_*`）：只存大纲条目锚点。 */
export const OUTLINE_COLUMNS: AnchorColumnSet = {
  kindColumn: 'outline_kind',
  chapterIdColumn: null,
  outlineItemIdColumn: 'outline_item_id',
  paragraphIdxColumn: 'outline_paragraph_idx',
  quoteColumn: 'outline_quote',
  charStartColumn: 'outline_char_start',
  charEndColumn: 'outline_char_end'
}

/** 回收点（`recover_*`）：仍为章节 / 大纲条目 / 未记录三态，两类 id 列都在。 */
export const RECOVER_COLUMNS: AnchorColumnSet = {
  kindColumn: 'recover_anchor_kind',
  chapterIdColumn: 'recover_chapter_id',
  outlineItemIdColumn: 'recover_outline_item_id',
  paragraphIdxColumn: 'recover_paragraph_idx',
  quoteColumn: 'recover_quote',
  charStartColumn: 'recover_char_start',
  charEndColumn: 'recover_char_end'
}

/**
 * 生成锚点列的 SET 片段并压入参数。三套列集合共用同一份归一化结果，
 * 避免复制校验逻辑（含书域校验）；列名差异由 {@link AnchorColumnSet} 显式表达。
 */
export function pushAnchorSets(
  sets: string[],
  values: unknown[],
  columns: AnchorColumnSet,
  anchor: NormalizedAnchor
): void {
  sets.push(`${columns.kindColumn} = ?`)
  values.push(anchor.kind)
  if (columns.chapterIdColumn !== null) {
    sets.push(`${columns.chapterIdColumn} = ?`)
    values.push(anchor.chapterId)
  }
  if (columns.outlineItemIdColumn !== null) {
    sets.push(`${columns.outlineItemIdColumn} = ?`)
    values.push(anchor.outlineItemId)
  }
  sets.push(`${columns.paragraphIdxColumn} = ?`)
  values.push(anchor.paragraphIdx)
  sets.push(`${columns.quoteColumn} = ?`)
  values.push(anchor.quote)
  sets.push(`${columns.charStartColumn} = ?`)
  values.push(anchor.charStart)
  sets.push(`${columns.charEndColumn} = ?`)
  values.push(anchor.charEnd)
}

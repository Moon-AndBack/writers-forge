/**
 * 写作页章节树：展示口径纯函数（v3）。
 *
 * 数据真源为主进程 `chapters` 域。**类型不再本地镜像**：直接 `import type` 复用主进程
 * `database/chapters` 的导出（`import type` 编译期擦除，不产生 `require`、不污染 renderer
 * bundle；与 preload `types/database.d.ts` 同口径，理由见其文件头——§9 单一真源，
 * 消除「双份维护」漂移面）。
 *
 * 本模块不发起 IPC，只做：
 * - **分组**：按 `listVolumes` 展示顺序归拢各卷章节（`volumeId` 必填，无「未分卷」）；
 * - **动态编号展示**：卷「卷X」仅 `kind='normal'` 且 `numberIndex>0` 拼前缀；章「第X章」
 *   仅 `kind='normal'` 拼；特殊章显示 `specialPrefix + title`（编号由主进程算好，渲染层只消费）；
 * - **编辑头 N/M**：仅统计「普通卷的普通章」的全局序号 / 总数。
 *
 * 编号数字词（中 / 英）与落库卷名反解在 `./numberWords`（纯函数）；本文件的格式化函数
 * （`chapterPrefixLabel` 等）经 `ChapterNumberFormat` 参数化注入数字词，默认 `zhNumberFormat`
 * 与历史中文行为逐字一致；绑定界面语言的 hook 见 `./useChapterLabels`。
 */

import type { Locale } from '../../../i18n/config'
import type {
  ChapterPin,
  ChapterRow,
  ChapterStatus,
  CreateVolumeInput,
  RenameChapterPatch,
  VolumeKind,
  VolumeRow
} from '../../../../../main/database/chapters'

export type {
  ChapterPin,
  ChapterRow,
  ChapterStatus,
  CreateVolumeInput,
  RenameChapterPatch,
  VolumeKind,
  VolumeRow
}

/** 章节树分组：卷 + 其下章（保持后端顺序：组内 pin 段 top → 普通 → 无 pin → bottom）。 */
export interface VolumeGroup {
  /** 分组唯一 key（`v{id}`）。 */
  key: string
  /** 所属卷。 */
  volume: VolumeRow
  /** 该分组下章（后端顺序）。 */
  chapters: ChapterRow[]
}

/* ---------- 编号数字词与格式化注入 ---------- */

/**
 * 编号数字词（`numberWords.ts`）：本文件保留 re-export，现有消费方导入路径零破坏；
 * 新代码建议直接从 `./numberWords` 取用。
 */
export { toChineseNumber } from './numberWords'

import { numberWord, toChineseNumber } from './numberWords'

/**
 * 卷 / 章编号格式化口径（参数化注入，支撑多语言编号渲染）：
 * `chapterPrefix` = 章前缀（zh「第X章」/ en `Chapter X`）；
 * `volumePrefix` = 卷前缀（zh「卷X」/ en `Volume X`）。
 */
export interface ChapterNumberFormat {
  chapterPrefix: (n: number) => string
  volumePrefix: (n: number) => string
}

/** 中文格式（默认，与历史行为逐字一致）：编号取中文数字。 */
export const zhNumberFormat: ChapterNumberFormat = {
  chapterPrefix: (n) => `第${toChineseNumber(n)}章`,
  volumePrefix: (n) => `卷${toChineseNumber(n)}`
}

/** 按界面语言构造格式化口径：编号经 `numberWord` 取对应语言数字词，模板取中文形态（本地化由消费方 hook 完成）。 */
export function numberFormatFor(locale: Locale): ChapterNumberFormat {
  return {
    chapterPrefix: (n) => `第${numberWord(n, locale)}章`,
    volumePrefix: (n) => `卷${numberWord(n, locale)}`
  }
}

/**
 * 卷内普通章上限（镜像主进程 `chapterStatus.ts` 的 `MAX_CHAPTERS_PER_VOLUME`，
 * ⚠️ 两处须同步）：达上限后「新建章」按钮禁用（tooltip「已达卷内最大容量」）。
 */
export const MAX_CHAPTERS_PER_VOLUME = 99999

/**
 * 段判别（对齐后端 `chapterReorder.ts` 的 `segmentOf`）：pin 段决定拖拽重排的作用域，
 * 跨段不允许（改段用「置顶 / 置底」按钮）。渲染层唯一实现（§9，原 `useChapterDrag` /
 * `ChapterList` 各有一份，已上提）。
 */
export function segmentOf(chapter: ChapterRow): 'top' | 'normal' | 'unpinned' | 'bottom' {
  if (chapter.kind !== 'special') return 'normal'
  if (chapter.pin === 'top') return 'top'
  if (chapter.pin === 'bottom') return 'bottom'
  return 'unpinned'
}

/**
 * 普通章编号前缀：「第X章」（数字词按 `format` 取语言，按 `numberIndex` 动态生成）。
 * 显示口径：前缀**恒显**（名段不取代编号，与卷行「卷X · 名」同构）；
 * 特殊章不带编号；编号非法（≤0，如回收站章）返回空串。
 */
export function chapterPrefixLabel(
  chapter: Pick<ChapterRow, 'kind' | 'numberIndex' | 'title'>,
  format: ChapterNumberFormat = zhNumberFormat
): string {
  if (chapter.kind === 'special' || chapter.numberIndex <= 0) return ''
  return format.chapterPrefix(chapter.numberIndex)
}

/** 章行**名段**：字段直读（特殊章 / 普通章统一 = `title`）。 */
export function chapterNameLabel(chapter: Pick<ChapterRow, 'title'>): string {
  return chapter.title
}

/** 章行前段：特殊章 = `specialPrefix`（如「序章」）；普通章 = 「第X章」（前缀恒显，与卷行同构）。 */
export function chapterRowPrefixLabel(
  chapter: ChapterRow,
  format: ChapterNumberFormat = zhNumberFormat
): string {
  if (chapter.kind !== 'special') return chapterPrefixLabel(chapter, format)
  return chapter.specialPrefix ?? ''
}

/**
 * 章**整串显示名**（单串场景：确认弹窗 / 搜索 / 回收站）：
 * - 特殊章 =「前段 名」（空格分隔，缺段省略）；
 * - 普通章 =「第X章 · 名」（前缀恒显；名空 → 纯前缀；前缀空（编号非法，如回收站）
 *   → 纯名 / 空串。拼接口径对齐 `volumeLabel`）。
 */
export function chapterLabel(
  chapter: ChapterRow,
  format: ChapterNumberFormat = zhNumberFormat
): string {
  if (chapter.kind === 'special') {
    const parts: string[] = []
    if (chapter.specialPrefix !== null) parts.push(chapter.specialPrefix)
    if (chapter.title !== '') parts.push(chapter.title)
    return parts.join(' ')
  }
  const prefix = chapterPrefixLabel(chapter, format)
  if (prefix === '') return chapter.title
  return chapter.title !== '' ? `${prefix} · ${chapter.title}` : prefix
}

/**
 * 卷行前缀段「卷X」（数字词按 `format` 取语言）：仅 `kind='normal'` 按 `numberIndex`
 * 动态生成；`custom`（自定义卷）/ `group`（分组容器）无编号 → 空串。
 */
export function volumePrefixLabel(
  volume: Pick<VolumeRow, 'kind' | 'numberIndex'>,
  format: ChapterNumberFormat = zhNumberFormat
): string {
  if (volume.kind !== 'normal' || volume.numberIndex <= 0) return ''
  return format.volumePrefix(volume.numberIndex)
}

/**
 * 卷行**名段**：库内只存名段（`normal` 为可选自定义名、`custom` 为完整整名、
 * `group` 为分组名），故一律直读 `title`。
 */
export function volumeNameLabel(volume: Pick<VolumeRow, 'title'>): string {
  return volume.title
}

/**
 * 卷**整串显示名**（单串场景：确认弹窗 / 回收站）：
 * `kind='normal'` =「卷X[ · 名]」；`custom` / `group` = 名段整名（无编号前缀）。
 * 回收站卷 `numberIndex` 恒为 0 → 退化为纯名段（编号不落库，不可反解）。
 */
export function volumeLabel(
  volume: Pick<VolumeRow, 'kind' | 'numberIndex' | 'title'>,
  format: ChapterNumberFormat = zhNumberFormat
): string {
  const prefix = volumePrefixLabel(volume, format)
  const title = volume.title
  return title !== '' && prefix !== '' ? `${prefix} · ${title}` : prefix !== '' ? prefix : title
}

/** 状态标签 key（两态）→ `chapters.status.*`，取值由各消费者经 `t()` 渲染（i18n）。 */
export const STATUS_LABELS: Record<ChapterStatus, 'status.draft' | 'status.done'> = {
  draft: 'status.draft',
  done: 'status.done'
}

/** 卷类型标签 key（三态）→ `chapters.trash.detail.volumeKind*`（回收站详情共用）。 */
export const VOLUME_KIND_LABELS: Record<
  VolumeKind,
  'trash.detail.volumeKindNormal' | 'trash.detail.volumeKindCustom' | 'trash.detail.volumeKindGroup'
> = {
  normal: 'trash.detail.volumeKindNormal',
  custom: 'trash.detail.volumeKindCustom',
  group: 'trash.detail.volumeKindGroup'
}

/**
 * 章节树分组：按 `listVolumes` 展示顺序归拢章节（保持 `listChapters` 相对顺序）。
 * `volumeId` 必填（未分卷语义已移除），无「未分卷」分组。
 */
export function groupChapters(volumes: VolumeRow[], chapters: ChapterRow[]): VolumeGroup[] {
  const byVolume = new Map<number, ChapterRow[]>()
  for (const chapter of chapters) {
    const list = byVolume.get(chapter.volumeId)
    if (list) list.push(chapter)
    else byVolume.set(chapter.volumeId, [chapter])
  }
  return volumes.map((volume) => ({
    key: `v${volume.id}`,
    volume,
    chapters: byVolume.get(volume.id) ?? []
  }))
}

/** 编辑头位置口径：仅统计「普通卷的普通章」的全局序号 / 总数。 */
export interface ChapterPosition {
  /** 当前章在普通章序列中的序号（1 起）；当前章不计入（特殊章 / 非正文卷）时为 null。 */
  index: number | null
  /** 全书普通章总数 M。 */
  total: number
}

/**
 * 计算编辑头 N/M（口径：遍历所有**正文卷（`kind='normal'`）**的普通章，按全局顺序累加；
 * 排除 `custom` / `group` 卷与特殊章）。当前章若为特殊章或非正文卷 → `index` 为 null。
 */
export function computeChapterPosition(
  volumes: VolumeRow[],
  chapters: ChapterRow[],
  chapterId: number | null
): ChapterPosition {
  const normalVolumeIds = new Set(
    volumes.filter((volume) => volume.kind === 'normal').map((volume) => volume.id)
  )

  let total = 0
  let index: number | null = null
  for (const chapter of chapters) {
    if (chapter.kind === 'special') continue
    if (!normalVolumeIds.has(chapter.volumeId)) continue
    total += 1
    if (chapter.id === chapterId) index = total
  }

  return { index, total }
}

/**
 * 相对时间展示：实现已上提至 `@renderer/lib/relativeTime`（章节 / 大纲共用，领域无关，§9）。
 * 此处保留同名 re-export，既有导入路径（`./chapterTree`）零破坏。
 */
export { formatRelativeTime } from '@renderer/lib/relativeTime'

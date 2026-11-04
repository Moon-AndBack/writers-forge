/**
 * 伏笔域展示口径：类型别名 + 锚点解析 + 右栏草稿补丁（纯函数，不发起 IPC）。
 *
 * 锚点失效判定（本批口径）：
 * - `anchorKind === 'none'` → 未锚定；
 * - 章节锚点：目标章仍在当前未删除章列表、`paragraphIdx` / 字符区间完整、`quote` 非空 → 已锚定；
 * - 大纲锚点：目标条目仍在未删除列表、`quote` 非空 → 已锚定；
 * - 其余 → 锚点失效（目标已删 / 快照不完整）。
 *
 * **不做正文逐字比对**：列表页逐条读取章节全文 / 大纲 JSON 成本高，且正文标记
 * （`components/editor/foreshadowMarks.ts`）在每次渲染时已按 `quote` 与段落文本逐字校验；
 * 列表页只做「目标是否存在 + 快照是否可用」的轻量判定，避免两套口径漂移。
 */
import type { RefObject } from 'react'
import type { TagTone } from '../../../components/ui'
import type {
  ForeshadowRow,
  ForeshadowStatus,
  ForeshadowUpdatePatch
} from '../../../../../main/database/foreshadows'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import { outlineItemLabel, type OutlineItemRow } from '../outline/outlineTree'

export type { ForeshadowRow, ForeshadowStatus, ForeshadowUpdatePatch }

/** 状态枚举展示顺序（与数据层白名单一致）。 */
export const FORESHADOW_STATUSES: readonly ForeshadowStatus[] = [
  'planted',
  'recovered',
  'abandoned'
]

/** 状态 → i18n key（显式映射，避免动态模板键绕过类型校验）。 */
export const FORESHADOW_STATUS_LABEL_KEYS = {
  planted: 'status.planted',
  recovered: 'status.recovered',
  abandoned: 'status.abandoned'
} as const

/** 锚点展示态：已锚定 / 未锚定 / 锚点失效。 */
export type ForeshadowAnchorState = 'anchored' | 'unanchored' | 'invalid'

/** 锚点态 → i18n key。 */
export const FORESHADOW_ANCHOR_LABEL_KEYS = {
  anchored: 'listItem.anchored',
  unanchored: 'listItem.unanchored',
  invalid: 'listItem.anchorInvalid'
} as const

/**
 * 状态 → 胶囊色调（埋设中品牌色 / 已回收成功色 / 已废弃中性）。
 * 列表卡与右栏共用同一份映射（AGENTS §9：不得在各处复制平行实现）。
 */
export const FORESHADOW_STATUS_TONES: Record<ForeshadowStatus, TagTone> = {
  planted: 'brand',
  recovered: 'ok',
  abandoned: 'neutral'
}

/** 锚点态 → 胶囊色调（失效用危险色提示；其余中性，不与状态争夺视觉焦点）。 */
export const FORESHADOW_ANCHOR_TONES: Record<ForeshadowAnchorState, TagTone> = {
  anchored: 'neutral',
  unanchored: 'neutral',
  invalid: 'danger'
}

/** 锚点解析结果；`target` 仅在已锚定时非空。 */
export type ForeshadowAnchorResolution =
  | { state: 'unanchored'; target: null; missing: null }
  | {
      state: 'anchored'
      target:
        | { kind: 'chapter'; chapter: ChapterRow; volume: VolumeRow | null }
        | { kind: 'outline'; item: OutlineItemRow }
      missing: null
    }
  | { state: 'invalid'; target: null; missing: 'chapter' | 'outline' | null }

/**
 * 解析一条伏笔的锚点状态（目标存在性 + 快照完整性；见文件头）。
 *
 * `volumes` 只用于补全章节锚点的所属卷（展示层据此拼「卷 · 章」位置串）；
 * 卷缺失不算失效——章仍在即已锚定，位置退化为「第X章 章名」。
 */
export function resolveForeshadowAnchor(
  row: ForeshadowRow,
  chapters: readonly ChapterRow[],
  volumes: readonly VolumeRow[],
  outlineItems: readonly OutlineItemRow[]
): ForeshadowAnchorResolution {
  if (row.anchorKind === 'none') {
    return { state: 'unanchored', target: null, missing: null }
  }

  if (row.anchorKind === 'chapter') {
    const chapter =
      row.chapterId === null ? null : (chapters.find((item) => item.id === row.chapterId) ?? null)
    const snapshotOk =
      row.quote.trim() !== '' &&
      row.paragraphIdx !== null &&
      row.charStart !== null &&
      row.charEnd !== null
    if (!chapter || !snapshotOk) {
      return { state: 'invalid', target: null, missing: chapter ? null : 'chapter' }
    }
    const volume = volumes.find((entry) => entry.id === chapter.volumeId) ?? null
    return { state: 'anchored', target: { kind: 'chapter', chapter, volume }, missing: null }
  }

  const item =
    row.outlineItemId === null
      ? null
      : (outlineItems.find((entry) => entry.id === row.outlineItemId) ?? null)
  if (!item || row.quote.trim() === '') {
    return { state: 'invalid', target: null, missing: item ? null : 'outline' }
  }
  return { state: 'anchored', target: { kind: 'outline', item }, missing: null }
}

/**
 * 解析一条伏笔的**回收点**锚点状态：判定口径与埋设锚点完全一致（目标存在性 + 快照完整性），
 * 只是读取 `recover*` 列（`recoverAnchorKind` / `recoverChapterId` / `recoverOutlineItemId` /
 * `recoverQuote` / `recoverParagraphIdx` / `recoverCharStart` / `recoverCharEnd`）。
 *
 * `recoverAnchorKind === 'none'`（尚未记录回收点）→ `unanchored`，由调用方显示「未回收」占位。
 */
export function resolveForeshadowRecoverAnchor(
  row: ForeshadowRow,
  chapters: readonly ChapterRow[],
  volumes: readonly VolumeRow[],
  outlineItems: readonly OutlineItemRow[]
): ForeshadowAnchorResolution {
  if (row.recoverAnchorKind === 'none') {
    return { state: 'unanchored', target: null, missing: null }
  }

  if (row.recoverAnchorKind === 'chapter') {
    const chapter =
      row.recoverChapterId === null
        ? null
        : (chapters.find((item) => item.id === row.recoverChapterId) ?? null)
    const snapshotOk =
      row.recoverQuote.trim() !== '' &&
      row.recoverParagraphIdx !== null &&
      row.recoverCharStart !== null &&
      row.recoverCharEnd !== null
    if (!chapter || !snapshotOk) {
      return { state: 'invalid', target: null, missing: chapter ? null : 'chapter' }
    }
    const volume = volumes.find((entry) => entry.id === chapter.volumeId) ?? null
    return { state: 'anchored', target: { kind: 'chapter', chapter, volume }, missing: null }
  }

  const item =
    row.recoverOutlineItemId === null
      ? null
      : (outlineItems.find((entry) => entry.id === row.recoverOutlineItemId) ?? null)
  if (!item || row.recoverQuote.trim() === '') {
    return { state: 'invalid', target: null, missing: item ? null : 'outline' }
  }
  return { state: 'anchored', target: { kind: 'outline', item }, missing: null }
}

/**
 * 位置串格式化所需的最小标签函数集合（由 `useChapterLabels` 提供；纯函数侧不依赖 hook）。
 *
 * 只取「编号前缀段」而非整串：位置串要求「卷X 卷名 · 第X章 章名」——号与名之间用空格、
 * 卷与章之间用「 · 」；而整串 `volumeLabel` / `chapterLabel` 内部已用「 · 」连接号与名，
 * 直接拼接会得到四段式。故此处改用前缀 + 名段自行拼串；全局共用的整串口径保持不动。
 */
export interface ForeshadowPlaceLabels {
  /** 卷编号前缀段（「卷X」；自定义卷 / 分组 / 编号非法时为空串）。 */
  volumePrefixLabel: (volume: Pick<VolumeRow, 'kind' | 'numberIndex'>) => string
  /** 章前段（普通章「第X章」；特殊章为 `specialPrefix`，如「序章」）。 */
  chapterRowPrefixLabel: (chapter: ChapterRow) => string
}

/** 前缀段 + 名段拼接：空格分隔，任一段为空则省略（两段皆空 → 空串）。 */
function joinPlaceParts(prefix: string, name: string): string {
  if (prefix === '') return name
  return name === '' ? prefix : `${prefix} ${name}`
}

/**
 * 章节位置串（伏笔列表卡 / 右栏只读块 / 正文标记悬停共用，AGENTS §9）：
 * 「卷X 卷名 · 第X章 章名」——号与名之间空格、卷与章之间「 · 」；
 * 所属卷缺失 / 卷无编号（自定义卷、分组）时退化为「第X章 章名」。
 */
export function formatForeshadowPlace(
  volume: Pick<VolumeRow, 'kind' | 'numberIndex' | 'title'> | null,
  chapter: ChapterRow,
  labels: ForeshadowPlaceLabels
): string {
  const chapterPart = joinPlaceParts(labels.chapterRowPrefixLabel(chapter), chapter.title)
  const volumePart =
    volume === null ? '' : joinPlaceParts(labels.volumePrefixLabel(volume), volume.title)
  // 任一段为空则省掉分隔符，避免出现「 · 第X章 章名」这类残串。
  return [volumePart, chapterPart].filter((part) => part !== '').join(' · ')
}

/**
 * 锚点位置串（中栏卡第二 / 三行与右栏只读块共用，AGENTS §9）：
 * - 章节 → {@link formatForeshadowPlace}（「卷X 卷名 · 第X章 章名」）；
 * - 大纲 → 条目名本身（外层已有「埋点位置 / 回收位置」标签，不重复「大纲 ·」前缀）；
 * - 未锚定 / 失效（`target` 为空）→ null，由调用方显示各自占位文案。
 */
export function foreshadowPlaceLabel(
  resolution: ForeshadowAnchorResolution,
  labels: ForeshadowPlaceLabels,
  unnamedTarget: string
): string | null {
  const target = resolution.target
  if (target === null) return null
  if (target.kind === 'outline') return outlineItemLabel(target.item, unnamedTarget)
  return formatForeshadowPlace(target.volume, target.chapter, labels)
}

/** 右栏表单草稿（与行值比对后仅提交变更字段）。 */
export interface ForeshadowDraft {
  title: string
  description: string
  status: ForeshadowStatus
}

/** 按行值创建草稿。 */
export function createForeshadowDraft(row: ForeshadowRow): ForeshadowDraft {
  return { title: row.title, description: row.description, status: row.status }
}

/** 草稿 → 「仅变更字段」补丁（空对象 = 无改动）。 */
export function buildForeshadowPatch(
  row: ForeshadowRow,
  draft: ForeshadowDraft
): ForeshadowUpdatePatch {
  const patch: ForeshadowUpdatePatch = {}
  const title = draft.title.trim()
  if (title !== row.title) patch.title = title
  if (draft.description !== row.description) patch.description = draft.description
  if (draft.status !== row.status) patch.status = draft.status
  return patch
}

/**
 * 伏笔装配包：`Writer.tsx` 经 `useForeshadowBundle` 取用，按 props 透传中 / 右栏。
 * 仅活动模块为 `foreshadow` 时非空（其余模块为 null，视图不挂载）。
 */
export interface ForeshadowBundle {
  bookId: string
  /** 未删除伏笔（后端顺序：`updated_at DESC, id DESC`）。 */
  rows: ForeshadowRow[]
  /** 当前选中项 id（null = 列表为空）。 */
  activeId: number | null
  /** 当前选中行（null = 列表为空）。 */
  activeRow: ForeshadowRow | null
  /** 首次加载中（列表为空时渲染加载态，不闪空态）。 */
  loading: boolean
  /** 右栏是否有未保存改动。 */
  dirty: boolean
  /** 右栏表单上报脏态。 */
  onDirtyChange: (dirty: boolean) => void
  /** 保存入口：右栏表单挂载时写入 `saveNow`。 */
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
  /** 立即落库当前草稿（无脏视为成功）。 */
  saveDraft: () => Promise<boolean>
  /** 放弃当前草稿：清脏 + 递增重置键，右栏表单回退到行值。 */
  discardDraft: () => void
  /** 草稿重置键：传给右栏表单的 key，递增即重挂并回退草稿。 */
  draftResetKey: number
  /** 是否有挂起的域内切换（有脏时点选 / 新建暂缓，等两态确认）。 */
  switchPending: boolean
  /** 结算挂起的域内切换；返回是否已执行切换。 */
  onResolveSwitch: (save: boolean) => Promise<boolean>
  /** 切换守卫：无脏立即执行；有脏挂起该动作。 */
  guardSwitch: (proceed: () => void) => void
  /** 保存结算中（确认框禁用按钮）。 */
  confirming: boolean
  /** 选中一条伏笔（不自动展开右栏，展开由 bundle hook 包装）。 */
  onSelect: (id: number) => void
  /** 更新补丁；返回是否落库成功。 */
  onUpdate: (id: number, patch: ForeshadowUpdatePatch) => Promise<boolean>
  /** 软删除；返回是否落库成功。 */
  onDelete: (id: number) => Promise<boolean>
  /** 重新拉取列表（新建成功后 `selectFirst` = 选中刷新后首条）。 */
  reload: (selectFirst?: boolean) => Promise<void>
}

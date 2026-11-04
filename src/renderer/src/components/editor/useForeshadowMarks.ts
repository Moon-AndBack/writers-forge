import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import type { TFunction } from 'i18next'
import type { ForeshadowAnchorKind, ForeshadowRow } from '../../../../main/database/foreshadows'
import type { ForeshadowAnchorHit } from '../../../../main/database/foreshadowsQuery'
import {
  updateForeshadowMarks,
  type ForeshadowMarkEntry,
  type ForeshadowMarkVariant
} from './foreshadowMarks'

/**
 * 伏笔正文标记的数据加载与刷新（章节编辑器 / 大纲编辑器共用，§9 唯一实现）。
 *
 * 一次刷新拉**两路**锚点（`Promise.all`，各自失败按空处理）：
 * - `listByAnchorHit` → 埋点（正文 / 大纲槽位分别匹配，含已回收 / 已废弃的伏笔；
 *   `slot` 决定取 `body_*` 还是 `outline_*` 快照，两槽位各铺一处标记）；
 * - `listByRecoverAnchor` → 回收点（`recoverAnchorKind !== 'none'` 且快照可解析才有区间）。
 * 两路合并为一条标记条目列表，同一伏笔可在多处各留一个标记（互不替代）。
 *
 * 数据一律经 `updateForeshadowMarks` 写进插件 state（meta 事务），**不碰** `useEditor` 的
 * `extensions` / `content` / `editorProps` 闭包（W11 中文输入法焦点修复硬约束）。
 *
 * 位置名解析走调用方注入的 `resolveLabel`（见 {@link ForeshadowLabelResolver}）：标记层
 * 不依赖 chapters / volumes / outlineItems 任何具体数据源，悬停三行内容的措辞（`foreshadow` ns
 * `mark.*`）仍由本层经 `t()` 拼装。
 *
 * 刷新时机：
 * - `chapterId` / `outlineItemId` / 解析回调 / 界面语言变化 → `useForeshadowMarks` 重拉；
 *   目标为空时**同步清空**标记（不发 IPC）；
 * - 新建 / 回收伏笔成功后 → `SelectionContextMenu` 调用 `refreshForeshadowMarks`（同一实现）；
 * - 伏笔列表页删除 / 改名后 → `notifyForeshadowMarksRefresh` 广播，本 hook 监听重拉。
 *
 * 失败 / 空数据一律清空标记，不向 UI 抛错（标记属于增强提示，缺失不影响写作）。
 */

/** 位置目标引用：章节或大纲条目（仅 id + 种类，不含行数据）。 */
export interface ForeshadowTargetRef {
  kind: 'chapter' | 'outline'
  id: number
}

/**
 * 位置名解析回调：把锚点目标（章 / 大纲条目）解析为人类可读名（如「第三章 风起」
 * 「条目 · 首次登场」）；目标已不存在 → 空串（调用层按「未知位置」兜底）。
 */
export type ForeshadowLabelResolver = (target: ForeshadowTargetRef) => string

/** 拼装悬停文案 / 调用刷新所需的上下文（`t` 由调用方提供，避免本层自建 i18n 实例）。 */
export interface ForeshadowMarkContext {
  resolveLabel?: ForeshadowLabelResolver
  t: TFunction<'foreshadow'>
}

/** 两路锚点拉取结果（同一条伏笔可能同时出现在两侧）。 */
interface ForeshadowMarkData {
  /** 埋点命中（含槽位：`body` = `body_*`，`outline` = `outline_*`）。 */
  planted: ForeshadowAnchorHit[]
  recovered: ForeshadowRow[]
}

const EMPTY_DATA: ForeshadowMarkData = { planted: [], recovered: [] }

/** 单个请求失败按空数组处理（永不抛错）。 */
async function safeList<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn()
  } catch {
    return []
  }
}

/** 并发拉取埋设点 + 回收点；无锚点载体 → 双空（不发 IPC）。 */
async function fetchMarkData(
  chapterId: number | null,
  outlineItemId: number | null
): Promise<ForeshadowMarkData> {
  if (chapterId === null && outlineItemId === null) return EMPTY_DATA
  const [planted, recovered] = await Promise.all([
    safeList(() =>
      window.api.foreshadow.listByAnchorHit(chapterId ?? undefined, outlineItemId ?? undefined)
    ),
    safeList(() =>
      window.api.foreshadow.listByRecoverAnchor(chapterId ?? undefined, outlineItemId ?? undefined)
    )
  ])
  return { planted, recovered }
}

/** 锚点目标 → 位置名（`kind === 'none'` / 无解析回调 → 空串）。 */
function resolvePlace(
  targetKind: ForeshadowAnchorKind,
  targetId: number | null,
  resolveLabel: ForeshadowLabelResolver | undefined
): string {
  if (targetKind === 'none' || targetId === null || resolveLabel === undefined) return ''
  return resolveLabel({ kind: targetKind, id: targetId })
}

/**
 * 两路数据 → 标记条目（埋设点在前，回收点在后；同区间去重由装饰构建层负责）。
 *
 * 埋点按命中槽位取快照字段：`body` → `body_*`（`kind: 'plant'`），
 * `outline` → `outline_*`（`kind: 'plant2'`）；两者共用 `status` 判定的视觉变体。
 *
 * 变体判定与悬停三行：
 * - 第 1 行恒为 `伏笔：名字`（空名以「未命名伏笔」兜底）；
 * - 第 2 行按变体分支：
 *   - 埋设点 `status === 'recovered'` → `recovered`，显示**回收位置**（解析不到 → 「已回收」）；
 *   - 埋设点 `status === 'abandoned'` → `abandoned`，显示**已废弃**；
 *   - 埋设点 `status === 'planted'` → `planted`，显示**待回收**；
 *   - 大纲埋点：上述文案前加 `mark.secondary` 前缀（`大纲埋点 · …`）；
 *   - 回收点（`recoverAnchorKind !== 'none'`）→ `recover-site`，显示**原埋设位置**；
 * - 第 3 行为 `description`（已 trim；空串 = 浮窗不渲染该行）。
 */
function buildMarkEntries(
  data: ForeshadowMarkData,
  context: ForeshadowMarkContext
): ForeshadowMarkEntry[] {
  const { t, resolveLabel } = context
  const entries: ForeshadowMarkEntry[] = []

  for (const { row, slot } of data.planted) {
    const outlineSlot = slot === 'outline'
    const recovered = row.status === 'recovered'
    const name = row.title.trim()
    // 埋设点三种状态三分支：已回收 / 已废弃 / 埋设中（含兜底，避免未知状态漏标）。
    const variant: ForeshadowMarkVariant = recovered
      ? 'recovered'
      : row.status === 'abandoned'
        ? 'abandoned'
        : 'planted'
    let status: string
    if (recovered) {
      const place = resolvePlace(
        row.recoverAnchorKind,
        row.recoverAnchorKind === 'chapter' ? row.recoverChapterId : row.recoverOutlineItemId,
        resolveLabel
      )
      status = place === '' ? t('mark.recovered') : t('mark.recoveredAt', { place })
    } else if (variant === 'abandoned') {
      status = t('mark.abandoned')
    } else {
      status = t('mark.pending')
    }
    // 大纲埋点与正文埋点共用状态行措辞，仅加前缀：同一伏笔的两处埋点标记
    // 悬停文案因此可区分（否则两处文字完全相同，看不出哪处是大纲埋点）。
    if (outlineSlot) status = t('mark.secondary', { status })
    entries.push({
      id: row.id,
      kind: outlineSlot ? 'plant2' : 'plant',
      variant,
      tip: {
        heading: t('mark.heading', { name: name === '' ? t('field.untitled') : name }),
        status,
        description: row.description.trim()
      },
      paragraphIdx: outlineSlot ? row.outlineParagraphIdx : row.bodyParagraphIdx,
      quote: outlineSlot ? row.outlineQuote : row.bodyQuote,
      charStart: outlineSlot ? row.outlineCharStart : row.bodyCharStart,
      charEnd: outlineSlot ? row.outlineCharEnd : row.bodyCharEnd
    })
  }

  for (const row of data.recovered) {
    // 无回收点锚点的行不会命中 `listByRecoverAnchor`，此处再守一道（防御性）。
    if (row.recoverAnchorKind === 'none') continue
    const place = resolvePlace(
      row.bodyKind,
      row.bodyKind === 'chapter' ? row.bodyChapterId : row.outlineItemId,
      resolveLabel
    )
    const name = row.title.trim()
    entries.push({
      id: row.id,
      kind: 'recover',
      variant: 'recover-site',
      tip: {
        heading: t('mark.heading', { name: name === '' ? t('field.untitled') : name }),
        status: t('mark.plantedPlace', {
          place: place === '' ? t('mark.unknownPlace') : place
        }),
        description: row.description.trim()
      },
      paragraphIdx: row.recoverParagraphIdx,
      quote: row.recoverQuote,
      charStart: row.recoverCharStart,
      charEnd: row.recoverCharEnd
    })
  }

  return entries
}

/**
 * 重新拉取并写回标记（可复用入口：创建 / 回收 / 删除 / 改名后调用）。
 *
 * 编辑器已销毁时静默返回；`chapterId` 与 `outlineItemId` 皆空表示「当前无锚点载体」→ 清空。
 */
export async function refreshForeshadowMarks(
  editor: Editor | null,
  chapterId: number | null,
  outlineItemId: number | null,
  context: ForeshadowMarkContext
): Promise<void> {
  if (editor === null || editor.isDestroyed) return
  const data = await fetchMarkData(chapterId, outlineItemId)
  if (editor.isDestroyed) return
  updateForeshadowMarks(editor, buildMarkEntries(data, context))
}

/**
 * 伏笔正文标记的「写后失效」事件名：伏笔模块删除 / 改名 / 回收后派发，
 * 已挂载的章节 / 大纲编辑器据此重新拉取锚点列表（见 `useForeshadowMarks`）。
 */
export const FORESHADOW_MARKS_REFRESH_EVENT = 'wf:foreshadow-marks-refresh'

/** 派发正文标记失效事件（无 `window` 环境为空操作）。 */
export function notifyForeshadowMarksRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(FORESHADOW_MARKS_REFRESH_EVENT))
}

/**
 * 挂载即按锚点加载伏笔标记（埋设点 + 回收点），锚点 / 位置名解析 / 语言变化时重拉。
 *
 * 竞态：切换过快时旧请求可能后返回——用 `cancelled` 闭包丢弃过期结果，
 * 保证插件里始终是**当前**章 / 条目的标记列表。
 *
 * 跨模块写：伏笔列表页删除 / 改名 / 回收后经 `notifyForeshadowMarksRefresh` 派发事件，
 * 本 hook 监听后立即重拉（编辑器常驻，不依赖切章 / 切条目才刷新）。
 */
export function useForeshadowMarks(
  editor: Editor | null,
  chapterId: number | null,
  outlineItemId: number | null,
  resolveLabel?: ForeshadowLabelResolver
): void {
  const { t } = useTranslation('foreshadow')
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return
    // 无锚点载体（未选章 / 大纲卷 / 分组目标）：清空，避免残留上一条的标记。
    if (chapterId === null && outlineItemId === null) {
      updateForeshadowMarks(editor, [])
      return
    }
    let cancelled = false
    const apply = (data: ForeshadowMarkData): void => {
      if (cancelled || editor.isDestroyed) return
      updateForeshadowMarks(editor, buildMarkEntries(data, { resolveLabel, t }))
    }
    void fetchMarkData(chapterId, outlineItemId).then(apply)

    const handleRefresh = (): void => {
      void fetchMarkData(chapterId, outlineItemId).then(apply)
    }
    window.addEventListener(FORESHADOW_MARKS_REFRESH_EVENT, handleRefresh)
    return () => {
      cancelled = true
      window.removeEventListener(FORESHADOW_MARKS_REFRESH_EVENT, handleRefresh)
    }
  }, [editor, chapterId, outlineItemId, resolveLabel, t])
}

export default useForeshadowMarks

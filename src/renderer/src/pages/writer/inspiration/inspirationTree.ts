/**
 * 灵感域展示口径：类型别名 + 右栏草稿补丁（纯函数，不发起 IPC）。
 *
 * 数据层 `inspirations` 已就绪（富文本正文双列 `content` + `content_json` + JSON 数组标签 +
 * 物理删除），本文件只做「行 → 草稿」与「草稿 → 仅变更字段补丁」的比对；标签归一化口径与
 * 主进程 `normalizeInspirationTags` 保持一致（去空白 / 去重 / 截断 / 限数），
 * 避免保存后服务端归一化结果与草稿不同而产生「假脏态」。
 */
import type { RefObject } from 'react'
import type {
  InspirationRow,
  InspirationUpdatePatch
} from '../../../../../main/database/inspirations'
import { plainTextToDocJson } from '../../../../../shared/richTextDoc'

export type { InspirationRow, InspirationUpdatePatch }

/**
 * 单条灵感最多保留的标签数 / 单个标签最长字符数。
 *
 * 与主进程 `src/main/database/inspirations.ts` 的 `MAX_INSPIRATION_TAGS` /
 * `MAX_INSPIRATION_TAG_CHARS` 对齐：渲染层不能直接 import 主进程数据模块
 * （其顶层会加载 better-sqlite3），故在此留一份展示侧常量并注明同步义务。
 */
export const INSPIRATION_MAX_TAGS = 20
export const INSPIRATION_MAX_TAG_CHARS = 40

/**
 * 右栏表单草稿：标题 / 富文本正文 / 标签。
 *
 * 正文持有**富文本 JSON 真源**（整条 Tiptap JSON 串；`null` = 空正文）；卡片摘要 / 搜索
 * 仍读行值派生列 `content`，草稿不再持有纯文本。
 */
export interface InspirationDraft {
  title: string
  contentJson: string | null
  tags: string[]
}

/**
 * 读侧兜底：取行的富文本正文。
 *
 * - `contentJson` 非空且**可解析** → 原样使用（富文本真源）；
 * - 否则（`NULL` / 空串 / 坏 JSON，即富文本化之前的老数据）→ 用共享工具
 *   `plainTextToDocJson(row.content)` 把派生纯文本按行包成合法文档；
 * - 纯空白 / 空正文 → `null`（空正文口径，与主进程 `normalizeRichTextJson` 一致）。
 *
 * 坏 JSON 不抛错：右栏不应因老库脏数据打不开；兜底后的文档与编辑器空态判定同口径，
 * 保证「打开即净态」（草稿与解析基线相等）。口径同 `resolveForeshadowDescriptionJson`。
 */
export function resolveInspirationContentJson(row: InspirationRow): string | null {
  const raw = row.contentJson?.trim() ?? ''
  if (raw !== '') {
    try {
      JSON.parse(raw)
      return raw
    } catch {
      // 坏 JSON：落回纯文本摘要兜底（见上方说明）。
    }
  }
  const fallback = plainTextToDocJson(row.content)
  return fallback === '' ? null : fallback
}

/** 按行值创建草稿（正文取富文本 JSON，老数据经读侧兜底；标签复制一份，避免直改行数组）。 */
export function createInspirationDraft(row: InspirationRow): InspirationDraft {
  return {
    title: row.title,
    contentJson: resolveInspirationContentJson(row),
    tags: [...row.tags]
  }
}

/**
 * 草稿标签归一化：去空白、截断到 {@link INSPIRATION_MAX_TAG_CHARS}、去重、
 * 最多保留 {@link INSPIRATION_MAX_TAGS} 个；空串直接丢弃（与主进程同口径）。
 */
export function normalizeInspirationDraftTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().slice(0, INSPIRATION_MAX_TAG_CHARS)
    if (tag === '' || seen.has(tag)) continue
    seen.add(tag)
    next.push(tag)
    if (next.length >= INSPIRATION_MAX_TAGS) break
  }
  return next
}

/**
 * 草稿 → 「仅变更字段」补丁（空对象 = 无改动）。
 *
 * - 标题：主进程写入时 trim，故按 trim 后比对；
 * - 正文：以**富文本 JSON** 为真源，与读侧解析基线（{@link resolveInspirationContentJson}）
 *   比对，变更时只下发 `contentJson`——主进程据 JSON 派生纯文本摘要列，两列恒同步
 *   （与伏笔描述 / 剧情场景同口径）；老数据基线也走同一兜底，故「打开不编辑」不脏；
 * - 标签：按归一化结果比对，顺序不同视为变更（保持用户输入顺序）。
 */
export function buildInspirationPatch(
  row: InspirationRow,
  draft: InspirationDraft
): InspirationUpdatePatch {
  const patch: InspirationUpdatePatch = {}
  const title = draft.title.trim()
  if (title !== row.title) patch.title = title
  if (draft.contentJson !== resolveInspirationContentJson(row)) {
    patch.contentJson = draft.contentJson
  }
  const tags = normalizeInspirationDraftTags(draft.tags)
  if (JSON.stringify(tags) !== JSON.stringify(row.tags)) patch.tags = tags
  return patch
}

/**
 * 灵感装配包：`Writer.tsx` 经 `useInspirationBundle` 取用，按 props 透传中 / 右栏。
 * 仅活动模块为 `inspiration` 时非空（其余模块为 null，视图不挂载）。
 */
export interface InspirationBundle {
  bookId: string
  /** 当前筛选（标签 + 关键词）下可见的未删除灵感（本地派生）。 */
  rows: InspirationRow[]
  /** 当前选中项 id（null = 全书列表为空；筛选不改变选中项）。 */
  activeId: number | null
  /** 当前选中行（null = 全书列表为空）。 */
  activeRow: InspirationRow | null
  /** 首次加载 / 换书加载中（列表为空时渲染加载态，不闪空态）。 */
  loading: boolean
  /** 当前书列表读取失败（列表为空时渲染错误态 + 重试，而非空态）。 */
  loadError: boolean
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
  /** 是否有挂起的域内切换（有脏时点选 / 新建 / 切筛选暂缓，等两态确认）。 */
  switchPending: boolean
  /** 结算挂起的域内切换；返回是否已执行切换。 */
  onResolveSwitch: (save: boolean) => Promise<boolean>
  /** 切换守卫：无脏立即执行；有脏挂起该动作。 */
  guardSwitch: (proceed: () => void) => void
  /** 保存结算中（确认框禁用按钮）。 */
  confirming: boolean
  /** 选中一条灵感（不自动展开右栏，展开由 bundle hook 包装）。 */
  onSelect: (id: number) => void
  /** 新建一条空白灵感（成功后清筛选并选中新行）；返回是否成功。 */
  onCreate: () => Promise<boolean>
  /** 更新补丁；返回是否落库成功。 */
  onUpdate: (id: number, patch: InspirationUpdatePatch) => Promise<boolean>
  /** 永久删除；返回是否落库成功。 */
  onDelete: (id: number) => Promise<boolean>
  /** 重新拉取全书列表（新建 / 删除后同步；本地筛选自动重算）。 */
  reload: (selectFirst?: boolean) => Promise<void>
}

/**
 * 灵感域展示口径：类型别名 + 右栏草稿补丁（纯函数，不发起 IPC）。
 *
 * 数据层 `inspirations` 已就绪（纯文本正文 + JSON 数组标签 + 物理删除），本文件只做
 * 「行 → 草稿」与「草稿 → 仅变更字段补丁」的比对；标签归一化口径与主进程
 * `normalizeInspirationTags` 保持一致（去空白 / 去重 / 截断 / 限数），
 * 避免保存后服务端归一化结果与草稿不同而产生「假脏态」。
 */
import type { RefObject } from 'react'
import type {
  InspirationRow,
  InspirationUpdatePatch
} from '../../../../../main/database/inspirations'

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

/** 右栏表单草稿：标题 / 纯文本正文 / 标签。 */
export interface InspirationDraft {
  title: string
  content: string
  tags: string[]
}

/** 按行值创建草稿（标签复制一份，避免草稿编辑直接改到行数组）。 */
export function createInspirationDraft(row: InspirationRow): InspirationDraft {
  return { title: row.title, content: row.content, tags: [...row.tags] }
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
 * - 正文：纯文本真源，逐字比对（保留首尾空白 / 换行）；
 * - 标签：按归一化结果比对，顺序不同视为变更（保持用户输入顺序）。
 */
export function buildInspirationPatch(
  row: InspirationRow,
  draft: InspirationDraft
): InspirationUpdatePatch {
  const patch: InspirationUpdatePatch = {}
  const title = draft.title.trim()
  if (title !== row.title) patch.title = title
  if (draft.content !== row.content) patch.content = draft.content
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

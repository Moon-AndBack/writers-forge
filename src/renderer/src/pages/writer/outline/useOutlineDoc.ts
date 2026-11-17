import type { Content, Editor } from '@tiptap/core'
import type { ContentSwapPhase } from '@renderer/components/editor/useContentSwap'
import type { SaveStatus } from '@renderer/components/editor/useRichTextAutoSave'
import { useRichTextAutoSave } from '@renderer/components/editor/useRichTextAutoSave'
import { sanitizeOutlineContent } from '@renderer/components/editor/imageNode'

/**
 * 大纲正文链路（新结构：正文**整条内联**在 `outline_items.content_json`）。
 *
 * 读：`contentId` 变化 → `outline:getContent` → 反差 `contentJson` 建 doc（空正文 → 空 doc）；
 * 写：doc 变更 → 防抖 800ms → 整条 doc JSON（`editor.getJSON()`，**落库前经
 *     `sanitizeOutlineContent` 归一图片节点**：上传图 `src` 强制为稳定占位串
 *     `wf-image://<id>`、运行时 `blob:` 一律剥离，见 `components/editor/imageNode.ts`）
 *     + 纯文本摘要（`doc.textContent`）→ `outline:saveContent`，失败 warn 并静默重试一次；
 *     切换条目 / 卸载前 flush 立即落盘，避免丢字。
 *
 * 状态机（防抖 / 快照比对 / 重试 / flush / 归属与序号守卫）与章节共用
 * `useRichTextAutoSave`，此处只提供大纲域的整条 JSON 映射与保存载荷。
 *
 * `contentId` 为正文**载体行 id**（`outline_items.id`）：条目 = 条目行 id；
 * 正文卷 / 分组容器 = 各自卷级大纲行（`scope='volume'`）id（由 `useOutlineVolumes` 解析）；
 * 载体缺失（如卷纲行缺失）为 null。
 *
 * 与章节域 `useChapterDoc` 的取舍：章节正文按「每段一行」存 `paragraphs` 表；大纲正文整条
 * 存 `content_json`（支持 heading / 列表 / 表格块级结构），故此处**不复用**段落映射工具。
 * 字数展示与章节域同源，走 `docWordLimit.docCharCount` 的编辑器块级缓存，本链路不做逐键统计。
 */

/** 空文档（无正文 / 载体缺失时占位）：与 `OutlineEditor` 的空态判定口径一致。 */
const EMPTY_DOC: Content = { type: 'doc', content: [{ type: 'paragraph' }] }

/** 大纲文档链路状态。 */
export type OutlineDocStatus = SaveStatus

export interface UseOutlineDocOptions {
  /** 正文载体行 id（`outline_items.id`）；null 表示无载体（不加载 / 不保存）。 */
  contentId: number | null
  /** Tiptap 编辑器实例（未就绪时为 null）。 */
  editor: Editor | null
}

export interface UseOutlineDocResult {
  /** 加载 / 保存状态指示（脚注展示）。 */
  status: OutlineDocStatus
  /** 是否存在尚未落盘的改动。 */
  dirty: boolean
  /** 最近一次成功落盘时间（ISO 字符串），供编辑头「最后编辑」相对时间展示。 */
  lastSavedAt: string | null
  /** 绑定到 `editor.on('update')` 的回调。 */
  onUpdate: () => void
  /** 立即落盘挂起保存（可 await）。 */
  flush: () => Promise<void>
  /**
   * 正文更换后的淡入相位（`null` = 首次挂载 / 初次载入，不淡入）。
   * 与章节域共用 `useContentSwap`，调用处渲染为 `.editor-scroll` 的 `data-swap-phase`。
   */
  swapPhase: ContentSwapPhase | null
}

/** 保存载荷：整条 doc JSON + 纯文本摘要（口径见 `captureOutline`）。 */
interface OutlinePayload {
  contentJson: string
  text: string
}

/** 解析库内 `contentJson`：合法对象原样返回，非法 / 空 → 空文档（不抛错）。 */
function parseContentJson(contentJson: string | null): Content {
  if (contentJson === null || contentJson.trim() === '') return EMPTY_DOC
  try {
    const parsed = JSON.parse(contentJson) as unknown
    if (typeof parsed === 'object' && parsed !== null) return parsed as Content
    return EMPTY_DOC
  } catch {
    return EMPTY_DOC
  }
}

/** 读：库内正文载荷 → doc + 已保存快照（快照必须与采集口径一致）。 */
async function loadOutline(id: number) {
  const payload = await window.api.outline.getContent(id)
  const contentJson = payload?.contentJson ?? null
  const text = payload?.text ?? ''
  return {
    content: parseContentJson(contentJson),
    snapshot: JSON.stringify({ contentJson, text })
  }
}

/** 采集：编辑器内容 → 归一后的整条 JSON + 纯文本（返回载荷与快照同源）。 */
function captureOutline(editor: Editor) {
  const contentJson = JSON.stringify(sanitizeOutlineContent(editor.getJSON()))
  const text = editor.state.doc.textContent
  return { payload: { contentJson, text }, snapshot: JSON.stringify({ contentJson, text }) }
}

/** 写：整条覆盖落库；false 交给共享状态机静默重试一次。 */
function saveOutline(id: number, payload: OutlinePayload): Promise<boolean> {
  return window.api.outline.saveContent(id, payload.contentJson, payload.text)
}

/**
 * 大纲条目正文加载与防抖保存（整条 `content_json`）。
 *
 * 返回 `status` / `dirty` / `onUpdate` / `flush` / `swapPhase`（正文更换后的
 * 淡入相位，见 `useContentSwap`），并在切换 `contentId` 与卸载时 flush 挂起的保存。
 */
export function useOutlineDoc({ contentId, editor }: UseOutlineDocOptions): UseOutlineDocResult {
  return useRichTextAutoSave<OutlinePayload>({
    contentId,
    editor,
    load: loadOutline,
    save: saveOutline,
    capture: captureOutline,
    label: '大纲正文'
  })
}

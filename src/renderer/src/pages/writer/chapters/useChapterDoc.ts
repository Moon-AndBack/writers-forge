import type { Editor } from '@tiptap/core'
import type { SaveStatus } from '@renderer/components/editor/useRichTextAutoSave'
import { useRichTextAutoSave } from '@renderer/components/editor/useRichTextAutoSave'
import { FIRST_APPEARANCES_INVALIDATE_EVENT } from '../dossier/useFirstAppearances'
import { docToParagraphs, paragraphsToDocJSON } from './docParagraphs'
import type { DocParagraph } from './docParagraphs'

/**
 * 章节正文链路：
 *
 * 读：`chapterId` 变化 → `chapters:getParagraphs` → 建 doc；
 * 写：doc 变更 → 防抖 800ms → `docToParagraphs` → `chapters:saveParagraphs`，失败 warn
 *     并静默重试一次；切换章节前 flush 立即落盘，避免丢字。
 *
 * 状态机（防抖 / 快照比对 / 重试 / flush / 归属与序号守卫）与大纲共用
 * `useRichTextAutoSave`，此处只提供章节域的段落映射与保存载荷。
 *
 * `chapterId` 来源：章节树行 `ChapterRow.id`（正文直接归属章节，`documents` 表已删除）。
 * 字数展示走 `docWordLimit.docCharCount` 的编辑器块级缓存（与输入拦截同源），本链路不再
 * 逐键全量统计。
 */

export interface ChapterDocState {
  /** 加载 / 保存状态指示（状态栏展示）。 */
  status: SaveStatus
  /** 是否存在尚未落盘的改动（状态栏「未保存」显示用，不参与保存机制）。 */
  dirty: boolean
  /** 最近一次成功落盘时间（ISO 字符串），供编辑头「最后编辑」相对时间展示。 */
  lastSavedAt: string | null
}

interface UseChapterDocOptions {
  /** 章节 id；null 表示无选中章（不加载 / 不保存）。 */
  chapterId: number | null
  editor: Editor | null
}

/** 读：段落行 → 段落数组（idx 升序；空章兜底一个空段）。 */
async function loadChapter(id: number, editor: Editor) {
  const rows = await window.api.chapters.getParagraphs(id)
  const paragraphs: DocParagraph[] =
    rows.length > 0
      ? [...rows]
          .sort((a, b) => a.idx - b.idx)
          .map((row) => ({ text: row.text, contentJson: row.contentJson }))
      : [{ text: '', contentJson: null }]
  return {
    content: paragraphsToDocJSON(paragraphs, { withContentJson: true, schema: editor.schema }),
    snapshot: JSON.stringify(paragraphs)
  }
}

/** 采集：编辑器顶层块 → 段落数组（保存载荷与快照同源）。 */
function captureChapter(editor: Editor) {
  const paragraphs = docToParagraphs(editor, { withContentJson: true })
  return { payload: paragraphs, snapshot: JSON.stringify(paragraphs) }
}

/** 写：整章段落全量重写；`{ ok: false }` 交给共享状态机静默重试一次。 */
async function saveChapter(id: number, paragraphs: DocParagraph[]): Promise<boolean> {
  const result = await window.api.chapters.saveParagraphs(id, paragraphs)
  return result.ok
}

/** 章节正文落库后广播首次登场失效（主进程按内容版本增量重扫，渲染层后台重取）。 */
function invalidateFirstAppearances(): void {
  window.dispatchEvent(new Event(FIRST_APPEARANCES_INVALIDATE_EVENT))
}

/**
 * 章节正文加载与防抖保存。
 *
 * 返回 `status`（loading/ready/saving/error）、`dirty`、`lastSavedAt`、
 * `swapPhase`（正文更换后的淡入相位，见 `useContentSwap`），
 * 并在卸载 / 切章时 flush 挂起的保存。`flush` 供外部（保存按钮 / 快捷键）调用。
 */
export function useChapterDoc({ chapterId, editor }: UseChapterDocOptions) {
  return useRichTextAutoSave<DocParagraph[]>({
    contentId: chapterId,
    editor,
    load: loadChapter,
    save: saveChapter,
    capture: captureChapter,
    onSaved: invalidateFirstAppearances,
    label: '章节正文'
  })
}

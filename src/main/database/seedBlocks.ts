import type { ChapterStatus } from './chapters'

/**
 * 教学书种子：块级 Tiptap JSON 构造器与段落 / 卷 / 章类型。
 *
 * 自 `chapterSeed.ts` 迁出为独立模块：`chapterSeed.ts`（重建机制）与
 * `seedGuideBook/`（教学内容数据）都依赖这些构造器，独立成文件
 * 避免两者循环 import（单文件 ≤500 行约束见 §3）。
 *
 * 构造器产出的段落与 `saveParagraphs` 的 `ParagraphInput` 同构：
 * `text` 为该块纯文本摘要（字数统计 / 搜索真源），`contentJson` 为
 * 块级 Tiptap JSON 串（章节编辑器按纯段落口径渲染——降级为纯文本；
 * 大纲编辑器完整渲染 heading / 列表 / bold）。
 *
 * 大纲正文（`outline_items.content_json`）为**整条内联**：经 `seedOutlineDoc`
 * 把若干块级段落包成一个 `doc` JSON 串（对齐 `saveOutlineContent` 的入参口径）。
 */

/** 种子段落写入项：与 `saveParagraphs` 的 `ParagraphInput` 同构。 */
export type SeedParagraph = {
  /** 该块纯文本摘要（字数统计 / 搜索真源，不含格式语法）。 */
  text: string
  /** 块级 Tiptap JSON 串；缺省 / null = 纯文本段。 */
  contentJson?: string | null
}

/**
 * 种子章：普通章仅 `title`（名段）；特殊章另有 `specialPrefix`（前段）。
 * `kind` / `specialPrefix` / `pin` 三者的合法组合由 `createChapter` 守卫
 * （特殊章须两段齐全且仅特殊章可 pin）。
 */
export type SeedChapter = {
  /** 名段（右框）；普通章可空 = 无自定义名（显示自动编号）。 */
  title?: string
  /** 章判别：`special` = 特殊章（前段 + 名两段，不占「第X章」编号）。缺省 `normal`。 */
  kind?: 'normal' | 'special'
  /** 特殊章前段（左框，如「序章」）；`kind='special'` 时必填。 */
  specialPrefix?: string
  /** 特殊章 pin（'top' 置顶 / 'bottom' 置底）；普通章忽略。 */
  pin?: 'top' | 'bottom'
  status?: ChapterStatus
  /** 样例正文（每项一块，缺省 = 空正文）。 */
  paragraphs?: readonly SeedParagraph[]
}

/**
 * 种子卷：`kind='normal'` = 正文卷（自动「卷X」编号，`title` 为可空名段）；
 * `kind='custom'` = 自定义卷（`title` 即完整整名，不参与编号）。
 * 分组容器（`kind='group'`）**不由教学书建立**——它属大纲域（见 `seedGuideBook/outline.ts`）。
 */
export type SeedVolume = {
  /** 卷判别（章节页可见的两种：正文卷 / 自定义卷）。 */
  kind: 'normal' | 'custom'
  /** 卷名段（`normal` 可空 = 纯自动编号）/ 完整整名（`custom`）。 */
  title: string
  chapters: readonly SeedChapter[]
}

/** 富文本片段：`bold` 为 true 时该片段带 bold mark。 */
export interface SeedSection {
  text: string
  bold?: boolean
}

/**
 * 块级 Tiptap JSON 构造：标题块（`level` 缺省 1）。
 * text 为该块纯文本摘要（须与 heading 内容一致）。
 */
export function seedHeading(text: string, level: 1 | 2 | 3 = 1): SeedParagraph {
  return {
    text,
    contentJson: JSON.stringify({
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text }]
    })
  }
}

/**
 * 块级 Tiptap JSON 构造：普通段落（统一新格式：一律带块 JSON）。
 * 单片段纯文本段（bold 需求用 `seedRichParagraph`）。
 */
export function seedParagraph(text: string): SeedParagraph {
  return {
    text,
    contentJson: JSON.stringify({
      type: 'paragraph',
      content: [{ type: 'text', text }]
    })
  }
}

/**
 * 块级 Tiptap JSON 构造：富文本段落（分段表达 bold mark）。
 * `text` 摘要由各片段按序拼接派生（调用方无需再传，杜绝摘要与内容漂移）；
 * bold 片段加 `marks: [{ type: 'bold' }]`，其余片段纯文本。
 */
export function seedRichParagraph(sections: readonly SeedSection[]): SeedParagraph {
  const text = sections.map((section) => section.text).join('')
  return {
    text,
    contentJson: JSON.stringify({
      type: 'paragraph',
      content: sections
        .filter((section) => section.text !== '')
        .map((section) => ({
          type: 'text',
          text: section.text,
          ...(section.bold === true ? { marks: [{ type: 'bold' }] } : {})
        }))
    })
  }
}

/**
 * 块级 Tiptap JSON 构造：无序列表块（`bulletList`）。
 * `items` 为各列表项纯文本；text 摘要为各项前缀「• 」后拼接
 * （章节编辑器按纯段落口径渲染时，该项显示为一段含「• 」的文本，仍可读）。
 */
export function seedBulletList(items: readonly string[]): SeedParagraph {
  return {
    text: items.map((item) => `• ${item}`).join(''),
    contentJson: JSON.stringify({
      type: 'bulletList',
      content: items.map((item) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: item }]
          }
        ]
      }))
    })
  }
}

/** 大纲正文载荷：整条 `doc` JSON 串 + 派生纯文本摘要（对齐 `saveOutlineContent` 入参）。 */
export interface SeedOutlineDoc {
  /** 块级 JSON 串（顶层 `doc`，内容为各块原样拼接）。 */
  contentJson: string
  /** 纯文本摘要（各块摘要按序拼接）。 */
  text: string
}

/** 块级 JSON 串 → 块对象；损坏 / 非对象时降级为纯文本段（不丢字）。 */
function parseBlock(block: SeedParagraph): unknown {
  if (block.contentJson !== undefined && block.contentJson !== null && block.contentJson !== '') {
    try {
      const parsed: unknown = JSON.parse(block.contentJson)
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch {
      // 忽略：降级为纯文本段（种子数据自带 JSON，正常不会走到这里）
    }
  }
  return {
    type: 'paragraph',
    ...(block.text !== '' ? { content: [{ type: 'text', text: block.text }] } : {})
  }
}

/**
 * 大纲正文整合：把若干块级段落包成**整条** `doc` JSON（`outline_items.content_json`
 * 的落库口径为整条内联，与章节域逐段成行不同），并派生纯文本摘要。
 */
export function seedOutlineDoc(blocks: readonly SeedParagraph[]): SeedOutlineDoc {
  return {
    contentJson: JSON.stringify({ type: 'doc', content: blocks.map(parseBlock) }),
    text: blocks.map((block) => block.text).join('')
  }
}

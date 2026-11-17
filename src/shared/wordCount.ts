/**
 * 正文「有效字数」口径与字数上限**跨进程共享**的单一真源（主进程 `database/wordCount`
 * 与渲染层 `pages/writer/chapters/docParagraphs` 共用，AGENTS §2 / §9）。
 *
 * 本文件只允许**类型 + 纯数据 + 纯函数**，不得引入 Node / React。
 *
 * 口径：逐码点统计，排除 `\p{P}` 标点、`\p{S}` 符号（含 emoji）、`\p{Z}` 空白分隔符、
 * `\p{C}` 控制符；中文 / 英文 / 数字等其余字符逐个计数。
 */

/** 单篇正文有效字数上限（**有效字数**口径：排除标点 / 符号 / 空白 / 控制符）。 */
export const MAX_DOC_CHARS = 200_000

/**
 * 富文本 JSON 串长度上限（**字符数**，非有效字数）。
 *
 * 与 `MAX_DOC_CHARS` **数值相同但口径不同**：块级 Tiptap JSON 因节点 / 属性冗余，
 * 体量约为纯文本的 2–3 倍，20 万字符（≈200KB）足以覆盖上限内正文。供伏笔描述 /
 * 灵感正文等整条 JSON 入参的长度兜底，比较依据是 `string.length`。
 */
export const RICH_TEXT_JSON_MAX_CHARS = 200_000

/** 不计入字数的字符（Unicode 类别，`u` 标志下逐字符匹配）。 */
export const NON_COUNTABLE_CHAR = /[\p{P}\p{S}\p{Z}\p{C}]/u

/** 正文有效字数：逐码点统计可计字符。 */
export function countEffectiveChars(texts: readonly string[]): number {
  let count = 0
  for (const text of texts) {
    for (const ch of text) {
      if (!NON_COUNTABLE_CHAR.test(ch)) count += 1
    }
  }
  return count
}

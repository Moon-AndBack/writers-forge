/**
 * 正文「有效字数」口径（主进程侧镜像）。
 *
 * 与渲染层 `src/renderer/src/pages/writer/chapters/useChapterDoc.ts` 的
 * `countCharacters` **保持同口径**：逐码点统计，排除
 * - `\p{P}` 标点、`\p{S}` 符号（含 emoji）、`\p{Z}` 空白分隔符、`\p{C}` 控制符；
 * - 中文 / 英文 / 数字等其余字符逐个计数。
 *
 * 为何镜像：主进程与渲染层分离、无法互相 import，而 `books.words` / 章节字数
 * 需要在主进程侧聚合（`bookChapterStats`）。改动任一端口径时须同步另一处。
 */

/** 不计入字数的字符（Unicode 类别，`u` 标志下逐字符匹配）。 */
const NON_COUNTABLE_CHAR = /[\p{P}\p{S}\p{Z}\p{C}]/u

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

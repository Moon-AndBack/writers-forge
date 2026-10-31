import type { CleanWordImportInput } from '../../../../preload/types/cleanWords'
import { MAX_WORD_CHARS, isCategory } from './cleanWordsMeta'

/* ---------- 导入解析 ---------- */

export interface ParsedImport {
  words: CleanWordImportInput[]
  /** 本地淘汰的行数（类别非法 / 词过长），计入 toast 的「跳过」。 */
  invalid: number
}

/** 解析粘贴文本：按行 trim；空行与 `#` 开头行忽略；首个制表符前为词、后为类别；缺省 `other`。 */
export function parseImportText(text: string): ParsedImport {
  const words: CleanWordImportInput[] = []
  let invalid = 0

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const tabIndex = line.indexOf('\t')
    const word = (tabIndex === -1 ? line : line.slice(0, tabIndex)).trim()
    if (word === '') continue
    if (word.length > MAX_WORD_CHARS) {
      invalid += 1
      continue
    }
    if (tabIndex === -1) {
      words.push({ word, category: 'other' })
      continue
    }
    const category = line
      .slice(tabIndex + 1)
      .trim()
      .toLowerCase()
    if (category === '') words.push({ word, category: 'other' })
    else if (isCategory(category)) words.push({ word, category })
    else invalid += 1
  }

  return { words, invalid }
}

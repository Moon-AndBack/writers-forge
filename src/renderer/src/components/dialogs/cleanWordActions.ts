import type {
  CleanWordCategory,
  CleanWordImportInput,
  CleanWordImportResult
} from '../../../../preload/types/cleanWords'
// 违禁词表改动后必须令检测词表缓存失效。`proofreadMark` 属页面层，此处引用与
// `useCleanWordsLibrary` 同一既有例外（单个副作用函数，§9 例外条款）。
import { resetActiveCleanWords } from '../../pages/writer/chapters/proofreadMark'

/**
 * 违禁词入库动作（**唯一实现**，供词库弹窗与正文右键菜单共用，§9）。
 *
 * 只做两件事：`cleanWords.import` → 成功即 `resetActiveCleanWords()`。
 * - `import` 对**任一条**入参非法（空词 / 非法类别 / 超过长度上限）会让整批返回 `null`，
 *   故调用方须先按同一口径自查（菜单在展开类别前已校验：trim 非空、无换行、2–100 字）；
 * - 重复词不报错：数据层走 UPDATE（覆盖类别与替代词，保留 `enabled` / `source`），
 *   计入 `result.updated`；新词计入 `result.inserted`；
 * - IPC 异常 / 非法入参统一收敛为 `null`，调用方只需判空。
 */
export async function addCleanWords(
  words: CleanWordImportInput[]
): Promise<CleanWordImportResult | null> {
  try {
    const result = await window.api.cleanWords.import(words)
    // 失败（null）未写库，无需失效缓存；仅成功时重扫，避免无谓的整篇重算。
    if (result !== null) resetActiveCleanWords()
    return result
  } catch {
    return null
  }
}

/** 单条添加结果（菜单据此选 toast 文案：新增 / 更新 / 已存在 / 失败）。 */
export type CleanWordAddOutcome = 'inserted' | 'updated' | 'exists' | 'failed'

/** 单条添加（右键菜单用）：把批量结果归并为四态，页面层无需重复判计数。 */
export async function addCleanWord(
  word: string,
  category: CleanWordCategory
): Promise<CleanWordAddOutcome> {
  const result = await addCleanWords([{ word, category }])
  if (result === null) return 'failed'
  if (result.inserted > 0) return 'inserted'
  if (result.updated > 0) return 'updated'
  return 'exists'
}

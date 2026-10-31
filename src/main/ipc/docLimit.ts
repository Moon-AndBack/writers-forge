import { countEffectiveChars } from '../database/wordCount'

/**
 * 单篇正文有效字数上限（**主进程侧**常量）。
 *
 * **口径**：每章正文独立 ≤ 200,000；每条大纲正文独立 ≤ 200,000 —— 是**单篇上限**，
 * 不是全书合计。字数按**有效字数**口径计（排除标点 / 符号 / 空白 / 控制符），
 * 与渲染层 `docParagraphs.countCharacters` 同口径。
 *
 * **为何落 IPC 层而非 DB CHECK**：上限是「单篇正文」的约束，而 chapters 域正文按
 * `paragraphs` 表**逐段成行**存储、outline 域正文整条内联在 `content_json` —— 前者的
 * 跨行总和在行级 CHECK 中不可见；且本项目明确不在 DB 层放此约束。改由 **IPC 校验层
 * （渲染层输入拦截 + 此处保存兜底）** 承担双保险。
 *
 * **落地范围**：仅 `chapters:saveParagraphs` 与 `outline:saveContent` 两个写入通道
 * （本功能**不新增任何 IPC 通道**，故 `src/preload/**` 无需改动，返回值形态亦不变）。
 *
 * ⚠️ 跨进程常量的**已登记例外**：渲染层无法 import 主进程模块，故
 * `src/renderer/src/pages/writer/docWordLimit.ts` 另持一份同值常量；
 * 改动任一端口径 / 上限时须同步另一处。
 */

/** 单篇正文有效字数上限（有效字数口径：排除标点 / 符号 / 空白 / 控制符）。 */
export const MAX_DOC_CHARS = 200_000

/**
 * 一组文本的有效字数（**唯一口径真源**：直接委托 `database/wordCount.countEffectiveChars`）。
 *
 * 各写入 handler 在落库前算出该值并与 `MAX_DOC_CHARS` 比较，超限则拒绝写入。
 */
export function docEffectiveChars(texts: readonly string[]): number {
  return countEffectiveChars(texts)
}

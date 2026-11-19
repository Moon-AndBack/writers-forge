import { countEffectiveChars } from '../../shared/wordCount'

/**
 * 单篇正文有效字数上限（**主进程侧**入口，真源在 `src/shared/wordCount.ts`）。
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
 * **落地范围**：`chapters:saveParagraphs` 与 `outline:saveContent` 两个写入通道。
 * 章节按各段 `text` 合计；大纲按**主进程从 `contentJson` 派生的纯文本**（块间 `\n`）计，
 * 两者均走 {@link docEffectiveChars}。两通道返回值形态不变（`{ ok: boolean }` / `boolean`），
 * 故 `src/preload/**` 无需改动。
 */

/** 单篇正文有效字数上限（有效字数口径：排除标点 / 符号 / 空白 / 控制符）。 */
export { MAX_DOC_CHARS } from '../../shared/wordCount'

/**
 * 一组文本的有效字数（**唯一口径真源**：直接委托共享 `countEffectiveChars`）。
 *
 * 各写入 handler 在落库前算出该值并与 `MAX_DOC_CHARS` 比较，超限则拒绝写入。
 */
export function docEffectiveChars(texts: readonly string[]): number {
  return countEffectiveChars(texts)
}

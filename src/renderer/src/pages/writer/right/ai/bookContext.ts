/**
 * 章节右栏 AI · 「作品设定」提示词拼装（纯函数，无 React / 无 IPC）。
 *
 * 面板按当前书籍的频道 + 分类，拼出一段写作风格约束，作为 system prompt 的一部分
 * 随请求发给模型（口径见 `functions.ts` 的 `composeMessages`）：
 * 任务规则 → **作品设定** → 输出格式约束。
 *
 * 分类风格句来自 `categoryStyleHints.ts`（按官方 `origin_id` 建表）；本文件只负责
 * 把「频道名 + 分类名 + 风格句」拼成人可读、模型可执行的一段话，不做查表。
 */

/** 拼装入参（已收敛成展示文案，查表与消歧在 `useBookProfile` 里完成）。 */
export interface BookContextInput {
  /** 频道显示名（如「男频」）；null = 未设置。 */
  channelLabel: string | null
  /** 分类的显示名与其风格提示（按用户选择顺序）。 */
  categories: Array<{ name: string; hint: string }>
}

/**
 * 通用写作约束（基础提示词的尾句）。
 *
 * 与 `BASE_PROMPT` 共用同一句，避免「无分类」与「有分类但无风格句」两处口径漂移。
 */
const BASE_GUIDANCE =
  '请保持语言风格与人物设定的一致性，沿用已有的叙事视角与语感，不要混入与题材不符的表达。'

/** 基础提示词：未设分类（或分类全部无法解析）时使用。 */
const BASE_PROMPT = `这是一部连载中的长篇小说。${BASE_GUIDANCE}`

/**
 * 拼装「作品设定」提示词。
 *
 * 有分类时：`这是一部男频·仙侠·古典仙侠类小说。写作时请保持：<hint1>；<hint2>。`
 * - 频道名 + 全部分类名以「·」连接（分类全部列出，不设上限；顺序即用户选择顺序）；
 * - 无频道的跳过频道名；
 * - 风格句去重后以「；」连接；无 `hint` 的分类（自定义分类）只参与名称列举；
 * - 分类存在但没有任何风格句时，退回基础提示词的尾句（名称仍列出）。
 *
 * 无分类时：返回基础提示词（见 `BASE_PROMPT`）。
 */
export function buildBookContext(input: BookContextInput): string {
  const names = input.categories
    .map((category) => category.name.trim())
    .filter((name) => name !== '')
  // 无分类 → 基础提示词（此时频道名无处可挂，忽略）。
  if (names.length === 0) return BASE_PROMPT

  const channel = input.channelLabel?.trim() ?? ''
  const subject = `这是一部${(channel !== '' ? [channel, ...names] : names).join('·')}类小说。`

  const hints = [
    ...new Set(
      input.categories.map((category) => category.hint.trim()).filter((hint) => hint !== '')
    )
  ]
  if (hints.length === 0) return `${subject}${BASE_GUIDANCE}`
  return `${subject}写作时请保持：${hints.join('；')}。`
}

/**
 * 上下文占用估算（纯函数，无 React / 无 IPC）。
 *
 * 口径（与第 4 步的 `prompt_tokens` 校准无关，这里只给稳定估算）：
 * - CJK 字符（汉字 / 假名 / 谚文 / 全角标点）≈ 1 token / 字；
 * - 其余字符 ≈ 3.5 字符 / token；
 * - 每条消息额外约 4 tokens 的角色 / 分隔开销。
 *
 * 估算**不做**分词或联网，同样输入恒得同样输出（纯函数，便于自测与后续校准）。
 */

/** 压缩触发阈值（第 3 步用；本批只导出常量，不接任何逻辑）。 */
export const COMPRESS_RATIO = 0.8

/** 压缩目标比例（第 3 步用；同上）。 */
export const TARGET_RATIO = 0.5

/** 未知模型的默认上下文窗口（32K，与主进程 `modelMatch` 保持一致）。 */
export const DEFAULT_CONTEXT_WINDOW = 32_768

/** 非 CJK 字符的 token 换算系数（约 3.5 字符 / token）。 */
const CHARS_PER_TOKEN = 3.5

/** 每条消息的固定开销（角色标记 / 分隔符等）。 */
const MESSAGE_OVERHEAD_TOKENS = 4

/**
 * 是否按「1 字符 ≈ 1 token」计的中日韩区段。
 *
 * 只覆盖常用区段（AGENTS 未要求全覆盖扩展区）：
 * CJK 符号与标点 3000-303F、假名 3040-30FF、CJK 扩展 A 3400-4DBF、
 * CJK 统一表意 4E00-9FFF、兼容表意 F900-FAFF、谚文 AC00-D7AF。
 */
function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  )
}

/** 估算单段文本的 token 数（CJK 1:1，其余 3.5 字符/token，向上取整）。 */
export function estimateTokens(text: string): number {
  if (text === '') return 0

  let cjkChars = 0
  let otherChars = 0
  // for...of 按码点迭代：代理对（emoji / 生僻字）记 1 个字符，而非 2 个。
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0
    if (isCjkCodePoint(codePoint)) cjkChars += 1
    else otherChars += 1
  }

  return Math.ceil(cjkChars + otherChars / CHARS_PER_TOKEN)
}

/** 估算消息列表的 token 数（含每条 4 tokens 开销）。 */
export function estimateMessages(messages: readonly { content: string }[]): number {
  let total = 0
  for (const message of messages) {
    total += MESSAGE_OVERHEAD_TOKENS + estimateTokens(message.content)
  }
  return total
}

/** 数字口径：`1_234` → `1.2K`，`1_048_576` → `1M`（占用条与拒绝提示共用）。 */
export function formatTokenCount(value: number): string {
  const compact = (scaled: number): string => scaled.toFixed(1).replace(/\.0$/, '')
  if (value >= 1_000_000) return `${compact(value / 1_000_000)}M`
  if (value >= 1_000) return `${compact(value / 1_000)}K`
  return String(value)
}

/** 估算结果：用于 UI 展示。 */
export interface ContextUsage {
  usedTokens: number
  limitTokens: number
  /** 0..1+（可超 1，表示已超预算）。 */
  ratio: number
  /** 窗口来源，用于 UI 标注「未知 · 按 32K 估算」。 */
  limitSource: 'override' | 'catalog' | 'baseline' | 'default'
  /** 命中的目录 id（source === 'catalog' 时有值）。 */
  matchedId: string | null
}

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

/**
 * 未知模型的默认上下文窗口（1M，与主进程 `modelMatch` 保持一致）。
 *
 * 这是「未知模型」的**乐观默认值**：目录与内置基线都匹配不到时按 1M 估算。
 * 代价是中转站的小窗口模型不会被提前压缩（超限请求会在上游被拒），
 * 用户可在设置页「自定义上下文窗口」为具体模型覆盖。
 */
export const DEFAULT_CONTEXT_WINDOW = 1_048_576

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

/* ---------- 估算校准（第 4 步）：真实 usage 修正估算偏差 ---------- */

/**
 * 校准系数区间：`真实 / 估算` 超出该区间视为异常观测（例如缓存命中的
 * `prompt_tokens` 只计非缓存部分）并夹取，避免一次异常把系数带崩。
 */
const CALIBRATION_MIN = 0.5
const CALIBRATION_MAX = 3.0

/** EMA 平滑系数：新观测权重 0.3，历史权重 0.7；首次观测直接取比值。 */
const CALIBRATION_ALPHA = 0.3

/** 校准表：`provider/model`（trim + 小写）→ 真实 / 估算比值。 */
const calibrationRatios = new Map<string, number>()

function normalizeCalibrationKey(key: string): string {
  return key.trim().toLowerCase()
}

function clampRatio(value: number): number {
  return Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, value))
}

/**
 * 记录一次校准观测。
 *
 * 只在估算值与真实值都 > 0 时记录（未返回 usage 的轮次直接跳过）。
 * 比值先 clamp 到 `[0.5, 3.0]`，再与历史值做 EMA 平滑。
 */
export function recordCalibration(key: string, estimated: number, actual: number): void {
  if (!(estimated > 0) || !(actual > 0)) return
  const normalized = normalizeCalibrationKey(key)
  if (normalized === '') return

  const ratio = clampRatio(actual / estimated)
  const prev = calibrationRatios.get(normalized)
  calibrationRatios.set(
    normalized,
    prev === undefined ? ratio : prev * (1 - CALIBRATION_ALPHA) + ratio * CALIBRATION_ALPHA
  )
}

/** 取校准系数（缺省 1 = 不校准）。 */
export function getCalibration(key: string): number {
  return calibrationRatios.get(normalizeCalibrationKey(key)) ?? 1
}

/** 清空校准表（模型 / 目录切换或排障时可用）。 */
export function resetCalibration(): void {
  calibrationRatios.clear()
}

/**
 * 按模型名取校准系数。
 *
 * 记录键是 `provider/model`，而占用条只知道模型名，故取同名模型的观测均值
 * （同一模型换服务商时，窗口与分词口径通常一致）。
 */
export function getModelCalibration(model: string): number {
  const normalized = normalizeCalibrationKey(model)
  if (normalized === '') return 1
  const suffix = `/${normalized}`

  let sum = 0
  let count = 0
  for (const [key, value] of calibrationRatios) {
    if (!key.endsWith(suffix)) continue
    sum += value
    count += 1
  }
  return count === 0 ? 1 : sum / count
}

/**
 * 把原始估算换算成「校准后估算」。
 *
 * 只用于**展示**（占用条）：发送决策仍用原始 `estimateMessages`——决策需要稳定、
 * 可复现的绝对值，而校准系数会随每轮真实用量小幅漂移。
 */
export function calibrateForModel(model: string, tokens: number): number {
  const factor = getModelCalibration(model)
  return factor === 1 ? tokens : Math.round(tokens * factor)
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
  /** 窗口来源，用于 UI 标注「未知 · 按 1M 估算」。 */
  limitSource: 'override' | 'provider' | 'catalog' | 'baseline' | 'default'
  /** 命中的目录 id（source === 'catalog' 时有值）。 */
  matchedId: string | null
  /** `usedTokens` 是否已乘校准系数（false = 原始估算，尚无真实观测）。 */
  calibrated: boolean
}

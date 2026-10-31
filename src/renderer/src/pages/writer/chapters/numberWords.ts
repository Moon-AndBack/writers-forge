/**
 * 章 / 卷编号数字词（纯函数，无 React、无 i18n 运行时依赖）。
 *
 * - 中文侧：与主进程 `chineseNumber.ts` 逐字对齐（1–99999，越界 / 非法回退十进制）；
 * - 英文侧：1–9999 的英文单词数字（Title Case，规则化生成，越界 / 非法同口径回退）；
 * - 分派：`numberWord` 按界面语言取对应数字词（Locale 类型来自 i18n/config）。
 *
 * 注：旧「落库卷名反解」链路（`parseStoredVolumeIndex`）已随「编号不落库」的新模型删除
 * ——卷 / 章编号全部由主进程按 `numberIndex` 动态算出，渲染层不再反解快照名。
 */
import type { Locale } from '../../../i18n/config'

/* ---------- 中文数字（1–99999，与主进程 `chineseNumber.ts` 逐字对齐） ---------- */

/** 0–9 的中文数字。 */
const CN_DIGITS: readonly string[] = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 1–9999 的中文数字（千 / 百 / 十位组合），与主进程 `below10000` 同口径。 */
function below10000(n: number): string {
  const thousands = Math.floor(n / 1000)
  const hundreds = Math.floor((n % 1000) / 100)
  const tens = Math.floor((n % 100) / 10)
  const ones = n % 10
  let result = ''
  if (thousands > 0) result += `${CN_DIGITS[thousands]}千`
  if (hundreds > 0) result += `${CN_DIGITS[hundreds]}百`
  if (tens > 1) result += `${CN_DIGITS[tens]}十`
  else if (tens === 1 && thousands + hundreds === 0) result += '十'
  else if (tens === 1) result += '一十'
  if (ones > 0) result += CN_DIGITS[ones]
  return result
}

/**
 * 中文数字转换（1–99999，万级镜像）：万位 =「X万」+ 余数（余数 0 省略）；
 * 余数 < 1000 时补「零」，10–19 补「一」（10010 → 一万零一十）。
 * 范围外或非法值回退为十进制字符串（与主进程同口径）。
 */
export function toChineseNumber(value: number): string {
  const n = Math.trunc(value)
  if (!Number.isFinite(n) || n <= 0 || n > 99999) return String(value)
  if (n < 10000) return below10000(n)
  const tenThousands = Math.floor(n / 10000)
  const rest = n % 10000
  const wan = `${CN_DIGITS[tenThousands]}万`
  if (rest === 0) return wan
  if (rest < 1000) {
    const suffix = rest >= 10 && rest < 20 ? `一${below10000(rest)}` : below10000(rest)
    return `${wan}零${suffix}`
  }
  return `${wan}${below10000(rest)}`
}

/* ---------- 英文数字词（1–9999，Title Case） ---------- */

/** 1–9 的英文单词（下标 0 空置，便于与数字直接对应）。 */
const EN_ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine'
] as const

/** 10–19 的英文单词。 */
const EN_TEENS = [
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
] as const

/** 20–90 的整十英文单词（下标 0 = Twenty）。 */
const EN_TENS = [
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety'
] as const

/** 1–9999 的英文单词数字：Thousand / Hundred + 十位连字符组合，每词首字母大写。 */
function below10000En(n: number): string {
  const thousands = Math.floor(n / 1000)
  const hundreds = Math.floor((n % 1000) / 100)
  const rest = n % 100
  const parts: string[] = []
  if (thousands > 0) parts.push(`${EN_ONES[thousands]} Thousand`)
  if (hundreds > 0) parts.push(`${EN_ONES[hundreds]} Hundred`)
  if (rest >= 10 && rest < 20) {
    parts.push(EN_TEENS[rest - 10])
  } else {
    const tens = Math.floor(rest / 10)
    const ones = rest % 10
    if (tens > 1) parts.push(ones > 0 ? `${EN_TENS[tens - 2]}-${EN_ONES[ones]}` : EN_TENS[tens - 2])
    else if (ones > 0) parts.push(EN_ONES[ones])
  }
  return parts.join(' ')
}

/**
 * 英文单词数字转换（1–9999，Title Case，如 21 → `Twenty-One`）：规则化生成
 * （Thousand / Hundred + 十位连字符），不做例外特判。
 * ≥10000 或非法值回退为十进制字符串（与中文侧同口径）。
 */
export function toEnglishNumber(value: number): string {
  const n = Math.trunc(value)
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return String(value)
  return below10000En(n)
}

/* ---------- 按语言分派 ---------- */

/** 按界面语言分派数字词：`en` → 英文单词数字，其余（zh-CN）→ 中文数字。 */
export function numberWord(value: number, locale: Locale): string {
  return locale === 'en' ? toEnglishNumber(value) : toChineseNumber(value)
}

/**
 * 中文数字转换（章节域自动命名用）。
 *
 * 覆盖 1–99999 的常见中文写法（万级），规则：万位 =「X万」+ 余数
 * （余数为 0 则省略；千 / 百 / 十按位组合，零不显式写出，如 1100 → 一千一百）：
 * - 1 → 一、10 → 十、11 → 十一、20 → 二十、21 → 二十一、99 → 九十九；
 * - 100 → 一百、110 → 一百一十、1100 → 一千一百、9999 → 九千九百九十九；
 * - 10000 → 一万、10001 → 一万零一、10010 → 一万零一十、99999 → 九万九千九百九十九；
 * - 超出 1–99999 的范围回退为阿拉伯数字字符串（仅在极端数据下保持「不抛异常、仍可命名」）。
 *
 * 位置：与 `wordCount.ts` 同为章节域纯函数工具，置于 `main/database/`，
 * 主进程 / 渲染层分离，渲染层若需预览编号应在渲染侧另写镜像（对齐既有约定）。
 */

/** 0–9 的中文数字。 */
const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const

/** 1–9999 的中文数字（千 / 百 / 十位组合）。 */
function below10000(n: number): string {
  const thousands = Math.floor(n / 1000)
  const hundreds = Math.floor((n % 1000) / 100)
  const tens = Math.floor((n % 100) / 10)
  const ones = n % 10
  let result = ''
  if (thousands > 0) result += `${DIGITS[thousands]}千`
  if (hundreds > 0) result += `${DIGITS[hundreds]}百`
  if (tens > 1) result += `${DIGITS[tens]}十`
  else if (tens === 1 && thousands + hundreds === 0) result += '十'
  else if (tens === 1) result += '一十'
  if (ones > 0) result += DIGITS[ones]
  return result
}

/** 将正整数转为中文数字（1–99999）；范围外或非法值回退为十进制字符串。 */
export function toChineseNumber(value: number): string {
  const n = Math.trunc(value)
  if (!Number.isFinite(n) || n <= 0 || n > 99999) return String(value)
  if (n < 10000) return below10000(n)
  const tenThousands = Math.floor(n / 10000)
  const rest = n % 10000
  const wan = `${DIGITS[tenThousands]}万`
  if (rest === 0) return wan
  if (rest < 1000) {
    // 「零」后接 10–19 时补「一」：10010 → 一万零一十（对齐规范写法）。
    const suffix = rest >= 10 && rest < 20 ? `一${below10000(rest)}` : below10000(rest)
    return `${wan}零${suffix}`
  }
  return `${wan}${below10000(rest)}`
}

import type { TFunction } from 'i18next'
import type { CharacterAgeAnchor } from '../../../../../preload/types/worldEntity'
import { plotYearLabel } from '../plot/plotTree'

/**
 * 角色年龄锚点 · 渲染层纯函数。
 *
 * 数据层只存「某条时间线的绝对年 + 年龄」，本模块负责纪元 / 年份互转与展示文案：
 * - 绝对年口径与剧情场景一致：纪前为负、元年 0、纪后为正；
 * - 年龄口径为周岁／年差，负年龄只表示「尚未出生」；
 * - 年份标签复用 `plotYearLabel`，文案 key 仍取 `plot` ns，不复制常量字符串。
 */

/** 纪元选择（`''` = 未设置）。 */
export type AgeEra = '' | 'bc' | 'zero' | 'ad'

/** 纪元 + 年份 → 绝对年；未设置 / 缺整数年返回 null。 */
export function absoluteYearFromEra(era: string, year: number | null): number | null {
  if (era === 'zero') return 0
  if (era !== 'bc' && era !== 'ad') return null
  if (year === null || !Number.isInteger(year)) return null
  return era === 'bc' ? -Math.abs(year) : Math.abs(year)
}

/** 绝对年 → 纪元 + 年份（元年年份为 null，输入框清空）。 */
export function eraYearFromAbsolute(absoluteYear: number): {
  era: Exclude<AgeEra, ''>
  year: number | null
} {
  if (absoluteYear === 0) return { era: 'zero', year: null }
  if (absoluteYear < 0) return { era: 'bc', year: -absoluteYear }
  return { era: 'ad', year: absoluteYear }
}

/** 绝对年 → 「纪前 N 年 / 元年 / 纪后 N 年」（文案 key 复用 `plot` ns）。 */
export function formatAnchorYear(absoluteYear: number, t: TFunction<'plot'>): string {
  return plotYearLabel(
    absoluteYear,
    {
      bc: t('timeEra.bc'),
      zero: t('timeEra.zero'),
      ad: t('timeEra.ad'),
      yearUnit: t('timeYearUnit')
    },
    ''
  )
}

/** 由锚点反推出生年（绝对年；可为负）。 */
export function birthYearFromAnchor(anchor: CharacterAgeAnchor): number {
  return anchor.anchorYear - anchor.age
}

/** 推算某绝对年时的年龄（负数 = 尚未出生）。 */
export function ageAtYear(anchor: CharacterAgeAnchor, year: number): number {
  return anchor.age + (year - anchor.anchorYear)
}

/** 整数文本 → 整数；空白 / 非整数返回 null（`type="number"` 允许中途为空）。 */
export function parseIntegerText(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) && Number.isInteger(value) ? value : null
}

/** 两组锚点是否等价（按 timelineId 对齐，忽略数组顺序）。 */
export function characterAgesEqual(
  a: readonly CharacterAgeAnchor[],
  b: readonly CharacterAgeAnchor[]
): boolean {
  if (a.length !== b.length) return false
  const byTimeline = new Map(a.map((anchor) => [anchor.timelineId, anchor]))
  return b.every((anchor) => {
    const peer = byTimeline.get(anchor.timelineId)
    return peer !== undefined && peer.anchorYear === anchor.anchorYear && peer.age === anchor.age
  })
}

/** 按 timelineId 稳定排序（落库 / 比对前的规范化副本）。 */
export function sortCharacterAges(anchors: readonly CharacterAgeAnchor[]): CharacterAgeAnchor[] {
  return anchors.slice().sort((left, right) => left.timelineId.localeCompare(right.timelineId))
}

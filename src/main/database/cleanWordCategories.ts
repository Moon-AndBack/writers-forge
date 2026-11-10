/**
 * 违禁词类别**单一真源**（9 类）：类型、CHECK 片段、旧库值映射都从这里取。
 *
 * 使用方：
 * - `schema/cleanWords.ts`：建表 CHECK 用 `CLEAN_WORD_CATEGORY_CHECK` 拼接，
 *   表重建迁移用 `toCleanWordCategory` 做旧值 → 新值映射；
 * - `cleanWords.ts`：领域类型 / 合法清单 re-export（IPC 白名单随之自动跟随）。
 *
 * 渲染层 `components/dialogs/cleanWordsMeta.ts` 因不能 import 主进程模块，仍保留
 * 一份镜像；新增 / 调整类别时两处须同步（渲染层 UI 批次负责文案与下拉）。
 */

/** 合法类别（顺序即 UI 下拉展示顺序，也是 CHECK 的枚举顺序）。 */
export const CLEAN_WORD_CATEGORIES = [
  'sexual',
  'minorSexual',
  'gambling',
  'drug',
  'fraud',
  'violence',
  'weapon',
  'minor',
  'other'
] as const

/** 违禁词类别（由 `CLEAN_WORD_CATEGORIES` 推导，避免与 CHECK 漂移）。 */
export type CleanWordCategory = (typeof CLEAN_WORD_CATEGORIES)[number]

/** SQL `CHECK (category IN (...))` 的枚举片段（逐字拼接，勿手写第二份）。 */
export const CLEAN_WORD_CATEGORY_CHECK = CLEAN_WORD_CATEGORIES.map(
  (category) => `'${category}'`
).join(', ')

/**
 * 旧类别 → 新类别。
 *
 * - `sexual` / `violence` 原样保留；
 * - `political`（用户词 + 内置词）/ `profanity`（用户词 + 内置词）/ `ads`（内置词）
 *   统一并入 `other`，**用户词条与字段全部保留**；
 * - `ads` 内置词后续由种子批次重新归类到 `sexual` / `gambling` / `fraud`。
 */
const LEGACY_CLEAN_WORD_CATEGORY_MAP: Readonly<Record<string, CleanWordCategory>> = {
  sexual: 'sexual',
  violence: 'violence',
  political: 'other',
  profanity: 'other',
  ads: 'other'
}

/**
 * 任意字符串 → 合法类别：
 * - 已是新类别（含 `minorSexual` 等）原样返回；
 * - 旧类别按 `LEGACY_CLEAN_WORD_CATEGORY_MAP` 映射；
 * - 未知值（绕过 CHECK 的脏数据 / 手工改库）回退 `other`。
 */
export function toCleanWordCategory(value: string): CleanWordCategory {
  if ((CLEAN_WORD_CATEGORIES as readonly string[]).includes(value)) {
    return value as CleanWordCategory
  }
  return LEGACY_CLEAN_WORD_CATEGORY_MAP[value] ?? 'other'
}

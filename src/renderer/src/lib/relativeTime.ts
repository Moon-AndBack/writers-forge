/**
 * 相对时间展示（领域无关纯函数）。
 *
 * 原实现位于 `pages/writer/chapters/chapterTree.ts`；因章节页与大纲页**共用同一口径**
 * （§9 通用逻辑上提共享，避免「大纲 → 章节」跨域依赖），此处上提至 `lib/`。
 * `chapterTree.ts` 保留同名 re-export，既有导入路径零破坏。
 *
 * 属 i18n **二期边界**（AGENTS §10）：输出中文原文（「刚刚 / N 分钟前 / …」），
 * 不纳入 i18n 资源。
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * 相对时间：把后端 `updatedAt`（SQLite UTC 文本，形如 `YYYY-MM-DD HH:MM:SS[.SSS]`）
 * 格式化为「刚刚 / N 分钟前 / N 小时前 / N 天前 / YYYY-MM-DD」。非法输入回退空串。
 * （中文原文，属 i18n 二期边界。）
 */
export function formatRelativeTime(value: string | null, now: number = Date.now()): string {
  if (!value) return ''
  // SQLite 时间为 UTC 无时区标记，补 'T' 与 'Z' 按 UTC 解析，避免被当本地时间。
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const time = Date.parse(normalized)
  if (Number.isNaN(time)) return ''

  const diff = now - time
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / DAY)} 小时前`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return normalized.slice(0, 10)
}

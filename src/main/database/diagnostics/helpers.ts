import type { DiagnosticsIssue, DiagnosticsIssueCode } from './types'

/**
 * 自检内部小工具（结果构造 / 标识符与列表格式化）。
 *
 * 约定：**不产出用户可见文案**——`items` 只承载语言中立的原始标识
 * （表名 / 索引名 / 行 id 等），多个标识以 `', '` 连接、超出上限以 `…` 截断；
 * 句子结构由渲染层 i18n 模板决定。
 */

/** 单个问题最多列出的标识数（其余以 `…` 省略，仅保留 `count` 总量）。 */
export const MAX_LISTED_ITEMS = 5

/** 单条问题的标识连接（超出 {@link MAX_LISTED_ITEMS} 时截断并追加 `…`）。 */
export function formatItems(items: readonly (string | number)[]): string {
  if (items.length <= MAX_LISTED_ITEMS) return items.join(', ')
  return `${items.slice(0, MAX_LISTED_ITEMS).join(', ')}, …`
}

/** 构造一条问题（唯一入口，保证 `params` 形状统一为 `{ count, items }` + 可选补充项）。 */
export function createIssue(
  code: DiagnosticsIssueCode,
  params: Record<string, string | number> = {}
): DiagnosticsIssue {
  return { code, params }
}

/**
 * `db`（卷 id / 章 id 等）可读标识：有非空标题时附于括号中，便于用户在界面里对照。
 * 名称本身是用户数据（不译），故直接嵌入。
 */
export function labeledId(id: string | number, label: string): string {
  return label === '' ? String(id) : `${id} (${label})`
}

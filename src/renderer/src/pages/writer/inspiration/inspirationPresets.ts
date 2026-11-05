/**
 * 灵感内置预置标签（分类 = 标签）。
 *
 * ⚠️ 标签是**持久化数据字符串**（写入 `inspirations.tags`），不是界面文案：
 * 切换界面语言时不会变成不同字符串，故**不进入 i18n 资源**，也不得翻译。
 * 预置只用于筛选 / 编辑时的快捷选项，与用户自定义标签同等存储、可自由删除。
 */
export const PRESET_INSPIRATION_TAGS = ['点子', '场景', '台词', '人物', '设定', '待办'] as const

/**
 * 合并预置标签与已使用标签：预置按固定顺序在前，追加「已使用但不在预置里」的标签
 * （保持传入顺序，即 `inspiration.tags` 的排序），按字符串去重。
 */
export function mergeInspirationTags(used: readonly string[]): string[] {
  const merged: string[] = [...PRESET_INSPIRATION_TAGS]
  const seen = new Set<string>(merged)
  for (const tag of used) {
    if (tag === '' || seen.has(tag)) continue
    seen.add(tag)
    merged.push(tag)
  }
  return merged
}

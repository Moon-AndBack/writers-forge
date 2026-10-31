/**
 * 键值行（字段名 + 字段值）的**草稿 / 入库口径**转换。
 *
 * 使用方：设定档案自定义子类的自由字段（`world_custom`，右栏手动保存）。
 *
 * 都是「行数组 + 空键丢弃 + 先出现者去重」的同一口径，故收敛于此，
 * 供编辑器（草稿）与保存补丁（入库比对）共用，禁止各写一份（§9）。
 */

/** 草稿行：字段名 / 字段值（可含尚未填写的空键行）。 */
export interface KeyValueRow {
  key: string
  value: string
}

/** 已保存行（读取时已按 `sortOrder` 排序）。 */
export interface KeyValueField {
  key: string
  value: string
  sortOrder: number
}

/** 写入用的键值行入参：`sortOrder` 缺省时由数据层按数组下标补齐。 */
export interface KeyValueFieldInput {
  key: string
  value: string
  sortOrder?: number
}

/** 已保存行 → 草稿行（丢弃排序号，编辑只需键值）。 */
export function toKeyValueRows(fields: readonly { key: string; value: string }[]): KeyValueRow[] {
  return fields.map((field) => ({ key: field.key, value: field.value }))
}

/** 草稿行 → 提交入参：去空白、丢弃空键、去重（先出现者优先）。 */
export function keyValueInputs(rows: readonly KeyValueRow[]): KeyValueFieldInput[] {
  const seen = new Set<string>()
  const result: KeyValueFieldInput[] = []
  for (const row of rows) {
    const key = row.key.trim()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    result.push({ key, value: row.value })
  }
  return result
}

/** 与已保存行逐项相等（键 + 值 + 顺序）；相等则跳过写入，避免无意义 revision 自增。 */
export function keyValuesEqual(
  inputs: readonly KeyValueFieldInput[],
  fields: readonly { key: string; value: string }[]
): boolean {
  return (
    inputs.length === fields.length &&
    inputs.every((input, index) => {
      const saved = fields[index]
      return input.key === saved.key && input.value === saved.value
    })
  )
}

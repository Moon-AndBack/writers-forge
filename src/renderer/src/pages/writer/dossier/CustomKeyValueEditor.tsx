import { useTranslation } from 'react-i18next'
import { Button, Input } from '../../../components/ui'
import { CUSTOM_FIELD_LIMITS } from './dossierTree'
import type { KeyValueRow } from './keyValueRows'

/**
 * 通用**键值字段编辑器**（第 5 批引入，第 7 批参数化复用，批 B 改受控）。
 *
 * 使用方：用户自定义子类的自由字段（`world_custom`，右栏手动保存草稿）。
 *
 * 结构为键 / 值 / 序，经 `labels` + `idPrefix` + `compact` 表达差异
 * （§9 通用组件优先，禁止复制平行实现）。
 *
 * 交互口径：
 * - 每行 = 字段名 + 字段值 + 删除按钮；底部「添加」追加一个空行；
 * - **受控**：行数据由调用方持有，任何编辑 / 增删都经 `onChange` 回传（本组件不写库）；
 * - `onCommit`：可选「提交时点」回调（失焦 / 删除行后触发），自动保存使用方据此落库；
 *   手动保存使用方不传，提交时点由外部保存按钮决定；
 * - 空白字段名不落库（视为未填写的草稿行），重复字段名按**先出现者**保留
 *   （主进程对重复键直接拒绝，此处提前收敛，避免保存被拒后静默回滚）；
 * - 行数与长度上限取自共享常量 `CUSTOM_FIELD_LIMITS`（与主进程校验同源）。
 */

/** 可覆写的文案（缺省取 `dossier` ns 的自定义字段文案）。 */
export interface KeyValueEditorLabels {
  title: string
  hint: string
  empty: string
  key: string
  keyPlaceholder: string
  value: string
  valuePlaceholder: string
  add: string
  remove: string
}

export interface CustomKeyValueEditorProps {
  /** 归属 id（实体 id 或关系 id；用于生成输入框 id）。 */
  ownerId: number
  /** 当前行（受控；可含尚未填写的空键行）。 */
  rows: KeyValueRow[]
  /** 行变更（每次编辑 / 增删整体回传）。 */
  onChange: (rows: KeyValueRow[]) => void
  /** 提交时点（失焦 / 删除行后）；自动保存场景传，手动保存场景不传。 */
  onCommit?: (rows: KeyValueRow[]) => void
  /** 输入框 id 前缀（默认实体自定义字段口径）。 */
  idPrefix?: string
  /** 文案覆写（缺省 = 自定义字段文案）。 */
  labels?: Partial<KeyValueEditorLabels>
  /** 紧凑排版（嵌在关系行内时用，不渲染区块外边距）。 */
  compact?: boolean
}

export default function CustomKeyValueEditor({
  ownerId,
  rows,
  onChange,
  onCommit,
  idPrefix = 'entity-field-custom',
  labels,
  compact = false
}: CustomKeyValueEditorProps) {
  const { t } = useTranslation('dossier')
  const canAdd = rows.length < CUSTOM_FIELD_LIMITS.maxEntries

  const text: KeyValueEditorLabels = {
    title: labels?.title ?? t('detail.customFields.title'),
    hint: labels?.hint ?? t('detail.customFields.hint'),
    empty: labels?.empty ?? t('detail.customFields.empty'),
    key: labels?.key ?? t('detail.customFields.key'),
    keyPlaceholder: labels?.keyPlaceholder ?? t('detail.customFields.keyPlaceholder'),
    value: labels?.value ?? t('detail.customFields.value'),
    valuePlaceholder: labels?.valuePlaceholder ?? t('detail.customFields.valuePlaceholder'),
    add: labels?.add ?? t('detail.customFields.add'),
    remove: labels?.remove ?? t('detail.customFields.remove')
  }

  const updateRow = (index: number, patch: Partial<KeyValueRow>): void => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addRow = (): void => {
    if (!canAdd) return
    onChange([...rows, { key: '', value: '' }])
  }

  const removeRow = (index: number): void => {
    const next = rows.filter((_, i) => i !== index)
    onChange(next)
    onCommit?.(next)
  }

  return (
    <div className={compact ? 'dossier-kv-embed' : 'dossier-detail__section'}>
      <div className="dossier-kv-head">
        <span className="dossier-detail__label">{text.title}</span>
        <span className="dossier-kv-hint">{text.hint}</span>
      </div>

      {rows.length === 0 ? (
        <div className="dossier-detail__empty">{text.empty}</div>
      ) : (
        <ul className="dossier-kv-list">
          {rows.map((row, index) => {
            const keyId = `${idPrefix}-${ownerId}-${index}-key`
            const valueId = `${idPrefix}-${ownerId}-${index}-value`
            return (
              <li className="dossier-kv-item" key={index}>
                <Input
                  id={keyId}
                  className="dossier-kv-key"
                  value={row.key}
                  maxLength={CUSTOM_FIELD_LIMITS.keyMaxLength}
                  placeholder={text.keyPlaceholder}
                  aria-label={text.key}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => updateRow(index, { key: event.target.value })}
                  onBlur={() => onCommit?.(rows)}
                />
                <Input
                  id={valueId}
                  className="dossier-kv-value"
                  value={row.value}
                  maxLength={CUSTOM_FIELD_LIMITS.valueMaxLength}
                  placeholder={text.valuePlaceholder}
                  aria-label={text.value}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => updateRow(index, { value: event.target.value })}
                  onBlur={() => onCommit?.(rows)}
                />
                <button
                  type="button"
                  className="dossier-rel-remove"
                  aria-label={text.remove}
                  title={text.remove}
                  onClick={() => removeRow(index)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="dossier-kv-add">
        <Button variant="secondary" size="sm" onClick={addRow} disabled={!canAdd}>
          {text.add}
        </Button>
      </div>
    </div>
  )
}

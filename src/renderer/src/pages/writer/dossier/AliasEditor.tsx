import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Tag } from '../../../components/ui'
import '../../../styles/components/form-extras.css'

export interface AliasEditorProps {
  /** 当前别名（受控）。 */
  value: string[]
  /** 别名变化回调（增删后整体回写，调用方走既有 `onUpdate(id, { aliases })`）。 */
  onChange: (value: string[]) => void
  /** 输入框占位文案。 */
  placeholder?: string
  /** 添加按钮文案（`t('detail.addAlias')` / `t('editDialog.addAlias')`）。 */
  addLabel: string
  /** 输入框无障碍标签。 */
  inputAriaLabel: string
  /** 空列表展示文案（复用 `detail.emptyValue`）。 */
  emptyText: string
  /** 输入框 id，便于与 FormField 的 htmlFor 关联。 */
  id?: string
}

/**
 * 别名编辑器（设定档案两处别名入口共用，§9 通用组件优先）：
 * 上方输入框 + 添加按钮，下方列表展示已有别名（`Tag` + × 删除）。
 * 回车或点击添加；空 / 重复拒绝；添加后清空输入框。
 */
export default function AliasEditor({
  value,
  onChange,
  placeholder,
  addLabel,
  inputAriaLabel,
  emptyText,
  id
}: AliasEditorProps) {
  const { t } = useTranslation('common')
  const [draft, setDraft] = useState('')

  const commit = (): void => {
    const text = draft.trim()
    if (text === '') return
    if (value.includes(text)) {
      setDraft('')
      return
    }
    onChange([...value, text])
    setDraft('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
  }

  const removeAt = (index: number): void => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="wf-alias">
      <div className="wf-alias__add">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          aria-label={inputAriaLabel}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button variant="secondary" onClick={commit} disabled={draft.trim() === ''}>
          {addLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="wf-alias__empty">{emptyText}</p>
      ) : (
        <ul className="wf-alias__list">
          {value.map((alias, index) => (
            <li key={`${alias}-${index}`}>
              <Tag
                tone="neutral"
                onClose={() => removeAt(index)}
                closeLabel={t('removeTag', { tag: alias })}
              >
                {alias}
              </Tag>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

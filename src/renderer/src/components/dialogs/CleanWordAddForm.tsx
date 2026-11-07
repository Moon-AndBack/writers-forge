import { useTranslation } from 'react-i18next'
import { Button, Input, Select } from '../ui'
import type { SelectOption } from '../ui'
import type { CleanWordCategory } from '../../../../preload/types/cleanWords'
import { MAX_WORD_CHARS } from './cleanWordsMeta'

export interface CleanWordAddFormProps {
  /** 待添加词条（受控）。 */
  value: string
  /** 类别（受控，默认 `other`）。 */
  category: CleanWordCategory
  /** 类别下拉选项（六类，不含「全部」）。 */
  categoryOptions: SelectOption[]
  /** 提交中：按钮进入 loading 并禁用。 */
  submitting: boolean
  onValueChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onSubmit: () => void
}

/**
 * 违禁词单条添加行（弹窗第 3 行）：类别 + 内容 + 添加。
 *
 * 校验口径与正文右键「加入违禁词库」一致（`SelectionContextMenu.beginAddWord`）：
 * trim 非空、不含换行、2–`MAX_WORD_CHARS` 字。不合法时按钮禁用，并在行下给出行内提示
 * ——IPC 对任一条非法入参会整批返回 `null`，且单字词不会被正文标注，前置拦截可避免
 * 「加了却看不到效果」。
 *
 * 三件控件的高度由 `--cw-control-h` 在 `clean-words.css` 内显式对齐（见 `.cw-add__row`）。
 */
export function CleanWordAddForm({
  value,
  category,
  categoryOptions,
  submitting,
  onValueChange,
  onCategoryChange,
  onSubmit
}: CleanWordAddFormProps) {
  const { t } = useTranslation('chapters')
  const trimmed = value.trim()
  const multiline = /[\r\n]/.test(value)
  const tooShort = trimmed.length === 1
  const tooLong = trimmed.length > MAX_WORD_CHARS
  const invalid = trimmed === '' || multiline || tooShort || tooLong

  const hint = multiline
    ? t('cleanWords.addWordMultiline')
    : tooLong
      ? t('cleanWords.addWordTooLong', { max: MAX_WORD_CHARS })
      : tooShort
        ? t('cleanWords.addWordTooShort')
        : null

  return (
    <form
      className="cw-add"
      onSubmit={(event) => {
        // 回车与点击「添加」同一条路径；非法 / 提交中一律不发请求。
        event.preventDefault()
        if (invalid || submitting) return
        onSubmit()
      }}
    >
      <div className="cw-add__row">
        <div className="cw-add__category">
          <Select
            size="sm"
            value={category}
            options={categoryOptions}
            ariaLabel={t('cleanWords.addCategoryAria')}
            onChange={onCategoryChange}
          />
        </div>
        <Input
          size="sm"
          className="cw-add__input"
          value={value}
          aria-label={t('cleanWords.addWordAria')}
          placeholder={t('cleanWords.addWordPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <Button size="sm" variant="primary" type="submit" loading={submitting} disabled={invalid}>
          {t('cleanWords.addConfirm')}
        </Button>
      </div>
      {hint !== null ? <p className="cw-add__hint">{hint}</p> : null}
    </form>
  )
}

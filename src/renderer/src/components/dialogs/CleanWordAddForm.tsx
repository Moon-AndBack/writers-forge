import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select } from '../ui'
import type { SelectOption } from '../ui'
import type { CleanWordCategory } from '../../../../preload/types/cleanWords'
import { MAX_WORD_CHARS, parseCleanWordInput } from './cleanWordsMeta'

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
 * 违禁词添加行（弹窗第 3 行）：类别 + 内容 + 添加。
 *
 * 内容支持中文逗号（，）或英文逗号（,）分隔批量添加；解析与校验集中在
 * `parseCleanWordInput` —— trim、丢弃空段、保序去重、不含换行、2–`MAX_WORD_CHARS` 字。
 * 任一词条非法时按钮禁用，并在行下给出行内提示：IPC 对任一条非法入参会整批
 * 返回 `null`，且单字词不会被正文标注，前置拦截可避免「加了却看不到效果」。
 *
 * 三件控件均为 sm 档（32px），由组件统一尺寸保证同行等高（见 `.cw-add__row`）。
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
  const descId = useId()
  const hintId = useId()
  const { words, issue } = parseCleanWordInput(value)
  const invalid = words.length === 0 || issue !== null

  let hint: string | null = null
  if (issue !== null) {
    if (issue.kind === 'multiline') {
      hint = t('cleanWords.addWordMultiline')
    } else if (issue.kind === 'tooShort') {
      hint =
        words.length <= 1
          ? t('cleanWords.addWordTooShort')
          : t('cleanWords.addTokenTooShort', { index: issue.index })
    } else {
      hint =
        words.length <= 1
          ? t('cleanWords.addWordTooLong', { max: MAX_WORD_CHARS })
          : t('cleanWords.addTokenTooLong', { index: issue.index, max: MAX_WORD_CHARS })
    }
  }

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
          aria-describedby={hint !== null ? `${descId} ${hintId}` : descId}
          placeholder={t('cleanWords.addWordPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <Button size="sm" variant="primary" type="submit" loading={submitting} disabled={invalid}>
          {t('cleanWords.addConfirm')}
        </Button>
      </div>
      <p id={descId} className="cw-add__desc">
        {t('cleanWords.addWordDesc')}
      </p>
      {hint !== null ? (
        <p id={hintId} className="cw-add__hint">
          {hint}
        </p>
      ) : null}
    </form>
  )
}

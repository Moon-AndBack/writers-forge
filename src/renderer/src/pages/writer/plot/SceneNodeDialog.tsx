import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input, Modal, Select } from '../../../components/ui'

/** 节点弹窗提交值：时间三字段（纪元 / 年份 / 描述）+ 标题。 */
export interface SceneNodeDialogInput {
  timeEra: string
  timeYear: number | null
  timeDesc: string
  title: string
}

export interface SceneNodeDialogProps {
  /** 弹窗标题（新建 / 编辑由调用方传入）。 */
  title: string
  /** 编辑初始值（缺省 = 新建模式：空时间 + 空标题）。 */
  initial?: SceneNodeDialogInput
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 提交（新建 → 创建并选中；编辑 → 仅落变更字段）。 */
  onSubmit: (input: SceneNodeDialogInput) => void
}

/**
 * 解析年份输入：空串 → null（清空）；整数文本 → 数值；其余 → undefined（非法，落库侧按 null 兜底）。
 */
function parseYearInput(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^-?\d+$/.test(trimmed)) return undefined
  return Number.parseInt(trimmed, 10)
}

/**
 * 剧情节点「新建 / 编辑」共用弹窗（仿 `PlotLineDialog`：Modal sm + 通用取消 / 确定 footer）。
 * 字段：时间（纪元 Select + 年份数字框，元年禁用并清空）+ 时间描述 + 标题。
 * Enter 提交，Esc / 遮罩关闭（Modal 内建）；弹窗本体经 Modal portal 挂 body。
 */
export default function SceneNodeDialog({
  title,
  initial,
  onClose,
  onSubmit
}: SceneNodeDialogProps) {
  const { t } = useTranslation('plot')
  const { t: tCommon } = useTranslation('common')
  const [timeEra, setTimeEra] = useState(initial?.timeEra ?? '')
  const [timeYearText, setTimeYearText] = useState(
    initial?.timeYear === null || initial?.timeYear === undefined ? '' : String(initial.timeYear)
  )
  const [timeDesc, setTimeDesc] = useState(initial?.timeDesc ?? '')
  const [titleText, setTitleText] = useState(initial?.title ?? '')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回标题输入框（与 PlotLineDialog 一致）。
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const submit = (): void => {
    const parsed = parseYearInput(timeYearText)
    onSubmit({
      timeEra,
      timeYear: parsed === undefined ? null : parsed,
      timeDesc,
      title: titleText
    })
    onClose()
  }

  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      ariaLabel={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {tCommon('confirm')}
          </Button>
        </>
      }
    >
      <div className="plot-node-dialog">
        <FormField label={t('editor.fieldTime')}>
          <div className="plot-time-row">
            <Select
              value={timeEra}
              onChange={(value) => {
                setTimeEra(value)
                // 元年无年份：清空年份框（与右栏编辑器同口径）。
                if (value === 'zero') setTimeYearText('')
              }}
              ariaLabel={t('editor.fieldTimeEra')}
              options={[
                { value: '', label: t('editor.eraUnset') },
                { value: 'bc', label: t('timeEra.bc') },
                { value: 'zero', label: t('timeEra.zero') },
                { value: 'ad', label: t('timeEra.ad') }
              ]}
            />
            <Input
              value={timeYearText}
              type="number"
              disabled={timeEra === 'zero'}
              aria-label={t('editor.fieldTimeYear')}
              placeholder={t('editor.timeYearPlaceholder')}
              spellCheck={false}
              onChange={(event) => setTimeYearText(event.target.value)}
              onKeyDown={submitOnEnter}
            />
          </div>
        </FormField>

        <FormField label={t('editor.fieldTimeDesc')} htmlFor="plot-node-time-desc">
          <Input
            id="plot-node-time-desc"
            value={timeDesc}
            placeholder={t('editor.timePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTimeDesc(event.target.value)}
            onKeyDown={submitOnEnter}
          />
        </FormField>

        <FormField label={t('editor.fieldTitle')} htmlFor="plot-node-title">
          <Input
            ref={inputRef}
            id="plot-node-title"
            value={titleText}
            placeholder={t('editor.titlePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTitleText(event.target.value)}
            onKeyDown={submitOnEnter}
          />
        </FormField>
      </div>
    </Modal>
  )
}

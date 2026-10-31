import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input, Modal, Select } from '../../../components/ui'
import {
  DEFAULT_PLOT_LINE_COLOR,
  DEFAULT_PLOT_LINE_TYPE,
  PLOT_LINE_COLORS,
  PLOT_LINE_TYPES,
  normalizePlotLineColor,
  normalizePlotLineType,
  type PlotLineType
} from './plotTree'

export interface PlotLineDialogInput {
  /** 线名（可空 → 后端归「新剧情线」）。 */
  name: string
  /** 线类型 key（8 项，默认 `'main'`）。 */
  lineType: string
  /** 线颜色 key（16 色，默认首色）。 */
  lineColor: string
}

export interface PlotLineDialogProps {
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 提交新建（`name` 可空，落库后由调用方选中新线）。 */
  onSubmit: (input: PlotLineDialogInput) => void
  /** 编辑初始值（缺省 = 新建模式：空名 + 默认类型 / 首色）。 */
  initial?: PlotLineDialogInput
  /** 弹窗标题（缺省 `createDialog.title`；编辑时调用方传入 `editDialog.title`）。 */
  title?: string
  /** 所属时间线名称（只读展示；新建剧情线继承该时间线）。 */
  timelineName?: string
}

/**
 * 剧情线「新建 / 编辑」共用弹窗（仿 `OutlineCreateDialog`：Modal sm + 通用取消 / 确定 footer）。
 * 三字段：名称 Input（新建可空；编辑回显原名）+ 类型 Select（8 项，默认主线）
 * + 颜色单选（8 列两行 16 色，默认首色；选中 ring 用自身色，无位移 / 缩放）。
 * Enter 提交，Esc / 遮罩关闭（Modal 内建）；弹窗本体经 Modal portal 挂 body。
 */
export default function PlotLineDialog({
  onClose,
  onSubmit,
  initial,
  title,
  timelineName
}: PlotLineDialogProps) {
  const { t } = useTranslation('plot')
  const { t: tCommon } = useTranslation('common')
  const { t: tTimeline } = useTranslation('timeline')
  // 动态 key 取用：类型 / 颜色 key 为运行时拼接（`lineTypes.${type}`），typed-t 的
  // 字面量联合无法直接表达，经此 helper 收窄（静态 key 仍走 `t` 保持校验）。
  const td = t as unknown as (key: `lineTypes.${PlotLineType}` | `lineColors.${string}`) => string
  const [name, setName] = useState(initial?.name ?? '')
  const [lineType, setLineType] = useState<PlotLineType>(
    initial ? normalizePlotLineType(initial.lineType) : DEFAULT_PLOT_LINE_TYPE
  )
  const [lineColor, setLineColor] = useState<string>(
    initial ? normalizePlotLineColor(initial.lineColor) : DEFAULT_PLOT_LINE_COLOR
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  // 标题缺省新建文案；编辑时调用方传入 `editDialog.title`（标签 / 占位复用 `createDialog`）。
  const dialogTitle = title ?? t('createDialog.title')

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回输入框（与 OutlineCreateDialog 一致）。
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const submit = (): void => {
    onSubmit({ name: name.trim(), lineType, lineColor })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={dialogTitle}
      size="sm"
      ariaLabel={dialogTitle}
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
      <div className="plot-line-dialog">
        <FormField label={t('createDialog.timelineLabel')}>
          <Input
            value={timelineName && timelineName.trim() !== '' ? timelineName : tTimeline('defaultName')}
            readOnly
            aria-readonly="true"
          />
        </FormField>
        <FormField label={t('createDialog.nameLabel')} htmlFor="plot-line-name">
          <Input
            ref={inputRef}
            id="plot-line-name"
            value={name}
            placeholder={t('createDialog.namePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
        </FormField>
        <FormField label={t('createDialog.typeLabel')}>
          <Select
            ariaLabel={t('createDialog.typeLabel')}
            value={lineType}
            onChange={(value) => setLineType(value as PlotLineType)}
            options={PLOT_LINE_TYPES.map((type) => ({
              value: type,
              label: td(`lineTypes.${type}`)
            }))}
          />
        </FormField>
        <FormField label={t('createDialog.colorLabel')}>
          <div
            className="plot-color-grid"
            role="radiogroup"
            aria-label={t('createDialog.colorLabel')}
          >
            {PLOT_LINE_COLORS.map((option) => {
              const active = option.key === lineColor
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={td(`lineColors.${option.key}`)}
                  aria-label={td(`lineColors.${option.key}`)}
                  className={`plot-color-option${active ? ' is-active' : ''}`}
                  style={{ backgroundColor: option.value, color: option.value }}
                  onClick={() => setLineColor(option.key)}
                />
              )
            })}
          </div>
        </FormField>
      </div>
    </Modal>
  )
}

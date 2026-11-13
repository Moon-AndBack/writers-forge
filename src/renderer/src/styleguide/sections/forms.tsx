import { useState } from 'react'
import {
  ChipInput,
  ColorSwatchPicker,
  Combobox,
  FormField,
  Input,
  SearchInput,
  Select,
  Switch,
  Textarea,
  type ComboboxOption,
  type SelectOption
} from '@renderer/components/ui'
import { Demo, Sample } from '../Section'

const SELECT_OPTIONS: SelectOption[] = [
  { value: 'fantasy', label: '奇幻' },
  { value: 'scifi', label: '科幻' },
  { value: 'mystery', label: '悬疑' },
  { value: 'romance', label: '言情' },
  { value: 'historical', label: '历史' }
]

const COMBO_OPTIONS: ComboboxOption[] = [
  { value: 'lin', label: '林默' },
  { value: 'su', label: '苏晚' },
  { value: 'chen', label: '陈序' },
  { value: 'gu', label: '顾南' },
  { value: 'ye', label: '叶知秋' }
]

const SWITCH_SIZES = ['sm', 'md', 'lg'] as const

/** 表单控件分区：Input / Textarea / Select / Combobox / Switch / SearchInput / ChipInput / FormField / ColorSwatchPicker。 */
export function FormsSection() {
  const [selectValue, setSelectValue] = useState<string | undefined>('fantasy')
  const [comboValue, setComboValue] = useState('lin')
  const [search, setSearch] = useState('关键词')
  const [chips, setChips] = useState(['奇幻', '长篇'])
  const [swatchSm, setSwatchSm] = useState('brand')
  const [swatchMd, setSwatchMd] = useState('ok')
  const [swatchLg, setSwatchLg] = useState('brand-2')

  return (
    <>
      <Demo
        name="Input · default / hover / focus / invalid / disabled / readonly"
        note="hover 与 focus 直接操作输入框查看；错误态写 aria-invalid 并附加 is-invalid。"
        classes="wf-input / is-invalid"
      >
        <div className="sg-field-grid">
          <Sample label="default">
            <Input placeholder="请输入书名" />
          </Sample>
          <Sample label="with value">
            <Input defaultValue="长夜将明" />
          </Sample>
          <Sample label="focus（点击）">
            <Input placeholder="聚焦查看品牌环" />
          </Sample>
          <Sample label="invalid">
            <Input defaultValue="重复的书名" invalid />
          </Sample>
          <Sample label="disabled">
            <Input defaultValue="不可编辑" disabled />
          </Sample>
          <Sample label="readonly">
            <Input defaultValue="只读内容" readOnly />
          </Sample>
        </div>
      </Demo>

      <Demo
        name="Input · sm / md / lg"
        note="三档高度均为 36px。"
        classes="wf-input--sm / wf-input--lg"
      >
        <div className="sg-stack">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <Sample key={size} label={size}>
              <Input size={size} placeholder={`size ${size}`} />
            </Sample>
          ))}
        </div>
      </Demo>

      <Demo name="Textarea · sm / md / lg + invalid" classes="wf-textarea / is-invalid">
        <div className="sg-field-grid">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <Sample key={size} label={size}>
              <Textarea size={size} rows={3} placeholder={`size ${size}`} />
            </Sample>
          ))}
          <Sample label="invalid">
            <Textarea rows={3} defaultValue="内容重复" invalid />
          </Sample>
        </div>
      </Demo>

      <Demo
        name="Select · default / selected / disabled / invalid / 尺寸"
        note="点击触发器查看 open 面板（portal + fixed 定位）；API 为扁平选项，无 optgroup 分组。"
        classes="wf-select / wf-select__trigger / wf-select__panel"
      >
        <div className="sg-field-grid">
          <Sample label="placeholder">
            <Select ariaLabel="分类（未选）" options={SELECT_OPTIONS} placeholder="请选择分类" />
          </Sample>
          <Sample label="selected">
            <Select
              ariaLabel="分类"
              options={SELECT_OPTIONS}
              value={selectValue}
              onChange={setSelectValue}
            />
          </Sample>
          <Sample label="disabled">
            <Select ariaLabel="分类（禁用）" options={SELECT_OPTIONS} value="fantasy" disabled />
          </Sample>
          <Sample label="invalid">
            <Select ariaLabel="分类（错误）" options={SELECT_OPTIONS} invalid placeholder="必选" />
          </Sample>
          <Sample label="empty options">
            <Select ariaLabel="空选项" options={[]} emptyText="暂无候选" />
          </Sample>
          <Sample label="size sm">
            <Select ariaLabel="分类（sm）" size="sm" options={SELECT_OPTIONS} value="scifi" />
          </Sample>
        </div>
      </Demo>

      <Demo
        name="Combobox · 可输入过滤"
        note="聚焦展开全量，输入后按 label 包含匹配过滤；↑↓ / Enter / Esc 与 Select 同口径。"
        classes="wf-select wf-combobox / wf-select__trigger wf-combobox__input"
      >
        <div className="sg-field-grid">
          <Sample label="selected + filterable">
            <Combobox
              ariaLabel="角色"
              options={COMBO_OPTIONS}
              value={comboValue}
              onChange={setComboValue}
              placeholder="搜索角色"
            />
          </Sample>
          <Sample label="disabled">
            <Combobox ariaLabel="角色（禁用）" options={COMBO_OPTIONS} value="su" disabled />
          </Sample>
        </div>
      </Demo>

      <Demo
        name="Switch · sm / md / lg × on / off / disabled"
        note="第一列为尺寸；每行依次为 off、on、disabled。"
        classes="wf-switch / wf-switch--{size} / is-disabled"
      >
        <div className="sg-stack">
          {SWITCH_SIZES.map((size) => (
            <div key={size} className="sg-row">
              <code className="sg-code sg-switch__label">{size}</code>
              <Switch size={size} aria-label={`${size} off`} label="关闭" />
              <Switch size={size} aria-label={`${size} on`} label="开启" defaultChecked />
              <Switch size={size} aria-label={`${size} disabled`} label="禁用" disabled />
              <Switch
                size={size}
                aria-label={`${size} disabled on`}
                label="禁用已开"
                disabled
                defaultChecked
              />
            </div>
          ))}
        </div>
      </Demo>

      <Demo
        name="SearchInput · default / 有值 / disabled"
        note="有值时显示清除按钮；受控模式需提供 onClear。"
        classes="wf-search / wf-search__input / wf-search__clear"
      >
        <div className="sg-field-grid">
          <Sample label="default">
            <SearchInput placeholder="搜索章节" aria-label="搜索章节" />
          </Sample>
          <Sample label="有值（可清除）">
            <SearchInput
              aria-label="搜索关键词"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />
          </Sample>
          <Sample label="disabled">
            <SearchInput aria-label="搜索（禁用）" defaultValue="不可搜索" disabled />
          </Sample>
        </div>
      </Demo>

      <Demo
        name="ChipInput · 多标签 + 常用建议"
        note="回车 / 逗号新增，Backspace 删末项，× 删除；下方建议点击即加入。"
        classes="wf-chipinput / wf-chipinput__chip / wf-chipinput__suggestion"
      >
        <div className="sg-field-grid">
          <Sample label="多标签 + suggestions">
            <ChipInput
              value={chips}
              onChange={setChips}
              suggestions={['奇幻', '科幻', '悬疑', '言情', '历史']}
              placeholder="输入标签后回车"
            />
          </Sample>
          <Sample label="disabled">
            <ChipInput value={['只读']} onChange={() => undefined} disabled />
          </Sample>
        </div>
      </Demo>

      <Demo
        name="FormField · label + required + hint / error"
        classes="wf-field / wf-field__hint / wf-field__error"
      >
        <div className="sg-field-grid">
          <FormField label="书名" htmlFor="sg-field-title" required hint="用于书架与导出文件名">
            <Input id="sg-field-title" defaultValue="长夜将明" />
          </FormField>
          <FormField label="卷名" htmlFor="sg-field-volume" error="卷名不能为空">
            <Input id="sg-field-volume" invalid placeholder="请输入卷名" />
          </FormField>
        </div>
      </Demo>

      <Demo
        name="ColorSwatchPicker · sm / md / lg"
        note="内置色板全部由主题令牌派生；选中项双环高亮，方向键可切换（radiogroup）。"
        classes="wf-swatch / wf-swatch--{size} / wf-swatch__item"
      >
        <div className="sg-row">
          <Sample label="sm">
            <ColorSwatchPicker
              size="sm"
              value={swatchSm}
              onChange={setSwatchSm}
              aria-label="封面颜色（sm）"
            />
          </Sample>
          <Sample label="md">
            <ColorSwatchPicker
              value={swatchMd}
              onChange={setSwatchMd}
              aria-label="封面颜色（md）"
            />
          </Sample>
          <Sample label="lg">
            <ColorSwatchPicker
              size="lg"
              value={swatchLg}
              onChange={setSwatchLg}
              aria-label="封面颜色（lg）"
            />
          </Sample>
          <Sample label="disabled">
            <ColorSwatchPicker value="brand" disabled aria-label="封面颜色（禁用）" />
          </Sample>
        </div>
      </Demo>
    </>
  )
}

export default FormsSection

import { useState } from 'react'
import { Badge, Button, IconButton, Progress, Segmented, Tag } from '@renderer/components/ui'
import type { ButtonVariant, ProgressSize, ProgressTone, TagTone } from '@renderer/components/ui'
import { Demo, Sample } from '../Section'

const BUTTON_VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger']
const BUTTON_SIZES = ['sm', 'md', 'lg'] as const
const TAG_TONES: readonly TagTone[] = ['neutral', 'brand', 'ok', 'warn', 'danger']
const PROGRESS_TONES: readonly ProgressTone[] = ['brand', 'ok', 'warn', 'danger']
const PROGRESS_SIZES: readonly ProgressSize[] = ['sm', 'md', 'lg']

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  )
}

/** 按钮与操作分区：Button / IconButton / Segmented / Tag / Badge / Progress。 */
export function ButtonsSection() {
  const [segment, setSegment] = useState('chapters')
  const [segmentSm, setSegmentSm] = useState('all')
  const [segmentFill, setSegmentFill] = useState('list')
  const [tags, setTags] = useState(['奇幻', '长篇', '连载中'])

  return (
    <>
      <Demo
        name="Button · primary / secondary / ghost / danger"
        note="默认尺寸 md；hover / active / focus-visible 均可直接操作。"
        classes="wf-btn wf-btn--{variant}"
      >
        <div className="sg-row">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </div>
      </Demo>

      <Demo
        name="Button · sm / md / lg"
        note="三档高度同为 36px，只差内边距、字号与图标尺寸。"
        classes="wf-btn--sm / wf-btn--lg"
      >
        <div className="sg-row">
          {BUTTON_SIZES.map((size) => (
            <Button key={size} size={size} variant="secondary">
              size {size}
            </Button>
          ))}
        </div>
      </Demo>

      <Demo name="Button · 状态（default / disabled / loading）" classes="disabled / is-loading">
        <div className="sg-row">
          <Sample label="default">
            <Button variant="primary">保存</Button>
          </Sample>
          <Sample label="disabled">
            <Button variant="primary" disabled>
              保存
            </Button>
          </Sample>
          <Sample label="loading">
            <Button variant="primary" loading>
              保存中
            </Button>
          </Sample>
        </div>
      </Demo>

      <Demo
        name="Button · iconOnly"
        note="方形图标按钮：内容为单个 SVG，尺寸档控制图标大小。"
        classes="wf-btn--icon"
      >
        <div className="sg-row">
          {BUTTON_SIZES.map((size) => (
            <Sample key={size} label={size}>
              <Button variant="secondary" size={size} iconOnly aria-label={`添加（${size}）`}>
                <PlusIcon />
              </Button>
            </Sample>
          ))}
        </div>
      </Demo>

      <Demo
        name="IconButton · ghost / solid × default / danger × sm / md"
        note="必填 label 映射 aria-label，并作为自绘 tooltip 的默认文案；悬停 350ms 后出现。"
        classes="wf-iconbtn wf-iconbtn--{variant} wf-iconbtn--{tone}"
      >
        <div className="sg-iconbtn-grid">
          {(['ghost', 'solid'] as const).map((variant) =>
            (['default', 'danger'] as const).map((tone) =>
              (['sm', 'md'] as const).map((size) => (
                <Sample key={`${variant}-${tone}-${size}`} label={`${variant} / ${tone} / ${size}`}>
                  <IconButton
                    variant={variant}
                    tone={tone}
                    size={size}
                    label={`${variant} ${tone} ${size}`}
                  >
                    {tone === 'danger' ? <TrashIcon /> : <MoreIcon />}
                  </IconButton>
                </Sample>
              ))
            )
          )}
        </div>
      </Demo>

      <Demo
        name="Segmented · md / sm / fill（含 disabled 项）"
        note="互斥分段控件；`--fill` 让各段等分撑满容器。"
        classes="wf-seg / wf-seg--sm / wf-seg--fill"
      >
        <div className="sg-stack">
          <Sample label="md">
            <Segmented
              aria-label="章节视图"
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'chapters', label: '章节' },
                { value: 'outline', label: '大纲' },
                { value: 'notes', label: '笔记', disabled: true }
              ]}
            />
          </Sample>
          <Sample label="sm">
            <Segmented
              size="sm"
              aria-label="筛选"
              value={segmentSm}
              onChange={setSegmentSm}
              options={[
                { value: 'all', label: '全部' },
                { value: 'active', label: '进行中' },
                { value: 'done', label: '已完成' }
              ]}
            />
          </Sample>
          <Sample label="fill（等分）">
            <Segmented
              aria-label="视图切换"
              className="wf-seg--fill"
              value={segmentFill}
              onChange={setSegmentFill}
              options={[
                { value: 'list', label: '列表' },
                { value: 'grid', label: '网格' },
                { value: 'timeline', label: '时间线' }
              ]}
            />
          </Sample>
        </div>
      </Demo>

      <Demo
        name="Tag · neutral / brand / ok / warn / danger + close"
        note="点击末项 × 可从状态数组移除；closeLabel 缺省取 common.remove。"
        classes="wf-tag wf-tag--{tone} / wf-tag__close"
      >
        <div className="sg-row">
          {TAG_TONES.map((tone) => (
            <Tag key={tone} tone={tone}>
              {tone}
            </Tag>
          ))}
        </div>
        <div className="sg-row sg-row--top">
          {tags.map((tag) => (
            <Tag
              key={tag}
              tone="brand"
              onClose={() => setTags((items) => items.filter((item) => item !== tag))}
            >
              {tag}
            </Tag>
          ))}
          {tags.length === 0 ? <span className="sg-label">已全部关闭，刷新页面恢复</span> : null}
        </div>
      </Demo>

      <Demo name="Badge · 5 tone + dot / count" classes="wf-badge wf-badge--{tone}">
        <div className="sg-row">
          {TAG_TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
        <div className="sg-row">
          <Badge tone="ok" dot>
            已保存
          </Badge>
          <Badge tone="warn" dot>
            待同步
          </Badge>
          <Badge tone="brand" count={7} />
          <Badge tone="danger" count={128} max={99} />
        </div>
      </Demo>

      <Demo
        name="Progress · sm / md / lg × brand / ok / warn / danger"
        note="左侧为尺寸（3 / 4 / 6px 高），四列为 tone。"
        classes="wf-progress wf-progress--{size} / wf-progress__bar--{tone}"
      >
        <div className="sg-stack">
          {PROGRESS_SIZES.map((size) => (
            <div key={size} className="sg-progress-row">
              <code className="sg-code sg-progress-row__label">{size}</code>
              {PROGRESS_TONES.map((tone, index) => (
                <div key={tone} className="sg-progress-cell">
                  <Progress
                    size={size}
                    tone={tone}
                    value={35 + index * 18}
                    label={`${size} ${tone}`}
                  />
                  <span className="sg-label">{tone}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Demo>
    </>
  )
}

export default ButtonsSection

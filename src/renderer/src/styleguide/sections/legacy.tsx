import { Badge } from '@renderer/components/ui'
import { Demo } from '../Section'

function LegacyWarn() {
  return <Badge tone="danger">无 TSX 实现 · 请勿使用</Badge>
}

function CheckIcon() {
  return (
    <svg className="wf-checkbox__tick" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 8.5 6.2 11.7 13 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

/**
 * 死代码分区：这些类名只存在于 CSS，没有对应 TSX 组件。
 * 此处手写最小 HTML 复刻结构，仅用于观察；生产代码不得使用。
 */
export function LegacySection() {
  return (
    <>
      <Demo
        name="Checkbox · 仅 CSS"
        note={
          <>
            <LegacyWarn /> 结构：`wf-checkbox` + 原生 input + `wf-checkbox__box`（内含 tick）。
          </>
        }
        classes="wf-checkbox / wf-checkbox__input / wf-checkbox__box / wf-checkbox__tick"
      >
        <div className="sg-row">
          <label className="wf-checkbox">
            <input className="wf-checkbox__input" type="checkbox" defaultChecked />
            <span className="wf-checkbox__box">
              <CheckIcon />
            </span>
            <span className="wf-checkbox__label">已选中</span>
          </label>
          <label className="wf-checkbox">
            <input className="wf-checkbox__input" type="checkbox" />
            <span className="wf-checkbox__box">
              <CheckIcon />
            </span>
            <span className="wf-checkbox__label">未选中</span>
          </label>
          <label className="wf-checkbox is-disabled">
            <input className="wf-checkbox__input" type="checkbox" defaultChecked disabled />
            <span className="wf-checkbox__box">
              <CheckIcon />
            </span>
            <span className="wf-checkbox__label">禁用</span>
          </label>
          <label className="wf-checkbox wf-checkbox--sm">
            <input className="wf-checkbox__input" type="checkbox" defaultChecked />
            <span className="wf-checkbox__box">
              <CheckIcon />
            </span>
            <span className="wf-checkbox__label">sm 档</span>
          </label>
        </div>
      </Demo>

      <Demo
        name="Radio · 仅 CSS"
        note={
          <>
            <LegacyWarn /> 圆点内部由 `::after` 绘制；同名 input 组成一组。
          </>
        }
        classes="wf-radio / wf-radio__input / wf-radio__dot / wf-radio__label"
      >
        <div className="sg-row">
          <label className="wf-radio">
            <input className="wf-radio__input" type="radio" name="sg-legacy-radio" defaultChecked />
            <span className="wf-radio__dot" />
            <span className="wf-radio__label">选项 A</span>
          </label>
          <label className="wf-radio">
            <input className="wf-radio__input" type="radio" name="sg-legacy-radio" />
            <span className="wf-radio__dot" />
            <span className="wf-radio__label">选项 B</span>
          </label>
          <label className="wf-radio is-disabled">
            <input className="wf-radio__input" type="radio" name="sg-legacy-radio" disabled />
            <span className="wf-radio__dot" />
            <span className="wf-radio__label">禁用</span>
          </label>
          <label className="wf-radio wf-radio--lg">
            <input
              className="wf-radio__input"
              type="radio"
              name="sg-legacy-radio-lg"
              defaultChecked
            />
            <span className="wf-radio__dot" />
            <span className="wf-radio__label">lg 档</span>
          </label>
        </div>
      </Demo>

      <Demo
        name="Accordion · 仅 CSS"
        note={
          <>
            <LegacyWarn /> `is-open` 控制箭头旋转与 body 的 0fr → 1fr 高度过渡；此处为静态 HTML。
          </>
        }
        classes="wf-accordion / wf-accordion__item is-open / __head / __arrow / __body / __content"
      >
        <div className="wf-accordion">
          <div className="wf-accordion__item is-open">
            <button type="button" className="wf-accordion__head">
              <span className="wf-accordion__arrow">
                <ArrowIcon />
              </span>
              <span className="wf-accordion__title">第一卷 · 长夜</span>
            </button>
            <div className="wf-accordion__body">
              <div className="wf-accordion__body-inner">
                <div className="wf-accordion__content">3 个章节 · 展开态（is-open）</div>
              </div>
            </div>
          </div>
          <div className="wf-accordion__item">
            <button type="button" className="wf-accordion__head">
              <span className="wf-accordion__arrow">
                <ArrowIcon />
              </span>
              <span className="wf-accordion__title">第二卷 · 潮声</span>
            </button>
            <div className="wf-accordion__body">
              <div className="wf-accordion__body-inner">
                <div className="wf-accordion__content">收起态内容（高度 0fr）</div>
              </div>
            </div>
          </div>
          <div className="wf-accordion__item">
            <button type="button" className="wf-accordion__head" disabled>
              <span className="wf-accordion__arrow">
                <ArrowIcon />
              </span>
              <span className="wf-accordion__title">第三卷 · 禁用项</span>
            </button>
          </div>
        </div>
      </Demo>

      <Demo
        name="Avatar · 仅 CSS"
        note={
          <>
            <LegacyWarn /> 尺寸 sm / md / lg + 圆形 + 语义色；内容可为文字或 `wf-avatar__img`。
          </>
        }
        classes="wf-avatar / wf-avatar--sm|md|lg / wf-avatar--circle / wf-avatar--ok|warn|danger|neutral"
      >
        <div className="sg-row">
          <span className="wf-avatar wf-avatar--sm">林</span>
          <span className="wf-avatar wf-avatar--md">默</span>
          <span className="wf-avatar wf-avatar--lg">WF</span>
          <span className="wf-avatar wf-avatar--md wf-avatar--circle">苏</span>
          <span className="wf-avatar wf-avatar--md wf-avatar--ok">OK</span>
          <span className="wf-avatar wf-avatar--md wf-avatar--warn">W</span>
          <span className="wf-avatar wf-avatar--md wf-avatar--danger">D</span>
          <span className="wf-avatar wf-avatar--md wf-avatar--neutral">N</span>
        </div>
      </Demo>

      <Demo
        name="Divider · 仅 CSS"
        note={
          <>
            <LegacyWarn /> 横向 1px 高、纵向 1px 宽并拉伸对齐容器高度。
          </>
        }
        classes="wf-divider / wf-divider--horizontal / wf-divider--vertical"
      >
        <div className="sg-stack">
          <div>
            <span className="sg-label">horizontal</span>
            <div className="wf-divider wf-divider--horizontal" />
          </div>
          <div className="sg-divider-row">
            <span className="sg-label">左栏</span>
            <div className="wf-divider wf-divider--vertical" />
            <span className="sg-label">中栏</span>
            <div className="wf-divider wf-divider--vertical" />
            <span className="sg-label">右栏</span>
          </div>
        </div>
      </Demo>

      <Demo
        name="Drawer · 仅 CSS"
        note={
          <>
            <LegacyWarn /> 静态框内展示右侧面板（去掉了 fixed 根与遮罩层级），避免覆盖整页；
            真实类名仍为 `wf-drawer__*`。
          </>
        }
        classes="wf-drawer__mask / wf-drawer__panel--right / __head / __title / __body / __foot"
      >
        <div className="sg-drawer-frame">
          <div className="wf-drawer__mask" />
          <div className="wf-drawer__panel wf-drawer__panel--right">
            <div className="wf-drawer__head">
              <div className="wf-drawer__title">书籍详情</div>
              <button type="button" className="wf-drawer__close" aria-label="关闭">
                ×
              </button>
            </div>
            <div className="wf-drawer__body">
              侧边抽屉面板：遮罩 + 贴边滑入，宽度 400px（max-width: 90vw）。当前为静态演示，
              无点击关闭逻辑。
            </div>
            <div className="wf-drawer__foot">
              <button type="button" className="wf-btn wf-btn--secondary">
                取消
              </button>
              <button type="button" className="wf-btn wf-btn--primary">
                保存
              </button>
            </div>
          </div>
        </div>
      </Demo>
    </>
  )
}

export default LegacySection

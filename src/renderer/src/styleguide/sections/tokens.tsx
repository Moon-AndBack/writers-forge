import { Demo } from '../Section'

interface ColorGroup {
  title: string
  tokens: readonly string[]
}

/**
 * 颜色令牌分组（名字与 styles/theme.css 一一对应）。
 * 色块直接以 var(--token) 填充：浏览器对 color-mix() 的自定义属性返回声明字符串，
 * 不做 hex 解析（解析结果只会是 `color-mix(...)` 文本）。
 */
const COLOR_GROUPS: readonly ColorGroup[] = [
  {
    title: '桌面 / 窗口材质',
    tokens: [
      '--desk-1',
      '--desk-2',
      '--desk-3',
      '--desk-solid',
      '--desk-glow-1',
      '--desk-glow-2',
      '--desk-glow-3'
    ]
  },
  { title: '面板', tokens: ['--pane', '--bg', '--fg'] },
  {
    title: '交互表面',
    tokens: ['--soft', '--soft-solid', '--soft-hover-solid', '--soft-press-solid', '--line']
  },
  {
    title: '软底控件',
    tokens: [
      '--control-on-soft',
      '--control-on-soft-hover',
      '--control-on-soft-line',
      '--pill-bg-solid',
      '--pill-bg-hover-solid'
    ]
  },
  { title: '文本', tokens: ['--text', '--text-dim', '--text-mute', '--doc-text', '--caret'] },
  { title: '品牌', tokens: ['--brand', '--brand-2', '--selection-bg'] },
  { title: '语义', tokens: ['--ok', '--warn', '--danger', '--overlay-mask'] }
]

const RADIUS_TOKENS = ['--r-xs', '--r-lg', '--r-window', '--chip-pill-radius'] as const
const SHADOW_TOKENS = ['--sh-xs', '--sh-sm', '--sh-popup', '--sh-float', '--panel-ring'] as const

/** 界面字号 3 档令牌（AGENTS §8.3）。 */
const FONT_SIZES = [
  { size: 10, token: '--fs-micro' },
  { size: 12, token: '--fs-body' },
  { size: 14, token: '--fs-title' }
] as const

/** 展示档（不参与界面字阶）。 */
const DISPLAY_FONT_SIZES = [
  { size: 20, token: '--fs-display' },
  { size: 26, token: '--fs-display-lg' }
] as const

const DURATIONS = [
  { token: '--dur-fast', className: 'sg-motion sg-motion--fast' },
  { token: '--dur-base', className: 'sg-motion sg-motion--base' },
  { token: '--dur-slow', className: 'sg-motion sg-motion--slow' }
] as const

const HEIGHTS = [
  { label: '控件统一档', value: 36, token: '--control-h-md' },
  { label: '状态栏控件', value: 24, token: 'chrome · statusbar' },
  { label: '活动栏按钮', value: 36, token: 'chrome · activitybar' },
  { label: '标题栏', value: 42, token: 'chrome · titlebar' },
  { label: '行操作按钮', value: 22, token: 'row-act' },
  { label: 'Tag 高度', value: 22, token: 'wf-tag' }
] as const

function TokenSwatch({ token }: { token: string }) {
  return (
    <div className="sg-token">
      <span className="sg-token__swatch" style={{ background: `var(${token})` }} />
      <code className="sg-code">{token}</code>
    </div>
  )
}

/** 设计令牌分区：颜色 / 圆角 / 阴影 / 字号 / 动效 / 控件高度。 */
export function TokensSection() {
  return (
    <>
      {COLOR_GROUPS.map((group) => (
        <Demo key={group.title} name={`颜色 · ${group.title}`} classes="var(--token)">
          <div className="sg-token-grid">
            {group.tokens.map((token) => (
              <TokenSwatch key={token} token={token} />
            ))}
          </div>
        </Demo>
      ))}

      <Demo name="圆角 · --r-xs / --r-lg / --r-window / --chip-pill-radius" classes="border-radius">
        <div className="sg-radius-grid">
          {RADIUS_TOKENS.map((token) => (
            <div key={token} className="sg-radius-item">
              <span className="sg-radius" style={{ borderRadius: `var(${token})` }} />
              <code className="sg-code">{token}</code>
            </div>
          ))}
        </div>
      </Demo>

      <Demo
        name="阴影 · --sh-xs / --sh-sm / --sh-popup / --sh-float / --panel-ring"
        classes="box-shadow"
      >
        <div className="sg-shadow-grid">
          {SHADOW_TOKENS.map((token) => (
            <div key={token} className="sg-shadow-item">
              <span className="sg-shadow" style={{ boxShadow: `var(${token})` }} />
              <code className="sg-code">{token}</code>
            </div>
          ))}
        </div>
      </Demo>

      <Demo
        name="字号令牌 · --fs-micro 10 / --fs-body 12 / --fs-title 14"
        note="界面统一 3 档；展示档 --fs-display / --fs-display-lg（20 / 26）仅限已登记位置；封面装饰首字 34 / 56 为例外，不属界面字阶。"
        classes="font-size"
      >
        <div className="sg-type-list">
          {FONT_SIZES.map((font) => (
            <div key={font.token} className="sg-type-row">
              <code className="sg-code sg-type__value">
                {font.token} · {font.size}
              </code>
              <span style={{ fontSize: `var(${font.token})` }}>
                Writer's Forge 组件样式 Aa 0123
              </span>
            </div>
          ))}
          {DISPLAY_FONT_SIZES.map((font) => (
            <div key={font.token} className="sg-type-row is-special">
              <code className="sg-code sg-type__value">
                {font.token} · {font.size} · 展示档
              </code>
              <span style={{ fontSize: `var(${font.token})` }}>
                Writer's Forge 组件样式 Aa 0123
              </span>
            </div>
          ))}
        </div>
      </Demo>

      <Demo
        name="动效 · --dur-fast / --dur-base / --dur-slow + --ease / --ease-out"
        note="悬停下方色块观察三种时长；缓动取 --ease（通用）/ --ease-out（进场）。"
        classes="transition: background var(--dur-*) var(--ease)"
      >
        <div className="sg-motion-grid">
          {DURATIONS.map((duration) => (
            <div key={duration.token} className={duration.className}>
              <span className="sg-motion__sample" />
              <code className="sg-code">{duration.token}</code>
            </div>
          ))}
          <div className="sg-motion sg-motion--fast">
            <span className="sg-motion__sample sg-motion__sample--out" />
            <code className="sg-code">--ease-out</code>
          </div>
        </div>
      </Demo>

      <Demo
        name="控件高度 · 36 / 24 / 36 / 42 / 22 / 23"
        note="控件统一 36；状态栏 24 / 活动栏 36 / 标题栏 42 属 chrome 独立域；行操作 22、Tag 23 为域内定值。"
        classes="height"
      >
        <div className="sg-height-list">
          {HEIGHTS.map((item) => (
            <div key={item.token} className="sg-height-row">
              <span className="sg-height-bar" style={{ height: `${item.value}px` }} />
              <code className="sg-code">
                {item.value}px · {item.token}
              </code>
              <span className="sg-label">{item.label}</span>
            </div>
          ))}
        </div>
      </Demo>
    </>
  )
}

export default TokensSection

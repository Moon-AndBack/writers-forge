import ThemeBar from './ThemeBar'
import { Section } from './Section'
import { TokensSection } from './sections/tokens'
import { ButtonsSection } from './sections/buttons'
import { FormsSection } from './sections/forms'
import { SurfacesSection } from './sections/surfaces'
import { OverlaysSection } from './sections/overlays'
import { LegacySection } from './sections/legacy'

/** 左侧锚点导航：与下方分区顺序一一对应。 */
const SECTIONS = [
  { id: 'sg-tokens', label: '设计令牌' },
  { id: 'sg-buttons', label: '按钮与操作' },
  { id: 'sg-forms', label: '表单控件' },
  { id: 'sg-surfaces', label: '卡片与状态' },
  { id: 'sg-overlays', label: '浮层' },
  { id: 'sg-legacy', label: '死代码' }
] as const

/**
 * 展示页骨架：header 固定高度不浮动，main 内左右两栏。
 * 刻意不用 sticky / fixed / 新 z-index：右栏内容区独立滚动，导航常驻。
 */
export function StyleguideApp() {
  return (
    <div className="sg-root">
      <header className="sg-header">
        <div className="sg-brand">
          <h1 className="sg-title">Writer's Forge · Style Guide</h1>
          <p className="sg-subtitle">
            通用 UI 组件画廊 · 直接渲染真实组件 · 仅开发期使用，不进构建产物
          </p>
        </div>
        <ThemeBar />
      </header>

      <div className="sg-main">
        <nav className="sg-nav" aria-label="分区导航">
          <div className="sg-nav__title">分区</div>
          {SECTIONS.map((section) => (
            <a key={section.id} className="sg-nav__link" href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
          <p className="sg-nav__note">
            锚点跳转；右侧内容区独立滚动。组件类名以 <code className="sg-code">wf-</code> 开头，
            点击示例旁的类名即可选中复制。
          </p>
        </nav>

        <main className="sg-content">
          <Section
            id="sg-tokens"
            title="设计令牌"
            description={
              <>
                颜色 / 圆角 / 阴影 / 字号 / 动效 / 控件高度全部来自{' '}
                <code className="sg-code">styles/theme.css</code>。切换上方主题可逐块核对四套主题的
                取值；色块背景直接引用 <code className="sg-code">var(--token)</code>，不做 hex
                解析。
              </>
            }
          >
            <TokensSection />
          </Section>

          <Section
            id="sg-buttons"
            title="按钮与操作"
            description={
              <>
                所有交互控件高度统一 <strong>36px</strong>（sm / md / lg 只差
                padding、字号与图标尺寸）。 hover / focus 为真实交互态，直接悬停或 Tab 聚焦查看。
              </>
            }
          >
            <ButtonsSection />
          </Section>

          <Section
            id="sg-forms"
            title="表单控件"
            description="输入类控件共用 form.css 的内描边方案；聚焦环、错误态与禁用态均可在下方直接操作。"
          >
            <FormsSection />
          </Section>

          <Section
            id="sg-surfaces"
            title="卡片与状态"
            description={
              <>
                卡片 hover 只用描边 / 阴影 / 底色变化，<strong>不含位移或缩放</strong>（AGENTS
                §8.8）。 空态 / 错误态的判定顺序为 loading → error → empty。
              </>
            }
          >
            <SurfacesSection />
          </Section>

          <Section
            id="sg-overlays"
            title="浮层"
            description={
              <>
                下拉 / 弹窗 / Toast / Tooltip 经 portal 挂到 body；除 Modal 外均不影响页面布局。
                z-index 由组件自身 CSS 决定，本页不新增浮层层级。
              </>
            }
          >
            <OverlaysSection />
          </Section>

          <Section
            id="sg-legacy"
            title="死代码（仅 CSS）"
            description={
              <>
                以下组件只有样式、没有 TSX 实现：本页用手写最小 HTML 复刻其约定类名，仅用于观察与
                后续清理决策，<strong>生产代码请勿使用</strong>。
              </>
            }
          >
            <LegacySection />
          </Section>
        </main>
      </div>
    </div>
  )
}

export default StyleguideApp

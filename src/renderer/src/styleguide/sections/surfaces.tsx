import { useState } from 'react'
import { Badge, Button, Card, EntityStyleCard, IconButton, Tag } from '@renderer/components/ui'
import { EmptyState } from '@renderer/components/EmptyState'
import { LoadErrorState } from '@renderer/components/LoadErrorState'
import { Demo, Sample } from '../Section'

function PenIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13 7 4 4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
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

function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 0 4 23V5.5Z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </svg>
  )
}

/** 卡片与状态分区：Card / EntityStyleCard / EmptyState / LoadErrorState。 */
export function SurfacesSection() {
  const [retries, setRetries] = useState(0)

  return (
    <>
      <Demo
        name="Card · default / soft / interactive / halo"
        note="hover 只改描边 / 阴影 / 底色，不含位移或缩放；halo 为通用边缘光晕变体。"
        classes="wf-card / wf-card--soft / wf-card--interactive / wf-card--halo"
      >
        <div className="sg-card-grid">
          <Sample label="default · title / subtitle / extra / footer">
            <Card
              title="卷首语"
              subtitle="共 12 章 · 3.2 万字"
              extra={<Badge tone="brand">连载中</Badge>}
              footer={<span className="sg-label">最后编辑：今天 10:24</span>}
            >
              <p className="sg-card-text">默认卡片：--soft-solid 底、8px 圆角、--sh-sm。</p>
            </Card>
          </Sample>
          <Sample label="soft">
            <Card variant="soft" title="灵感碎片">
              <p className="sg-card-text">柔和变体：无阴影、4px 圆角，视觉更轻。</p>
            </Card>
          </Sample>
          <Sample label="interactive（悬停看光晕）">
            <Card variant="soft" interactive title="可点击卡片">
              <p className="sg-card-text">hover 换成 --soft-hover-solid + 品牌边缘光晕。</p>
            </Card>
          </Sample>
          <Sample label="halo">
            <Card className="wf-card--halo" title="通用光晕卡">
              <p className="sg-card-text">与书籍卡同口径的描边环 + 外发光。</p>
            </Card>
          </Sample>
        </div>
      </Demo>

      <Demo
        name="EntityStyleCard · 标题 / 操作 / meta / 描述 / info / chips"
        note="实体卡通用壳：标题与徽章由调用方组合，操作区放 IconButton 即自动对齐。"
        classes="wf-entity-card wf-card--halo / wf-entity-card__head / __desc / __chips"
      >
        <div className="sg-card-grid">
          <EntityStyleCard
            head={
              <>
                <span className="sg-entity-name">林默</span>
                <Badge tone="brand">主角</Badge>
              </>
            }
            actions={
              <>
                <IconButton size="sm" label="编辑角色">
                  <PenIcon />
                </IconButton>
                <IconButton size="sm" tone="danger" label="删除角色">
                  <TrashIcon />
                </IconButton>
              </>
            }
            meta={
              <>
                <Tag tone="neutral">别名：阿默</Tag>
                <Tag tone="brand">核心角色</Tag>
              </>
            }
            description="沉默寡言的天文台守夜人，能听见星轨偏移时极轻的摩擦声。为寻找失踪的师父，独自踏上了北境的长夜。"
            info={<span>首次登场：第一卷 · 第 3 章</span>}
            chips={
              <>
                <Tag tone="neutral">苏晚 · 同门</Tag>
                <Tag tone="neutral">陈序 · 对手</Tag>
              </>
            }
          />
          <EntityStyleCard
            head={
              <>
                <span className="sg-entity-name">雾港</span>
                <Badge tone="ok">地点</Badge>
              </>
            }
            readonly
            description="北境最大的不冻港，常年被低云覆盖。码头尽头的灯塔在午夜会短暂熄灭三次。"
            info={<span>所属：北境 · 灰潮海</span>}
            chips={<Tag tone="neutral">林默 · 故乡</Tag>}
          />
        </div>
      </Demo>

      <Demo
        name="EmptyState · 常规 / 紧凑"
        note="常规 260px、紧凑 180px；文案由调用方经 t() 传入，组件本身不依赖 i18n。"
        classes="placeholder-view / is-compact"
      >
        <div className="sg-state-grid">
          <div className="sg-state-box">
            <EmptyState
              title="尚未创建章节"
              description="点击右上角「新建章节」开始写作"
              icon={<BookIcon />}
            />
          </div>
          <div className="sg-state-box">
            <EmptyState compact title="没有匹配结果" description="试试更换关键词或清除筛选" />
          </div>
        </div>
      </Demo>

      <Demo
        name="LoadErrorState · 读取失败 + 重试"
        note="错误态与空态严格区分：danger 标题 + 重试按钮，不替换已有内容。"
        classes="placeholder-view is-error / role=alert"
      >
        <div className="sg-state-grid">
          <div className="sg-state-box">
            <LoadErrorState onRetry={() => setRetries((value) => value + 1)} />
          </div>
          <div className="sg-state-box sg-state-box--center">
            <span className="sg-label">已触发重试次数：{retries}</span>
            <Button variant="secondary" size="sm" onClick={() => setRetries(0)}>
              重置计数
            </Button>
          </div>
        </div>
      </Demo>
    </>
  )
}

export default SurfacesSection

import type { HTMLAttributes, ReactNode, Ref } from 'react'

/**
 * 通用「实体样式卡」壳（剧情 / 伏笔 / 设定档案共用）。
 *
 * 只承载**结构与公共视觉规格**：根布局、标题行、次级胶囊行、描述区、
 * 元信息区、底部胶囊区与浮层槽位；不包含任何域业务逻辑。
 *
 * 设计边界：
 * - 描述行数不写死：壳只给描述容器基础字号 / 行高 / 颜色，裁剪行数由调用方
 *   通过 `descriptionClassName` 挂域内类控制（实体 4 行 / 剧情 4 行 / 伏笔 3 行）；
 * - 底部胶囊容器经 `chipsRef` 暴露，供 `useChipOverflow` 按真实 DOM 测量；
 * - 标题 / 徽章由调用方在 `head` 内组合，操作按钮走独立 `actions` 槽。
 *
 * 卡片操作按钮统一约定（三个域一致）：
 * - 容器：壳输出 `.wf-entity-card__actions`（两端对齐、4px 间距、24px 盒 / 14px 图标固化）；
 * - 组件：一律复用 `<IconButton variant="ghost" size="sm">`，不另造按钮；
 * - tone：**删除 → `tone="danger"`**；编辑 / 关联关系 / 其他 → 默认 tone；
 * - hover / focus：由 IconButton 统一提供（default 中性底、danger 危险底、
 *   focus-visible 品牌描边环）；调用方不要再传 `width`，图标尺寸由该档位决定。
 */
export interface EntityStyleCardProps {
  /** 标题行：标题 + 徽章（由调用方组合，壳负责 flex 布局）。 */
  head: ReactNode
  /** 操作按钮区：放入 `<IconButton>` 即可自动获得统一尺寸 / 间距 / hover / focus。 */
  actions?: ReactNode
  /** 次级胶囊行（如别名），可选。 */
  meta?: ReactNode
  /** 描述区内容（行数由调用方类控制）。 */
  description?: ReactNode
  /** 追加到描述容器的类名（域内裁剪行数 / 段首缩进等）。 */
  descriptionClassName?: string
  /** 元信息区（如伏笔的位置行），可选。 */
  info?: ReactNode
  /** 底部胶囊区内容（关系 / 实体），可选。 */
  chips?: ReactNode
  /** 底部胶囊容器的 ref（`useChipOverflow` 测量用）。 */
  chipsRef?: Ref<HTMLDivElement>
  /** 追加到底部胶囊容器的类名（域内尺寸 / 换行策略）。 */
  chipsClassName?: string
  /** 透传到底部胶囊容器的属性（role / aria / onClick 等）。 */
  chipsProps?: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>
  /** 浮层（如「+N」弹窗），可选；portal 组件放这里不影响文档流。 */
  popup?: ReactNode
  /** 选中态：根元素追加 `is-active`（由通用光晕底座接管）。 */
  active?: boolean
  /** 只读变体：不暗示可点击（光标为默认箭头）。 */
  readonly?: boolean
  /** 紧凑变体：只落类名钩子，具体尺寸由域内样式覆写。 */
  compact?: boolean
  /** 追加到根 `<article>` 的类名（域语义钩子）。 */
  className?: string
  /** 透传到根 `<article>` 的交互 / 无障碍属性（含 `data-*`，供域内测量 / 定位）。 */
  cardProps?: Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'> & {
    [key: `data-${string}`]: string | number | undefined
  }
}

export function EntityStyleCard({
  head,
  actions,
  meta,
  description,
  descriptionClassName,
  info,
  chips,
  chipsRef,
  chipsClassName,
  chipsProps = {},
  popup,
  active = false,
  readonly = false,
  compact = false,
  className,
  cardProps = {}
}: EntityStyleCardProps) {
  const rootClasses = [
    'wf-card--halo',
    'wf-entity-card',
    active ? 'is-active' : '',
    readonly ? 'wf-entity-card--readonly' : '',
    compact ? 'wf-entity-card--compact' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  const descriptionClasses = ['wf-entity-card__desc', descriptionClassName ?? '']
    .filter(Boolean)
    .join(' ')

  const chipsClasses = ['wf-entity-card__chips', chipsClassName ?? ''].filter(Boolean).join(' ')

  return (
    <article className={rootClasses} {...cardProps}>
      <div className="wf-entity-card__head">
        {head}
        {actions !== undefined && actions !== null ? (
          <span className="wf-entity-card__actions">{actions}</span>
        ) : null}
      </div>
      {meta !== undefined && meta !== null ? (
        <div className="wf-entity-card__meta">{meta}</div>
      ) : null}
      {description !== undefined && description !== null ? (
        <div className={descriptionClasses}>{description}</div>
      ) : null}
      {info !== undefined && info !== null ? (
        <div className="wf-entity-card__info">{info}</div>
      ) : null}
      {chips !== undefined && chips !== null ? (
        <div className={chipsClasses} ref={chipsRef} {...chipsProps}>
          {chips}
        </div>
      ) : null}
      {popup}
    </article>
  )
}

EntityStyleCard.displayName = 'EntityStyleCard'

export default EntityStyleCard

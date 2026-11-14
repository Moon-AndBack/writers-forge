import { useEffect, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/cn'
import { Badge, IconButton, Progress, Tag } from '../../components/ui'
import type { BadgeTone } from '../../components/ui'
import { getCoverGradient } from './bookMeta'
import { STATUS_META, formatBookWords, type Book, type BookStatus } from './data'

export interface BookCardProps {
  /** 书籍数据 */
  book: Book
  /**
   * 全局笔名（`settings.penName`）：卡片作者行展示；缺省或为空时回退「未署名」。
   * 作者已不再是书籍字段，全书统一以全局笔名呈现。
   */
  penName?: string
  /** 是否选中 */
  selected?: boolean
  /**
   * 封面版本号：父组件在封面图被写入 / 删除后自增，用于触发卡片重新读取封面 blob
   * （同一 id 的卡片保持挂载时，仅靠 id 变化无法感知封面更新）。
   */
  coverVersion?: number
  /**
   * 分类 ID → 名称映射（来自 `categories:list`）。提供后书籍卡片渲染分类标签；
   * 缺省或某 ID 无映射时跳过对应标签（纯浏览器兜底数据无分类，不渲染）。
   */
  categoryNames?: Map<number, string>
  /** 选中回调 */
  onSelect?: (id: string) => void
  /**
   * 打开回调（点击整卡 / 回车 / 空格时触发，通常用于进入写作页）。
   * 提供时优先于 `onSelect`：卡片点击语义由「选中」升级为「进入」。
   */
  onOpen?: (id: string) => void
  /** 编辑回调（点击封面右上角编辑按钮时触发） */
  onEdit?: (id: string) => void
  /** 删除回调（点击封面右上角删除按钮时触发） */
  onDelete?: (id: string) => void
}

/**
 * 书籍状态 → Badge 色调映射（六态齐备）：
 * 连载中 brand / 已完结 ok / 草稿 warn / 暂停 neutral / 太监 danger / 修订中 brand。
 */
const STATUS_TONE: Record<BookStatus, BadgeTone> = {
  writing: 'brand',
  done: 'ok',
  draft: 'warn',
  paused: 'neutral',
  dropped: 'danger',
  revising: 'brand'
}

function TrashIcon() {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

/**
 * 书籍卡片：封面（封面图或渐变 + 封面字 + 状态胶囊 + 编辑/删除按钮）+
 * 标题 / 笔名·章节·字数 + 进度条 + 分类标签。整卡可点击进入，hover 呈主题色
 * 边缘光晕，支持选中态。
 *
 * - 封面：若该书在数据库中存有封面图（blob），经 `books.cover.get` 载入并显示
 *   （`Uint8Array` → `Blob` → `URL.createObjectURL`，卸载 / 切换时 revoke）；
 *   否则回退「封面字 + `coverColor` 对应渐变」。
 * - 展示控件收敛到组件库：状态胶囊 `Badge`、编辑 / 删除 `IconButton`、进度
 *   `Progress`、分类 `Tag`；卡片容器因「封面块 + 正文」结构保留自绘 `.book-card`。
 */
export function BookCard({
  book,
  penName = '',
  selected = false,
  coverVersion = 0,
  categoryNames,
  onSelect,
  onOpen,
  onEdit,
  onDelete
}: BookCardProps) {
  const { t } = useTranslation('bookshelf')
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const coverColor = book.coverColor
  const bookId = book.id

  // 载入封面图 blob（无 API / 无记录时静默回退渐变）。
  // coverVersion 参与依赖：封面图被写入 / 删除后由父组件自增，触发重新读取。
  useEffect(() => {
    const api = window.api?.books?.cover
    if (!api) return undefined

    let active = true
    let created: string | null = null
    api
      .get(bookId)
      .then((payload) => {
        if (!active || !payload) return
        const blob = new Blob([new Uint8Array(payload.data)], { type: payload.mime })
        created = URL.createObjectURL(blob)
        setCoverUrl(created)
      })
      .catch(() => {
        /* 读取失败静默忽略 */
      })

    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
      setCoverUrl(null)
    }
  }, [bookId, coverVersion])

  // 整卡激活：优先「打开」（进入写作页），否则回退「选中」。
  const handleActivate = (): void => {
    if (onOpen) onOpen(book.id)
    else onSelect?.(book.id)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleActivate()
    }
  }

  const handleEdit = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    onEdit?.(book.id)
  }

  const handleDelete = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    onDelete?.(book.id)
  }

  return (
    <article
      className={cn('book-card', selected && 'is-selected')}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={t('card.ariaLabel', {
        title: book.title,
        status: t(STATUS_META[book.status].labelKey)
      })}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn('book-cover', coverUrl && 'has-image')}
        style={coverUrl ? undefined : { backgroundImage: getCoverGradient(coverColor) }}
      >
        {coverUrl ? (
          <img className="book-cover__img" src={coverUrl} alt="" />
        ) : (
          <span className="book-cover__title" aria-hidden="true">
            {book.title.trim() || t('card.coverCharFallback')}
          </span>
        )}
        <Badge className="book-status" tone={STATUS_TONE[book.status]}>
          {t(STATUS_META[book.status].labelKey)}
        </Badge>
        <div className="book-actions">
          <IconButton
            className="book-edit"
            variant="ghost"
            label={t('card.editAria', { title: book.title })}
            onClick={handleEdit}
          >
            <PencilIcon />
          </IconButton>
          <IconButton
            className="book-delete"
            tone="danger"
            label={t('card.deleteAria', { title: book.title })}
            onClick={handleDelete}
          >
            <TrashIcon />
          </IconButton>
        </div>
      </div>

      <div className="book-body">
        <h3 className="book-title">{book.title}</h3>

        <div className="book-meta">
          <span>{penName || t('defaultAuthor')}</span>
          <span className="dot" aria-hidden="true" />
          <span>{t('card.chapterCount', { count: book.chapters })}</span>
          <span className="dot" aria-hidden="true" />
          <span>{formatBookWords(t, book.words)}</span>
        </div>

        <Progress
          value={book.progress}
          max={100}
          size="md"
          tone="brand"
          label={t('card.progressAria', { title: book.title })}
        />

        {categoryNames && book.categories.length > 0 ? (
          <div className="book-tags">
            {book.categories.map((categoryId) => {
              const name = categoryNames.get(categoryId)
              return name ? (
                <Tag
                  key={categoryId}
                  className="book-tag chip-pill chip-pill--neutral"
                  tone="neutral"
                >
                  {name}
                </Tag>
              ) : null
            })}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default BookCard

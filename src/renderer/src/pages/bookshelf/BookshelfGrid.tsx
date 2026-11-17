import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadErrorState } from '../../components/LoadErrorState'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui'
import { BookCard } from './BookCard'
import type { Book } from './data'

export interface BookshelfGridProps {
  /** 首读中（先于错误 / 空态判定） */
  loading: boolean
  /** 书架读取失败标记 */
  loadError: boolean
  /** 数据库书籍行数（用于区分「真空态」与「读取失败」） */
  bookCount: number
  /** 已筛选 / 排序的展示列表 */
  books: Book[]
  /** 全局笔名（空串回退「未署名」） */
  penName: string
  /** 当前选中卡片 id */
  selectedId: string | null
  /** 封面图版本号（驱动卡片重新读取 blob） */
  coverVersion: number
  /** 分类 ID → 名称映射 */
  categoryNames: Map<number, string>
  /** 网格容器 ref（宽度磁吸测尺寸用） */
  gridRef: RefObject<HTMLDivElement | null>
  /** 读取失败重试 */
  onRetry: () => void
  /** 新建书籍（空态入口） */
  onCreate: () => void
  /** 清除筛选 / 搜索 */
  onClearFilters: () => void
  /** 选中卡片 */
  onSelect: (id: string) => void
  /** 进入写作页 */
  onOpen: (id: string) => void
  /** 打开编辑弹窗 */
  onEdit: (id: string) => void
  /** 删除书籍 */
  onDelete: (id: string) => void
}

/**
 * 书架主体：卡片网格 + 三态空态。
 * 判定顺序固定为 首读 → 读取失败 → 无书 → 筛选无结果，四类互不合并。
 */
export function BookshelfGrid({
  loading,
  loadError,
  bookCount,
  books,
  penName,
  selectedId,
  coverVersion,
  categoryNames,
  gridRef,
  onRetry,
  onCreate,
  onClearFilters,
  onSelect,
  onOpen,
  onEdit,
  onDelete
}: BookshelfGridProps) {
  const { t } = useTranslation('bookshelf')
  const { t: tCommon } = useTranslation('common')

  if (loading) {
    /* 首读：先于错误 / 空态判定，避免数据未回来时先闪「还没有书籍」。 */
    return <EmptyState className="bookshelf-empty" title={tCommon('loading')} />
  }

  if (loadError && bookCount === 0) {
    /* 读取失败且无可用数据：与「书架为空」区分，给出重试入口。 */
    return <LoadErrorState onRetry={onRetry} />
  }

  if (bookCount === 0) {
    /* 真空态：一本书都没有（与「筛选 / 搜索无结果」分开）。 */
    return (
      <EmptyState
        className="bookshelf-empty"
        title={t('empty.title')}
        description={
          <>
            <span>{t('empty.description')}</span>
            <Button variant="primary" onClick={onCreate}>
              {t('newBook')}
            </Button>
          </>
        }
      />
    )
  }

  if (books.length === 0) {
    /* 有书但当前筛选 / 搜索无结果：给清除条件入口，不误导成「书架为空」。 */
    return (
      <EmptyState
        className="bookshelf-empty"
        title={t('empty.filteredTitle')}
        description={
          <>
            <span>{t('empty.filteredDescription')}</span>
            <Button variant="secondary" onClick={onClearFilters}>
              {t('empty.clearFilters')}
            </Button>
          </>
        }
      />
    )
  }

  return (
    <div className="book-grid" ref={gridRef}>
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          penName={penName}
          selected={book.id === selectedId}
          coverVersion={coverVersion}
          categoryNames={categoryNames}
          onSelect={onSelect}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

export default BookshelfGrid

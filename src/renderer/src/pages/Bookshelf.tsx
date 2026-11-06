import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { LoadErrorState } from '../components/LoadErrorState'
import { IconButton, useToast } from '../components/ui'
import { useSetStatusBar } from '../shell/statusBarContext'
import { useSetTitleBarActions } from '../shell/titleBarActions'
import { BookCard } from './bookshelf/BookCard'
import { BookshelfToolbar } from './bookshelf/BookshelfToolbar'
import {
  BookFormDialog,
  type BookFormInitialValues,
  type BookFormValues
} from './bookshelf/BookFormDialog'
import { useShelfSnap } from './bookshelf/useShelfSnap'
import { useConfirm } from './writer/chapters/useConfirm'
import {
  FALLBACK_BOOKS,
  filterBooks,
  formatNumber,
  formatStatWords,
  mergeBookStats,
  sortBooks,
  type Book,
  type BookStats,
  type ShelfFilter,
  type ShelfSort,
  type ShelfStats
} from './bookshelf/data'
import '../styles/bookshelf.css'

/** 「新建书籍」按钮图标（内联 SVG 加号）。 */
function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** 编辑模式初值：从数据库行提取表单可编辑字段。 */
function toInitialValues(book: Book): BookFormInitialValues {
  return {
    intro: book.intro,
    categories: book.categories,
    status: book.status,
    channel: book.channel,
    lengthType: book.lengthType,
    coverColor: book.coverColor
  }
}

/** 生成纯浏览器兜底数据的本地 id。 */
function localId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 书籍页（书架视图）。
 * 工具条（状态标签页 / 搜索 / 排序）+ 书籍卡片网格；数据来自本地数据库
 * （`api.books.*`），无 Electron API 时回退静态样例，保证纯浏览器预览不报错。
 * 「新建书籍」入口位于外壳标题栏，经 titleBarActions 插槽注册。
 */
export default function Bookshelf() {
  const { t } = useTranslation('bookshelf')
  const booksApi = window.api?.books
  const [bookList, setBookList] = useState<Book[]>(() =>
    window.api?.books ? [] : [...FALLBACK_BOOKS]
  )
  // 书架读取失败标记：区分「书架真的是空的」与「读取失败」（后者给出重试）。
  const [loadError, setLoadError] = useState(false)
  const [statsByBook, setStatsByBook] = useState<Record<string, BookStats>>({})
  const [shelfStats, setShelfStats] = useState<ShelfStats>({ words: 0, today: 0, streak: 0 })
  const [penName, setPenName] = useState('')
  // 分类 ID → 名称映射（来自 categories:list），供书籍卡片渲染分类标签。
  const [categoryNames, setCategoryNames] = useState<Map<number, string>>(new Map())
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ShelfSort>('recent')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // 封面图写入 / 删除后自增，驱动卡片重新读取 blob。
  const [coverVersion, setCoverVersion] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  // 删除成功的轻量提示 + 删除前的二次确认（复用 writer 域通用组件）。
  const toast = useToast()
  const confirm = useConfirm()

  const books = useMemo(() => {
    // 无 stats API（纯浏览器预览）时不覆盖，保留兜底样例的展示值。
    const withStats = window.api?.stats ? mergeBookStats(bookList, statsByBook) : bookList
    return sortBooks(filterBooks(withStats, filter, query), sort)
  }, [bookList, statsByBook, filter, query, sort])
  const editingBook = useMemo(
    () => (editingId === null ? null : (bookList.find((book) => book.id === editingId) ?? null)),
    [editingId, bookList]
  )

  // 宽度磁吸：仅本页挂载时向主进程上报网格尺寸，卸载即失效
  useShelfSnap(gridRef, books.length)

  /** 拉取实时统计（累计字数 / 今日写作 / 连续天数 + 各书统计；无 API 时空操作）。 */
  const loadStats = useCallback(async (): Promise<void> => {
    const statsApi = window.api?.stats
    if (!statsApi) return
    try {
      const [total, today, streak, byBook] = await Promise.all([
        statsApi.totalWords(),
        statsApi.todayWords(),
        statsApi.streakDays(),
        statsApi.bookStatsAll()
      ])
      setShelfStats({ words: total, today, streak })
      setStatsByBook(byBook)
    } catch {
      /* 统计读取失败静默忽略：保留现有值 */
    }
  }, [])

  /** 重新从数据库拉取列表（无 API 时为空操作）。 */
  const refresh = useCallback(async (): Promise<void> => {
    if (!booksApi) return
    try {
      setBookList(await booksApi.list())
      setLoadError(false)
    } catch {
      /* IPC 失败：标记错误态（列表为空时显示「加载失败 + 重试」），保留现有列表 */
      setLoadError(true)
    }
    await loadStats()
  }, [booksApi, loadStats])

  // 挂载时载入数据库行与实时统计；纯浏览器保留兜底样例。
  useEffect(() => {
    if (!booksApi) return undefined
    let active = true
    booksApi
      .list()
      .then((rows) => {
        if (!active) return
        setBookList(rows)
        setLoadError(false)
      })
      .catch(() => {
        /* 读取失败：标记错误态，避免把「读取失败」显示成「书架为空」 */
        if (active) setLoadError(true)
      })
    // 微任务中拉取统计，避免在 effect 内同步触发 setState（react-hooks/set-state-in-effect）。
    void Promise.resolve().then(loadStats)
    return () => {
      active = false
    }
  }, [booksApi, loadStats])

  // 读取全局笔名（`settings.penName`），供书籍卡片作者行展示；顺带拉分类名称映射。
  useEffect(() => {
    const settings = window.api?.settings
    if (!settings) return undefined
    let active = true
    settings
      .get('penName')
      .then((value) => {
        if (active) setPenName(value ?? '')
      })
      .catch(() => {
        /* 读取失败静默忽略 */
      })
    return () => {
      active = false
    }
  }, [])

  // 分类 ID → 名称映射（卡片标签展示用；失败静默，标签区整体不渲染）。
  useEffect(() => {
    const categoriesApi = window.api?.categories
    if (!categoriesApi) return undefined
    let active = true
    categoriesApi
      .list()
      .then((rows) => {
        if (active) setCategoryNames(new Map(rows.map((row) => [row.id, row.name])))
      })
      .catch(() => {
        /* 读取失败静默忽略 */
      })
    return () => {
      active = false
    }
  }, [])

  /** 进入写作页：以 bookId 作为路由参数（`/write/:bookId`）。 */
  const handleOpen = useCallback(
    (id: string): void => {
      navigate(`/write/${encodeURIComponent(id)}`)
    },
    [navigate]
  )

  /** 真正执行删除：清选中 / 编辑态 → 删库（无 API 则本地兜底）→ 刷新 + 成功提示。 */
  const performDelete = (id: string, title: string): void => {
    setSelectedId((prev) => (prev === id ? null : prev))
    setEditingId((prev) => (prev === id ? null : prev))
    if (!booksApi) {
      setBookList((prev) => prev.filter((book) => book.id !== id))
      toast.show(t('dialog.bookDeletedToast', { title }))
      return
    }
    void booksApi
      .delete(id)
      .then(async () => {
        toast.show(t('dialog.bookDeletedToast', { title }))
        await refresh()
      })
      .catch(() => {
        /* 删除失败静默忽略 */
      })
  }

  /** 删除入口：先弹二次确认，确认后才执行删除（取消 / Esc / 遮罩均不删除）。 */
  const handleDelete = (id: string): void => {
    const title = bookList.find((book) => book.id === id)?.title ?? t('dialog.thisBookFallback')
    confirm.request(
      {
        title: t('dialog.deleteBook.title'),
        message: t('dialog.deleteBook.message', { title }),
        confirmText: t('dialog.deleteBook.confirm'),
        tone: 'danger'
      },
      () => performDelete(id, title)
    )
  }

  // 标题栏左侧「新建书籍」按钮：注册到外壳插槽，节点稳定引用避免重注册。
  const titleBarAction = useMemo(
    () => (
      <IconButton variant="ghost" label={t('newBook')} onClick={() => setDialogOpen(true)}>
        <PlusIcon />
      </IconButton>
    ),
    [t]
  )
  useSetTitleBarActions(titleBarAction)

  const handleCreate = (values: BookFormValues): void => {
    if (!booksApi) {
      const now = new Date().toISOString()
      const book: Book = {
        id: localId(),
        title: values.title,
        intro: values.intro,
        categories: values.categories,
        status: values.status,
        channel: values.channel,
        lengthType: values.lengthType,
        words: 0,
        chapters: 0,
        progress: 0,
        coverChar: values.title.slice(0, 1),
        coverColor: values.coverColor,
        createdAt: now,
        updatedAt: now
      }
      setBookList((prev) => [...prev, book])
      return
    }

    void booksApi
      .create({
        title: values.title,
        intro: values.intro,
        categories: values.categories,
        status: values.status,
        channel: values.channel,
        lengthType: values.lengthType,
        coverColor: values.coverColor
      })
      .then(async (created) => {
        if (created && values.coverFile) {
          try {
            await booksApi.cover.set(created.id, values.coverFile.mime, values.coverFile.data)
            setCoverVersion((version) => version + 1)
          } catch {
            /* 封面写入失败静默忽略 */
          }
        }
        await refresh()
      })
      .catch(() => {
        /* 创建失败静默忽略 */
      })
  }

  // 编辑：按 id 更新可编辑字段；封面色 / 封面图一并更新。
  const handleEditSubmit = (values: BookFormValues): void => {
    if (editingBook === null) return
    const id = editingBook.id

    if (!booksApi) {
      setBookList((prev) =>
        prev.map((book) =>
          book.id === id
            ? {
                ...book,
                title: values.title,
                intro: values.intro,
                categories: values.categories,
                status: values.status,
                channel: values.channel,
                lengthType: values.lengthType,
                coverColor: values.coverColor,
                coverChar: values.title.slice(0, 1),
                updatedAt: new Date().toISOString()
              }
            : book
        )
      )
      return
    }

    void booksApi
      .update(id, {
        title: values.title,
        intro: values.intro,
        categories: values.categories,
        status: values.status,
        channel: values.channel,
        lengthType: values.lengthType,
        coverColor: values.coverColor
      })
      .then(async () => {
        let coverChanged = false
        try {
          if (values.coverFile) {
            await booksApi.cover.set(id, values.coverFile.mime, values.coverFile.data)
            coverChanged = true
          } else if (values.removeCover) {
            await booksApi.cover.delete(id)
            coverChanged = true
          }
        } catch {
          /* 封面写入 / 删除失败静默忽略 */
        }
        await refresh()
        if (coverChanged) setCoverVersion((version) => version + 1)
      })
      .catch(() => {
        /* 更新失败静默忽略 */
      })
  }

  // 统计移入外壳状态栏：左侧书数（基于数据库行数），右侧累计字数 / 今日写作 / 连续写作。
  // 文案含 <b> 标记（数值加粗），经 `Trans` + `components={{ b: <b /> }}` 渲染以保留内联结构。
  const statusSlots = useMemo(
    () => ({
      left: (
        <span className="st-item st-meta">
          <Trans
            i18nKey="status.bookCount"
            ns="bookshelf"
            count={bookList.length}
            components={{ b: <b /> }}
          />
        </span>
      ),
      right: (
        <>
          <span className="st-item st-meta">
            <Trans
              i18nKey="status.totalWords"
              ns="bookshelf"
              values={{ value: formatStatWords(t, shelfStats.words) }}
              components={{ b: <b /> }}
            />
          </span>
          <span className="st-item st-meta">
            <Trans
              i18nKey="status.todayWords"
              ns="bookshelf"
              values={{ value: formatNumber(shelfStats.today) }}
              components={{ b: <b /> }}
            />
          </span>
          <span className="st-item st-meta">
            <Trans
              i18nKey="status.streak"
              ns="bookshelf"
              count={shelfStats.streak}
              components={{ b: <b /> }}
            />
          </span>
        </>
      )
    }),
    [bookList.length, shelfStats, t]
  )
  useSetStatusBar(statusSlots)

  return (
    <section className="app-view bookshelf-view is-active">
      <BookshelfToolbar
        filter={filter}
        onFilterChange={setFilter}
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
      />

      {loadError && bookList.length === 0 ? (
        /* 读取失败且无可用数据：与「书架为空」区分，给出重试入口。 */
        <LoadErrorState onRetry={() => void refresh()} />
      ) : (
        <div className="book-grid" ref={gridRef}>
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              penName={penName}
              selected={book.id === selectedId}
              coverVersion={coverVersion}
              categoryNames={categoryNames}
              onSelect={setSelectedId}
              onOpen={handleOpen}
              onEdit={setEditingId}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <BookFormDialog
        open={dialogOpen}
        mode="create"
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreate}
      />

      <BookFormDialog
        open={editingBook !== null}
        mode="edit"
        bookId={editingBook?.id}
        initialTitle={editingBook?.title}
        initialValues={editingBook ? toInitialValues(editingBook) : undefined}
        onClose={() => setEditingId(null)}
        onSubmit={handleEditSubmit}
      />

      {confirm.node}
      {toast.node}
    </section>
  )
}

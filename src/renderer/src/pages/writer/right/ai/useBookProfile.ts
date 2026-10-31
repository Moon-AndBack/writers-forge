import { useEffect, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { BookChannel } from '../../../../../../main/database/books'
import type { CategoryRow } from '../../../../../../preload/types/categories'
import { buildBookContext } from './bookContext'
import { getCategoryStyleHint } from './categoryStyleHints'

/** 作品设定日志（转发至主进程落盘）。 */
const log = createLogger('useBookProfile')

/**
 * 频道 → 中文名（**不译**，与分类名同口径）。
 *
 * 提示词正文与分类名都是中文（分类名为 AGENTS §10 的「不译项」），频道名若走
 * i18n，英文界面会出现「这是一部 Male-oriented·仙侠类小说」这类中英混排。
 * 故此处固定中文，与提示词整体语言一致。
 */
const CHANNEL_LABELS: Record<BookChannel, string> = {
  male: '男频',
  female: '女频',
  publish: '出版'
}

export interface BookProfileState {
  /** 拼好的作品设定提示词（无书 / 加载中 / 失败时为空串）。 */
  context: string
  /** 书籍标题（可选，供 UI 展示）。 */
  title: string
  /** 是否有分类（决定开关是否可用）。 */
  hasCategories: boolean
  loading: boolean
}

/** 空态（无书 / 未激活 / 读取失败共用）；同一引用，避免无变化时反复触发渲染。 */
const EMPTY_STATE: BookProfileState = {
  context: '',
  title: '',
  hasCategories: false,
  loading: false
}

/**
 * 章节右栏 AI · 按书惰性加载「作品设定」（书籍元信息 + 分类风格提示）。
 *
 * 链路：`books.get(bookId)` → `categories.list()` → 用 `books.categories`（存的是
 * **`categories.id`**，不是官方 `originId`）在分类树里换成 `CategoryRow` →
 * `getCategoryStyleHint(originId, name)` 取风格句（必须传 `name` 消歧：9 组官方 ID
 * 重复，见 `AMBIGUOUS_ORIGIN_IDS`）→ `buildBookContext` 拼成提示词。
 *
 * - `active === false` 或 `bookId === ''` 时不发请求（面板未打开 / 无书）；
 * - 自定义分类 `originId === null`：`getCategoryStyleHint` 直接返回空串，
 *   于是只参与名称列举、不贡献风格句；
 * - 读取失败静默降级（`EMPTY_STATE`），不阻塞面板（提示词只是锦上添花）；
 * - 每次请求带自增序号 + `cancelled`：切书 / 关面板时旧响应不会覆盖新结果。
 */
export function useBookProfile(bookId: string, active: boolean): BookProfileState {
  const [state, setState] = useState<BookProfileState>(EMPTY_STATE)
  /** 请求序号：只有最新一次请求的结果会被采纳。 */
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = seqRef.current + 1
    seqRef.current = seq

    const api = window.api
    let cancelled = false

    // 异步 IIFE：加载态 / 空态的 setState 不放在 effect 同步段（避免级联渲染告警）。
    void (async () => {
      if (!active || bookId === '' || !api?.books || !api?.categories) {
        setState(EMPTY_STATE)
        return
      }

      setState((prev) => ({ ...prev, loading: true }))

      try {
        const book = await api.books.get(bookId)
        if (cancelled || seq !== seqRef.current) return
        if (book === null) {
          setState(EMPTY_STATE)
          return
        }

        // 分类先整树读回来：书籍侧只存 `categories.id`，名称 / originId 都在分类树里。
        const rows: CategoryRow[] = await api.categories.list()
        if (cancelled || seq !== seqRef.current) return

        const byId = new Map(rows.map((row) => [row.id, row]))
        const picked = book.categories
          .map((id) => byId.get(id))
          .filter((row): row is CategoryRow => row !== undefined)

        const context = buildBookContext({
          channelLabel: book.channel !== null ? CHANNEL_LABELS[book.channel] : null,
          categories: picked.map((row) => ({
            name: row.name,
            // 传 name 消歧：同一 originId 对应多条时（男频「历史」vs「传统武侠」等）精确命中。
            hint: getCategoryStyleHint(row.originId, row.name)
          }))
        })

        if (cancelled || seq !== seqRef.current) return
        setState({
          context,
          title: book.title,
          hasCategories: picked.length > 0,
          loading: false
        })
      } catch (error) {
        if (cancelled || seq !== seqRef.current) return
        log.warn('作品设定读取失败，本次不携带内置提示词', error)
        setState(EMPTY_STATE)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, bookId])

  return state
}

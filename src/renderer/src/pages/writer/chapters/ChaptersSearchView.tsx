import { useTranslation } from 'react-i18next'
import { Button, IconButton, Segmented } from '../../../components/ui'
import SearchReplacePopup from '../../../components/search/SearchReplacePopup'
import { ReplaceIcon } from '../icons'
import type { ChapterSearchHit, ChapterSearchController } from './useChapterSearch'
import { type ChapterRow } from './chapterTree'
import { useChapterLabels } from './useChapterLabels'

export interface ChaptersSearchViewProps {
  /** 搜索 / 替换状态机（由 ChaptersView 提供，含编辑器联动回调）。 */
  controller: ChapterSearchController
  /** 浮窗是否打开（关闭时不渲染内容）。 */
  open: boolean
  /** 关闭浮窗。 */
  onClose: () => void
  /** 同书全部未删除章（命中行展示动态章名 / 组内编号口径）。 */
  chapters: ChapterRow[]
}

const SCOPE_OPTIONS = [
  { value: 'chapter', labelKey: 'search.scopeChapter' },
  { value: 'book', labelKey: 'search.scopeBook' }
] as const

/** 单条命中最多展示的上下文字符数（超出以…省略）。 */
const CONTEXT_MAX = 180

/** 上下文中点：命中起始处前后各取字符，保证命中词可见。 */
function contextWindow(
  context: string,
  start: number,
  end: number
): { before: string; hit: string; after: string } {
  if (context.length <= CONTEXT_MAX) {
    return {
      before: context.slice(0, start),
      hit: context.slice(start, end),
      after: context.slice(end)
    }
  }
  const lead = Math.max(0, start - Math.floor((CONTEXT_MAX - (end - start)) / 2))
  const trail = Math.min(context.length, lead + CONTEXT_MAX)
  const before = (lead > 0 ? '…' : '') + context.slice(lead, start)
  const hit = context.slice(start, end)
  const after = context.slice(end, trail) + (trail < context.length ? '…' : '')
  return { before, hit, after }
}

/**
 * 章节搜索 / 替换浮窗（右上侧）：锚定写作中栏右上角，绝对定位于 `.ep-view[data-view='chapters']`
 * 之内（见 writer-search.css 的 `.ep-search`）。选择在视图内绝对定位而非 portal 的原因：
 * 浮窗随中栏视图一同显隐 / 裁切，无需处理滚动、窗口缩放与 portal 生命周期，且天然层级正确。
 *
 * 结构：头部（标题 + 关闭） / 范围切换（本章 / 全书） / 搜索框 / 替换框 + 替换 / 替换全部 /
 * 结果列表（每行 = 章名 + 命中上下文高亮 + 行尾「替换」按钮）。列表滚动、分页（加载更多）。
 *
 * 外壳（根容器 / 头部 / 输入区 / 三个副作用）由 `components/search/SearchReplacePopup` 共享；
 * 本章独有的范围行、操作按钮与命中列表作为插槽传入。
 */
export default function ChaptersSearchView({
  controller,
  open,
  onClose,
  chapters
}: ChaptersSearchViewProps) {
  const { t } = useTranslation('chapters')
  const labels = useChapterLabels()
  const { t: tCommon } = useTranslation('common')
  const {
    query,
    replacement,
    scope,
    items,
    total,
    hasMore,
    truncated,
    loading,
    busy,
    error,
    active,
    setQuery,
    setReplacement,
    setScope,
    loadMore,
    requestJump,
    replaceOne,
    replaceAll
  } = controller

  const hasQuery = query.trim() !== ''
  const titleOf = (hit: ChapterSearchHit): string => {
    const chapter = chapters.find((row) => row.id === hit.chapterId)
    return chapter ? labels.chapterLabel(chapter) : hit.chapterTitle
  }

  return (
    <SearchReplacePopup
      open={open}
      onClose={onClose}
      title={t('search.title')}
      ariaLabel={t('search.aria')}
      ariaClose={t('search.close')}
      query={query}
      replacement={replacement}
      onQueryChange={setQuery}
      onReplacementChange={setReplacement}
      placeholderSearch={t('search.placeholderSearch')}
      placeholderReplace={t('search.placeholderReplace')}
      ariaSearch={t('search.ariaSearch')}
      ariaReplace={t('search.ariaReplace')}
      scopeRow={
        <div className="ep-search-scope">
          <Segmented
            size="sm"
            options={SCOPE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey)
            }))}
            value={scope}
            aria-label={t('search.rangeAria')}
            onChange={setScope}
          />
          <span className="ep-search-count">
            {hasQuery
              ? loading && items.length === 0
                ? t('search.searching')
                : t('search.count', { total })
              : ''}
          </span>
        </div>
      }
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={!active || busy}
            onClick={() => active && replaceOne(active)}
          >
            {t('search.replace')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasQuery || total === 0 || busy}
            onClick={replaceAll}
          >
            {t('search.replaceAll')}
          </Button>
        </>
      }
    >
      {error !== null ? <div className="ep-search-error">{error}</div> : null}

      <div className="ep-search-results">
        {hasQuery && items.length === 0 && !loading ? (
          <div className="ep-search-empty">{t('search.empty')}</div>
        ) : (
          items.map((hit, index) => {
            const win = contextWindow(hit.context, hit.start, hit.end)
            const isActive = active === hit
            return (
              <div
                key={`${hit.chapterId}-${hit.paragraphIdx}-${hit.start}-${index}`}
                className={`ep-search-row${isActive ? ' is-active' : ''}`}
                onClick={() => requestJump(hit)}
              >
                <span className="ep-search-row-main">
                  <span className="ep-search-row-chapter">{titleOf(hit)}</span>
                  <span className="ep-search-row-context">
                    {win.before}
                    <mark className="ep-search-hit">{win.hit}</mark>
                    {win.after}
                  </span>
                </span>
                <IconButton
                  size="sm"
                  className="row-act ep-search-row-replace"
                  label={t('search.replaceHere')}
                  tooltipPlacement="left"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    replaceOne(hit)
                  }}
                >
                  <ReplaceIcon />
                </IconButton>
              </div>
            )
          })
        )}

        {hasQuery && hasMore ? (
          <button type="button" className="ep-search-more" disabled={loading} onClick={loadMore}>
            {loading ? tCommon('loading') : tCommon('loadMore')}
          </button>
        ) : null}

        {truncated ? (
          <div className="ep-search-note">{t('search.truncated', { total })}</div>
        ) : null}
      </div>
    </SearchReplacePopup>
  )
}

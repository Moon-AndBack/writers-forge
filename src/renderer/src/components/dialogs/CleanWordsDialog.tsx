import { useTranslation } from 'react-i18next'
import { Input, Modal, Segmented, Select } from '../ui'
import { BUILTIN_META } from './cleanWordsMeta'
import '../../styles/components/clean-words.css'
import { CleanWordAddForm } from './CleanWordAddForm'
import { CleanWordsTable } from './CleanWordsTable'
import { useCleanWordsLibrary } from './useCleanWordsLibrary'

/* ============================================================
   违禁词库管理弹窗（标题栏「违禁词库」按钮 / 状态栏命中毒胶囊共用）：本文件只负责
   Modal 外壳与三行布局——筛选（来源 / 类别 / 搜索）、结果（计数 + 词表）、单条添加；
   词表行交给 `CleanWordsTable`，取数与动作交给 `useCleanWordsLibrary`
   （state / 分页常量在 `useCleanWordsLibrary.ts`、`cleanWordsMeta.ts`）。

   列表性能：项目无虚拟列表依赖（853 条全量 DOM 约 2.5 万 px 会明显卡顿），故用
   「三重筛选 + 分批渲染」：筛选把候选集压到单类别上限（当前 436 条）以内，再按
   `PAGE_SIZE` 逐批挂载（首屏 ≤80 行），「显示更多」每次追加一页。

   样式：类名前缀 `cw-`，见 styles/components/clean-words.css（行内控件统一高度
   `--cw-control-h`；分区标题已删除，改用三行天然分组）。管理型弹窗无提交动作，
   故不传 `footer`，关闭入口为头部 ×。
   ============================================================ */

export interface CleanWordsDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * 违禁词库管理弹窗。内置词（`source = 'builtin'`）只能启用 / 禁用，仅用户自建词可删除
 * （与主进程 `deleteCleanWord` 口径一致：内置词删除后会被下次词库更新写回）。
 */
export function CleanWordsDialog({ open, onClose }: CleanWordsDialogProps) {
  const { t } = useTranslation('chapters')
  const library = useCleanWordsLibrary(open)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cleanWords.dialogTitle')}
      size="lg"
      ariaLabel={t('cleanWords.dialogTitle')}
    >
      {library.toastNode}
      <div className="cw-root">
        {/* 行 1. 筛选：来源 / 类别 / 搜索（三件控件同高，见 --cw-control-h） */}
        <div className="cw-filters">
          <Segmented
            size="sm"
            value={library.sourceFilter}
            options={library.sourceOptions}
            aria-label={t('cleanWords.sourceAria')}
            onChange={library.handleSourceChange}
          />
          <div className="cw-filters__category">
            <Select
              size="sm"
              value={library.categoryFilter}
              options={library.categoryOptions}
              ariaLabel={t('cleanWords.categoryAria')}
              onChange={library.handleCategoryChange}
            />
          </div>
          <Input
            size="sm"
            className="cw-filters__search"
            value={library.query}
            aria-label={t('cleanWords.searchAria')}
            placeholder={t('cleanWords.searchPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => library.handleQueryChange(event.target.value)}
          />
        </div>

        {/* 行 2. 结果：计数（合并原统计 Badge）+ 词表 + 内置词表出处 */}
        <div className="cw-results">
          <p className="cw-count" aria-live="polite" aria-atomic="true">
            {t('cleanWords.countSummary', {
              shown: library.visibleRows.length,
              total: library.filtered.length,
              builtin: library.totals.builtin,
              user: library.totals.user
            })}
          </p>
          <p className="cw-meta">
            {t('cleanWords.metaLine', {
              source: BUILTIN_META.source,
              license: BUILTIN_META.license,
              date: BUILTIN_META.fetchedAt
            })}
          </p>
          <CleanWordsTable
            hasActiveFilter={library.hasActiveFilter}
            visibleRows={library.visibleRows}
            total={library.filtered.length}
            loaded={library.loaded}
            failed={library.failed}
            onRowToggle={library.handleRowToggle}
            onDelete={library.handleDelete}
            onShowMore={library.loadMore}
            onRetry={() => void library.refresh()}
          />
        </div>

        {/* 行 3. 单条添加：类别 + 内容 + 添加 */}
        <CleanWordAddForm
          value={library.addText}
          category={library.addCategory}
          categoryOptions={library.addCategoryOptions}
          submitting={library.adding}
          onValueChange={library.setAddText}
          onCategoryChange={library.setAddCategory}
          onSubmit={() => void library.handleAdd()}
        />
      </div>
    </Modal>
  )
}

import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, FormField, Modal, Textarea } from '../ui'
import { BUILTIN_META } from './cleanWordsMeta'
import '../../styles/components/clean-words.css'
import { CleanWordsTable } from './CleanWordsTable'
import { useCleanWordsLibrary } from './useCleanWordsLibrary'

/* ============================================================
   违禁词库管理弹窗（标题栏「违禁词库」按钮 / 状态栏命中毒胶囊共用）：本文件只负责
   Modal 外壳 + 统计 / 导入面板 + 内置词表出处，词表交给 `CleanWordsTable`，取数与动作
   交给 `useCleanWordsLibrary`（state / 分页常量 / 导入解析分别在
   `useCleanWordsLibrary.ts`、`cleanWordsMeta.ts`、`cleanWordsImport.ts`）。

   列表性能：项目无虚拟列表依赖（853 条全量 DOM 约 2.5 万 px 会明显卡顿），故用
   「三重筛选 + 分批渲染」：筛选把候选集压到单类别上限（当前 436 条）以内，再按
   `PAGE_SIZE` 逐批挂载（首屏 ≤80 行），「显示更多」每次追加一页。

   样式：类名前缀 `cw-`，见 styles/components/clean-words.css（分区标题 + 分隔线
   分组，不用软底卡片）。管理型弹窗无提交动作，故不传 `footer`，关闭入口为头部 ×。
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
  // 导入多行文本的 id：供 FormField 的 <label htmlFor> 关联（可见标签只作视觉提示，
  // 读屏名称由 Textarea 独立的 aria-label 提供，不复用「导入 / 收起导入」按钮文案）。
  const importFieldId = useId()

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
        {/* A. 统计 + 导入开关 */}
        <div className="cw-stats">
          <Badge>{t('cleanWords.statsBuiltin', { total: library.totals.builtin })}</Badge>
          <Badge>{t('cleanWords.statsUser', { total: library.totals.user })}</Badge>
          <Button
            size="sm"
            variant="secondary"
            className="cw-stats__toggle"
            onClick={library.toggleImport}
          >
            {library.importOpen ? t('cleanWords.importHide') : t('cleanWords.importToggle')}
          </Button>
        </div>

        {library.importOpen ? (
          <section className="cw-section">
            <h2 className="cw-section__title">{t('cleanWords.importSection')}</h2>
            <FormField
              label={t('cleanWords.importLabel')}
              htmlFor={importFieldId}
              hint={t('cleanWords.importHint')}
            >
              <Textarea
                id={importFieldId}
                size="sm"
                rows={6}
                value={library.importText}
                aria-label={t('cleanWords.importAria')}
                placeholder={t('cleanWords.importPlaceholder')}
                spellCheck={false}
                onChange={(event) => library.setImportText(event.target.value)}
              />
            </FormField>
            <Button
              size="sm"
              variant="primary"
              className="cw-import__confirm"
              loading={library.importing}
              disabled={library.importText.trim() === ''}
              onClick={() => void library.handleImport()}
            >
              {t('cleanWords.importConfirm')}
            </Button>
          </section>
        ) : null}

        {/* B. 筛选 + 列表 */}
        <section className="cw-section">
          <h2 className="cw-section__title">{t('cleanWords.listSection')}</h2>
          <CleanWordsTable
            sourceFilter={library.sourceFilter}
            categoryFilter={library.categoryFilter}
            query={library.query}
            hasActiveFilter={library.hasActiveFilter}
            sourceOptions={library.sourceOptions}
            categoryOptions={library.categoryOptions}
            visibleRows={library.visibleRows}
            total={library.filtered.length}
            loaded={library.loaded}
            failed={library.failed}
            onSourceChange={library.handleSourceChange}
            onCategoryChange={library.handleCategoryChange}
            onQueryChange={library.handleQueryChange}
            onRowToggle={library.handleRowToggle}
            onDelete={library.handleDelete}
            onShowMore={library.loadMore}
            onRetry={() => void library.refresh()}
          />
        </section>

        {/* C. 内置词表来源 / 许可 / 拉取日期 */}
        <p className="cw-meta">
          {t('cleanWords.metaLine', {
            source: BUILTIN_META.source,
            license: BUILTIN_META.license,
            date: BUILTIN_META.fetchedAt
          })}
        </p>
      </div>
    </Modal>
  )
}

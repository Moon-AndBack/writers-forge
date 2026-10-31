import { useTranslation } from 'react-i18next'
import { Button, Modal, Tag, Textarea } from '../ui'
import { BUILTIN_META } from './cleanWordsMeta'
import { styles } from './cleanWordsStyles'
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
  const { t: tCommon } = useTranslation('common')
  const library = useCleanWordsLibrary(open)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cleanWords.dialogTitle')}
      size="lg"
      ariaLabel={t('cleanWords.dialogTitle')}
      footer={
        <Button variant="secondary" style={styles.close} onClick={onClose}>
          {tCommon('close')}
        </Button>
      }
    >
      {library.toastNode}
      <div style={styles.root}>
        {/* A. 统计 + 导入 */}
        <div style={styles.statsRow}>
          <Tag>{t('cleanWords.statsBuiltin', { total: library.totals.builtin })}</Tag>
          <Tag>{t('cleanWords.statsUser', { total: library.totals.user })}</Tag>
          <Button
            size="sm"
            variant={library.importOpen ? 'primary' : 'secondary'}
            style={{ marginLeft: 'auto' }}
            onClick={library.toggleImport}
          >
            {library.importOpen ? t('cleanWords.importHide') : t('cleanWords.importToggle')}
          </Button>
        </div>

        {library.importOpen ? (
          <div style={styles.importBox}>
            <Textarea
              size="sm"
              rows={6}
              value={library.importText}
              aria-label={t('cleanWords.importToggle')}
              placeholder={t('cleanWords.importPlaceholder')}
              spellCheck={false}
              onChange={(event) => library.setImportText(event.target.value)}
            />
            <p style={styles.hint}>{t('cleanWords.importHint')}</p>
            <Button
              size="sm"
              variant="primary"
              style={{ alignSelf: 'flex-end' }}
              loading={library.importing}
              disabled={library.importText.trim() === ''}
              onClick={() => void library.handleImport()}
            >
              {t('cleanWords.importConfirm')}
            </Button>
          </div>
        ) : null}

        {/* B. 筛选 + 列表 */}
        <CleanWordsTable
          sourceFilter={library.sourceFilter}
          categoryFilter={library.categoryFilter}
          query={library.query}
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
        />

        {/* C. 内置词表来源 / 许可 / 拉取日期 */}
        <p style={styles.muted}>
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

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Modal, Segmented, Select } from '../ui'
import { BUILTIN_META } from './cleanWordsMeta'
import { useConfirm } from '../../pages/writer/chapters/useConfirm'
import '../../styles/components/clean-words.css'
import { CleanWordAddForm } from './CleanWordAddForm'
import { CleanWordsTable } from './CleanWordsTable'
import { useCleanWordsLibrary } from './useCleanWordsLibrary'

/* ============================================================
   违禁词库管理弹窗（标题栏「违禁词库」按钮 / 状态栏命中毒胶囊共用）：本文件只负责
   Modal 外壳与三行布局——筛选（来源 / 类别 / 搜索）、结果（计数 + 词表）、单条添加；
   词表行交给 `CleanWordsTable`，取数与动作交给 `useCleanWordsLibrary`
   （state / 分页常量在 `useCleanWordsLibrary.ts`、`cleanWordsMeta.ts`）。

   列表性能：项目无虚拟列表依赖（1274 条全量 DOM 约 4 万 px 会明显卡顿），故用
   「三重筛选 + 分批渲染」：筛选把候选集压到单类别上限（当前 320 条）以内，再按
   `PAGE_SIZE` 逐批挂载（首屏 ≤80 行），「显示更多」每次追加一页。

   样式：类名前缀 `cw-`，见 styles/components/clean-words.css（行内控件统一走
   sm 档 32px，即 --control-h-sm；分区标题已删除，改用三行天然分组）。管理型弹窗无提交动作，
   故不传 `footer`，关闭入口为头部 ×。
   ============================================================ */

export interface CleanWordsDialogProps {
  open: boolean
  onClose: () => void
}

/** 出处行许可证（与 `BUILTIN_META.sources` 同序；静态常量，不进组件状态）。 */
const META_LICENSES = BUILTIN_META.sources.map((source) => source.license).join(' / ')

/**
 * 违禁词库管理弹窗。内置词（`source = 'builtin'`）只能启用 / 禁用，仅用户自建词可删除
 * （与主进程 `deleteCleanWord` 口径一致：内置词删除后会被下次词库更新写回）。
 */
export function CleanWordsDialog({ open, onClose }: CleanWordsDialogProps) {
  const { t } = useTranslation('chapters')
  const library = useCleanWordsLibrary(open)
  const confirm = useConfirm()
  const bulk = library.categoryBulk

  /** 多来源出处：`manual` 走 i18n「自建」，其余来源直接显示 id（与种子 meta 一致）。 */
  const metaSources = useMemo(
    () =>
      BUILTIN_META.sources
        .map((source) => (source.id === 'manual' ? t('cleanWords.metaSourceManual') : source.id))
        .join(' / '),
    [t]
  )

  /** 计数行右侧的批量按钮：确认框带类别名与条数，确认后只操作内置词。 */
  const handleBulkToggle = (): void => {
    if (!bulk) return
    const enable = !bulk.anyEnabled
    confirm.request(
      {
        title: t(enable ? 'cleanWords.categoryEnable' : 'cleanWords.categoryDisable'),
        message: t(
          enable ? 'cleanWords.categoryEnableMessage' : 'cleanWords.categoryDisableMessage',
          { category: bulk.label, count: bulk.count }
        ),
        confirmText: t(
          enable ? 'cleanWords.categoryConfirmEnable' : 'cleanWords.categoryConfirmDisable'
        ),
        tone: enable ? 'default' : 'danger'
      },
      () => bulk.apply(enable)
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cleanWords.dialogTitle')}
      size="lg"
      ariaLabel={t('cleanWords.dialogTitle')}
    >
      {library.toastNode}
      {confirm.node}
      <div className="cw-root">
        {/* 行 1. 筛选：来源 / 类别 / 搜索（三件控件同为 sm 档，高度一致） */}
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

        {/* 行 2. 结果：计数 + 按类别批量启停 + 词表 + 内置词表出处 */}
        <div className="cw-results">
          <div className="cw-count-row">
            <p className="cw-count" aria-live="polite" aria-atomic="true">
              {t('cleanWords.countSummary', {
                shown: library.visibleRows.length,
                total: library.filtered.length,
                builtin: library.totals.builtin,
                user: library.totals.user
              })}
            </p>
            {bulk ? (
              <Button size="sm" variant="ghost" onClick={handleBulkToggle}>
                {bulk.anyEnabled ? t('cleanWords.categoryDisable') : t('cleanWords.categoryEnable')}
              </Button>
            ) : null}
          </div>
          <p className="cw-meta">
            {t('cleanWords.metaLine', {
              sources: metaSources,
              licenses: META_LICENSES,
              date: BUILTIN_META.generatedAt
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

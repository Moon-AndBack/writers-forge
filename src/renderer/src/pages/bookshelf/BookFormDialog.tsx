/**
 * 书籍表单对话框（新建 / 编辑复用）：装配层。
 *
 * 职责收敛（逻辑全部在子模块，本文件只做组装）：
 * - `bookForm/useBookForm`：全部表单 state + 打开沿预填 + 封面 blob 生命周期 +
 *   分类数据拉取 + 提交归一化；
 * - `bookForm/BasicFields`：书名 / 简介 / 状态六态 / 频道 / 篇幅；
 * - `bookForm/CoverPicker`：封面色板 + 预览 + 隐藏 file input（左窄栏竖排；
 *   选择 / 移除按钮在 footer，经 `fileRef` 触发 / `onRemoveCover` 回调）；
 * - 共享 `components/categories/CategoryTreePicker`：分类主 / 子双下拉 + 添加（chips 展示）。
 * - `bookForm/types`：对外类型（`BookFormMode` / `BookFormValues` 等，本文件 re-export
 *   保持既有导入路径 `./bookshelf/BookFormDialog` 零改动）。
 *
 * 持久化由调用方负责（`onSubmit` 收到归一化后的 `BookFormValues`）。
 */
import { useTranslation } from 'react-i18next'
import { Button, FormField, Modal } from '../../components/ui'
import { BasicFields } from './bookForm/BasicFields'
import { CoverPicker } from './bookForm/CoverPicker'
import { useBookForm } from './bookForm/useBookForm'
import type { BookFormInitialValues, BookFormMode, BookFormValues } from './bookForm/types'
import { CategoryTreePicker } from '../../components/categories/CategoryTreePicker'
import '../../styles/book-form.css'

export type { BookFormMode, BookFormInitialValues, BookFormValues } from './bookForm/types'
export type { BookCoverFile } from './bookForm/types'

export interface BookFormDialogProps {
  /** 是否显示 */
  open: boolean
  /** 模式，默认 create（决定标题 / 提交按钮默认文案） */
  mode?: BookFormMode
  /** 书名（编辑模式预填） */
  initialTitle?: string
  /** 其余字段初值（编辑模式传入数据库行） */
  initialValues?: BookFormInitialValues
  /** 编辑目标书籍 id：提供后打开时经 `books.cover.get` 载入封面图 */
  bookId?: string
  /** 覆盖对话框标题（缺省按 mode 取「新建书籍」/「编辑书籍」） */
  title?: string
  /** 覆盖提交按钮文案（缺省按 mode 取「创建」/「保存」） */
  submitLabel?: string
  /** 关闭回调（取消 / 遮罩 / Esc / 关闭按钮触发） */
  onClose: () => void
  /** 提交回调（仅在书名校验通过时触发；提交后由本组件负责关闭） */
  onSubmit: (values: BookFormValues) => void
}

/** 各模式的默认标题 / 提交按钮文案键（i18n `bookshelf` ns）。 */
const DEFAULT_TITLE_KEY: Record<BookFormMode, 'form.titleCreate' | 'form.titleEdit'> = {
  create: 'form.titleCreate',
  edit: 'form.titleEdit'
}
const DEFAULT_SUBMIT_KEY: Record<BookFormMode, 'form.submitCreate' | 'form.submitEdit'> = {
  create: 'form.submitCreate',
  edit: 'form.submitEdit'
}

/**
 * 书籍表单对话框：书名（必填）+ 简介 + 分类（主 / 子双下拉添加）+ 状态六态 +
 * 频道 + 篇幅 + 封面色 + 封面图（可选上传）。作者不在此表单（全局笔名）。
 */
export function BookFormDialog({
  open,
  mode = 'create',
  initialTitle,
  initialValues,
  bookId,
  title,
  submitLabel,
  onClose,
  onSubmit
}: BookFormDialogProps) {
  const { t } = useTranslation('bookshelf')
  const { t: tCommon } = useTranslation('common')

  const form = useBookForm({
    open,
    initialTitle,
    initialValues,
    bookId,
    onClose,
    onSubmit
  })

  const heading = title ?? t(DEFAULT_TITLE_KEY[mode])

  return (
    <Modal
      open={open}
      onClose={form.handleClose}
      title={heading}
      size="lg"
      footer={
        <>
          {/* 封面操作靠左：两项包成一组，作为 footer 首个 flex 项（与右侧取消 / 保存分开） */}
          <div className="bf-footer__left">
            <Button variant="secondary" onClick={() => form.fileRef.current?.click()}>
              {t('form.pickCover')}
            </Button>
            {form.coverUrl ? (
              <Button variant="ghost" className="bf-footer__danger" onClick={form.onRemoveCover}>
                {t('form.removeCover')}
              </Button>
            ) : null}
          </div>
          <span className="bf-footer-spacer" />
          <Button variant="secondary" onClick={form.handleClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            form="book-form"
            variant="primary"
            disabled={form.titleTrimmed === ''}
          >
            {submitLabel ?? t(DEFAULT_SUBMIT_KEY[mode])}
          </Button>
        </>
      }
    >
      <form
        id="book-form"
        className="bf-form"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <div className="bf-body">
          <CoverPicker
            coverColor={form.coverColor}
            setCoverColor={form.setCoverColor}
            coverUrl={form.coverUrl}
            coverChar={form.coverChar}
            fileRef={form.fileRef}
            onCoverPick={form.onCoverPick}
          />

          <div className="bf-body__fields">
            <BasicFields form={form} />

            <FormField label={t('form.categories')} hint={t('form.categoriesHint')}>
              <CategoryTreePicker
                categories={form.categories}
                selectedIds={form.selectedCategoryIds}
                channel={form.channel}
                onAdd={form.onAddCategory}
                onRemove={form.onRemoveCategory}
                onReload={form.reloadCategories}
                loadError={form.loadError}
                selectedAriaLabel={t('form.categoriesAria')}
                loadErrorText={t('categoryTree.loadError')}
                retryText={t('categoryTree.retry')}
              />
            </FormField>
          </div>
        </div>
      </form>
    </Modal>
  )
}

BookFormDialog.displayName = 'BookFormDialog'

export default BookFormDialog

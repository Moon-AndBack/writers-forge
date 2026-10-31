/**
 * 书籍表单状态 hook：`BookFormDialog` 的全部受控 state 与派生逻辑。
 *
 * 职责（自 `BookFormDialog.tsx` 迁入，逻辑不变）：
 * - 文本字段（书名 / 简介）与封面（色 / 图 blob / 移除标记）state；
 * - 「关闭 → 打开」沿上按初值预填（避免打开期间被父组件新对象引用反复覆盖）；
 * - 封面 blob URL 生命周期（替换 / 清空 / 卸载即 revoke）与文件读取；
 * - 编辑模式经 `books.cover.get` 载入已有封面图；
 * - 分类树数据拉取（`categories:list`，无 API / 失败回退空表）；
 * - 分类多选 / 切频道清空（用户拍板：一本书只属一个频道体系）；
 * - 提交归一化（书名 trim 必填）。
 *
 * 作者不再是表单字段：全局以 `settings.penName` 呈现（卡片 / 搜索），本 hook 不涉及。
 * 纯展示由 `BasicFields` / `CoverPicker` / 共享 `CategoryTreePicker` 承担。
 */
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { DEFAULT_COVER_COLOR } from '../bookMeta'
import type { CategoryRow } from '../../../../../main/database/categories'
import type {
  BookChannel,
  BookCoverFile,
  BookFormInitialValues,
  BookFormValues,
  BookLength,
  BookStatus
} from './types'

/** hook 入参：`BookFormDialog` 的 props 中与本域相关的部分。 */
export interface UseBookFormParams {
  open: boolean
  initialTitle?: string
  initialValues?: BookFormInitialValues
  bookId?: string
  /** 提交回调（仅在书名校验通过时触发；调用后由 dialog 层关闭） */
  onSubmit: (values: BookFormValues) => void
  /** 关闭回调：hook 复位内部状态后透传（取消 / 遮罩 / Esc / 提交后统一走此路径） */
  onClose: () => void
}

/** hook 出参：装配层渲染所需的全部 state 与回调。 */
export interface UseBookFormResult {
  titleValue: string
  setTitleValue: (value: string) => void
  onTitleBlur: () => void
  intro: string
  setIntro: (value: string) => void
  status: BookStatus
  setStatus: (value: BookStatus) => void
  channel: BookChannel | null
  setChannel: (value: BookChannel | null) => void
  lengthType: BookLength | null
  setLengthType: (value: BookLength | null) => void
  coverColor: string
  setCoverColor: (value: string) => void
  coverUrl: string | null
  coverChar: string
  fileRef: React.RefObject<HTMLInputElement | null>
  categories: CategoryRow[]
  loadError: boolean
  /** 已选分类 ID 集合（主 = 一级 ID，子 = 二级 ID，仍为 number[]） */
  selectedCategoryIds: number[]
  /** 添加一个分类条目（主类 + 可选子类；childId 为 null 表示「主」形态） */
  onAddCategory: (parentId: number, childId: number | null) => void
  /** 移除一个已选分类（chips 关闭按钮） */
  onRemoveCategory: (id: number) => void
  /** 切换频道：清空已选分类（两套分类体系不兼容，用户拍板） */
  onSelectChannel: (channel: BookChannel | null) => void
  /** 分类树重试拉取（loadError 为 true 时展示） */
  reloadCategories: () => void
  /** 封面图文件选择（input change） */
  onCoverPick: (event: ChangeEvent<HTMLInputElement>) => void
  /** 移除已选 / 已上传封面图 */
  onRemoveCover: () => void
  titleTrimmed: string
  showError: boolean
  handleClose: () => void
  handleSubmit: () => void
}

export function useBookForm({
  open,
  initialTitle,
  initialValues,
  bookId,
  onSubmit,
  onClose
}: UseBookFormParams): UseBookFormResult {
  const [titleValue, setTitleValue] = useState(initialTitle ?? '')
  const [intro, setIntro] = useState(initialValues?.intro ?? '')
  const [status, setStatus] = useState<BookStatus>(initialValues?.status ?? 'writing')
  const [channel, setChannel] = useState<BookChannel | null>(initialValues?.channel ?? null)
  const [lengthType, setLengthType] = useState<BookLength | null>(initialValues?.lengthType ?? null)
  const [selectedIds, setSelectedIds] = useState<number[]>(initialValues?.categories ?? [])
  const [coverColor, setCoverColor] = useState(initialValues?.coverColor ?? DEFAULT_COVER_COLOR)
  const [coverFile, setCoverFile] = useState<BookCoverFile | null>(null)
  const [removeCover, setRemoveCover] = useState(false)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Blob URL 生命周期：URL 一旦被替换 / 清空 / 组件卸载即 revoke，避免内存泄漏。
  // 相比手动在读写两处 revoke，交给 effect 只需追踪「当前 URL」，逻辑更集中。
  useEffect(() => {
    if (!coverUrl) return undefined
    return () => URL.revokeObjectURL(coverUrl)
  }, [coverUrl])

  // 仅在「关闭 → 打开」的沿上按初值预填，避免打开期间被父组件的新对象引用
  // 反复覆盖用户正在编辑的内容（渲染期同步重置，无「可见但仍为空」的竞态）。
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setTitleValue(initialTitle ?? '')
      setIntro(initialValues?.intro ?? '')
      setStatus(initialValues?.status ?? 'writing')
      setChannel(initialValues?.channel ?? null)
      setLengthType(initialValues?.lengthType ?? null)
      setSelectedIds(initialValues?.categories ?? [])
      setCoverColor(initialValues?.coverColor ?? DEFAULT_COVER_COLOR)
      setCoverFile(null)
      setRemoveCover(false)
      setTouched(false)
      setCoverUrl(null)
    }
  }

  // 编辑模式：打开时载入已有封面图（无 API / 无封面时静默跳过）。
  useEffect(() => {
    if (!open || !bookId) return undefined
    const api = window.api?.books?.cover
    if (!api) return undefined

    let active = true
    api
      .get(bookId)
      .then((payload) => {
        if (!active || !payload) return
        const blob = new Blob([new Uint8Array(payload.data)], { type: payload.mime })
        setCoverUrl(URL.createObjectURL(blob))
      })
      .catch(() => {
        /* 读取失败静默忽略：回退封面字 + 渐变 */
      })

    return () => {
      active = false
    }
  }, [open, bookId])

  // ---------- 分类树数据（categories:list） ----------

  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([])
  const [loadError, setLoadError] = useState(false)

  const fetchCategories = (): void => {
    const api = window.api?.categories
    if (!api) return
    api
      .list()
      .then((rows) => {
        setCategoryRows(rows)
        setLoadError(false)
      })
      .catch(() => {
        setLoadError(true)
      })
  }

  // 打开时拉一次；失败可经「重试」再拉（对话框重开也会重新尝试）。
  useEffect(() => {
    if (!open) return
    fetchCategories()
  }, [open])

  /**
   * 添加一个分类条目（主类 + 可选子类）：
   * - key = (parentId, childId)；`childId === null` 表示「主」形态，落库值为 `parentId`；
   * - 去重：同一条目已存在则忽略；
   * - 「加主则禁其子」：该主已以「主」形态加入时，不再加入其子；
   * - 「同主不混形态」：该主已有子形态时，不再加入「主」形态。
   */
  const handleAddCategory = (parentId: number, childId: number | null): void => {
    setSelectedIds((prev) => {
      if (childId === null) {
        if (prev.includes(parentId)) return prev
        const hasChild = categoryRows.some(
          (row) => row.parentId === parentId && prev.includes(row.id)
        )
        return hasChild ? prev : [...prev, parentId]
      }
      if (prev.includes(parentId) || prev.includes(childId)) return prev
      return [...prev, childId]
    })
  }

  /** 移除一个已选分类（chips 关闭按钮）。 */
  const handleRemoveCategory = (id: number): void => {
    setSelectedIds((prev) => prev.filter((selected) => selected !== id))
  }

  /**
   * 切换频道：**清空官方分类选择**（男频 / 女频是两套不兼容的分类体系，用户拍板）。
   * 自定义分类**自成一套**，不随频道切换清空，故予以保留。
   */
  const handleSelectChannel = (next: BookChannel | null): void => {
    setChannel(next)
    setSelectedIds((prev) =>
      prev.filter((id) => categoryRows.some((row) => row.id === id && row.isCustom))
    )
  }

  // ---------- 提交 / 关闭 ----------

  const trimmedTitle = titleValue.trim()
  const showError = touched && trimmedTitle === ''

  const handleCoverPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    // 重置 input，允许再次选择同一文件
    event.target.value = ''
    if (!file) return
    setCoverUrl(URL.createObjectURL(file))
    setRemoveCover(false)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (!(result instanceof ArrayBuffer)) return
      setCoverFile({ mime: file.type || 'image/png', data: new Uint8Array(result) })
    }
    reader.readAsArrayBuffer(file)
  }

  const handleRemoveCover = (): void => {
    setCoverUrl(null)
    setCoverFile(null)
    setRemoveCover(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  // 统一关闭路径：先复位封面 URL，再通知外部关闭，保证再次打开无残留。
  const handleClose = (): void => {
    setCoverUrl(null)
    setCoverFile(null)
    setTouched(false)
    onClose()
  }

  const handleSubmit = (): void => {
    if (trimmedTitle === '') {
      setTouched(true)
      return
    }
    const selectedRows = categoryRows.filter((row) => selectedIds.includes(row.id))
    onSubmit({
      title: trimmedTitle,
      intro: intro.trim(),
      categories: selectedRows.map((row) => row.id),
      status,
      channel,
      lengthType,
      coverColor,
      coverFile,
      removeCover
    })
    handleClose()
  }

  return {
    titleValue,
    setTitleValue,
    onTitleBlur: () => setTouched(true),
    intro,
    setIntro,
    status,
    setStatus,
    channel,
    setChannel: handleSelectChannel,
    lengthType,
    setLengthType,
    coverColor,
    setCoverColor,
    coverUrl,
    coverChar: trimmedTitle.slice(0, 1),
    fileRef,
    categories: categoryRows,
    loadError,
    selectedCategoryIds: selectedIds,
    onAddCategory: handleAddCategory,
    onRemoveCategory: handleRemoveCategory,
    onSelectChannel: handleSelectChannel,
    reloadCategories: fetchCategories,
    onCoverPick: handleCoverPick,
    onRemoveCover: handleRemoveCover,
    titleTrimmed: trimmedTitle,
    showError,
    handleClose,
    handleSubmit
  }
}

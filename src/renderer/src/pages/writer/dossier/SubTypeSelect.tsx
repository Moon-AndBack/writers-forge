import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select } from '../../../components/ui'
import { createLogger } from '@renderer/lib/log'
import type { WorldEntityType } from '../../../../../preload/types/worldEntity'
import type { WorldSubtypeRow } from '../../../../../preload/types/worldSubtype'
import ConfirmDialog from '../ConfirmDialog'

/** 子类分类数据访问失败 / 建类失败的本地日志（转发主进程落盘）。 */
const log = createLogger('dossier')

export interface SubTypeSelectProps {
  /** 当前书 id（分类表按书隔离）。 */
  bookId: string
  /** 实体类型（分类表按 `entity_type` 过滤）。 */
  entityType: WorldEntityType
  /** 当前子类分类 id（null = 历史未分类数据，仅作占位展示）。 */
  value: number | null
  /** 选中 / 新建后回调（回传分类 id；null 仅用于删除当前分类后的复位）。 */
  onChange: (value: number | null) => void
  /** 删除当前自定义分类（软删该分类下条目 + 分类行）。 */
  onDeleteSubType?: (subtypeId: number) => void | Promise<void>
  /** 当前子类下的条目数（用于确认文案）。 */
  affectedCount?: number
  /** Select 占位文案。 */
  selectPlaceholder?: string
  /** 新增分类输入占位文案。 */
  addPlaceholder?: string
}

/**
 * 子类选择器（第 4 批）：选项来自 `worldSubtype:list`（当前书 + 当前实体类型），
 * 显示分类名、值为分类 id；不再提供「未分类」选项（类别为必填），历史 `null`
 * 数据仅以占位文案展示，无法回选 `null`。
 *
 * 底部「新增分类」输入回车即调用 `worldSubtype:create`（`isCustom: 1`）建行并选中；
 * 仅自定义分类（`isCustom = 1`）可删除，删除前二次确认（同分类下条目一并软删）。
 * 通用组件：世界观 / 势力 / 物品功法三域共用，差异全部经 props 表达（§9）。
 */
export default function SubTypeSelect({
  bookId,
  entityType,
  value,
  onChange,
  onDeleteSubType,
  affectedCount,
  selectPlaceholder,
  addPlaceholder
}: SubTypeSelectProps) {
  const { t } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')
  const [rows, setRows] = useState<WorldSubtypeRow[]>([])
  const [custom, setCustom] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  // 换书 / 换域时重新拉取分类；卸载后丢弃回包（避免对已卸载组件 setState）。
  useEffect(() => {
    if (bookId === '') return undefined
    const api = window.api?.worldSubtype
    if (!api) return undefined
    let cancelled = false
    void (async () => {
      try {
        const list = await api.list(bookId, entityType)
        if (cancelled) return
        setRows(list)
      } catch (error) {
        log.warn('子类分类加载失败', error)
        if (cancelled) return
        setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId, entityType])

  const selected = useMemo(() => rows.find((row) => row.id === value) ?? null, [rows, value])
  const isCustom = selected !== null && selected.isCustom === 1

  const options = useMemo(
    () => rows.map((row) => ({ value: String(row.id), label: row.name })),
    [rows]
  )

  const handleSelect = (next: string): void => {
    // 选项全部来自分类表（非空 id）；不再提供清空为 `null` 的入口。
    if (next === '') return
    onChange(Number(next))
  }

  const handleAdd = async (): Promise<void> => {
    const name = custom.trim()
    if (name === '' || creating) return
    const api = window.api?.worldSubtype
    if (!api) return
    setCreating(true)
    try {
      const nextSort = rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1
      const created = await api.create({
        bookId,
        entityType,
        name,
        isCustom: 1,
        sortOrder: nextSort
      })
      if (created === null) {
        log.warn('新建子类失败（重名或入参非法）', { bookId, entityType, name })
        return
      }
      setRows((prev) => [...prev, created])
      onChange(created.id)
      setCustom('')
    } catch (error) {
      log.warn('新建子类失败', error)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteConfirm = async (): Promise<void> => {
    const target = selected
    setDeleteConfirmOpen(false)
    if (!target || target.isCustom !== 1) return
    const api = window.api?.worldSubtype
    try {
      await onDeleteSubType?.(target.id)
      await api?.delete(target.id)
      setRows((prev) => prev.filter((row) => row.id !== target.id))
      onChange(null)
    } catch (error) {
      log.warn('删除子类失败', error)
    }
  }

  return (
    <div className="dossier-subtype">
      <div className="dossier-subtype__select-row">
        <Select
          value={value === null ? '' : String(value)}
          onChange={handleSelect}
          options={options}
          placeholder={
            value === null
              ? t('subTypeUncategorized')
              : (selectPlaceholder ?? t('createDialog.subTypePlaceholder'))
          }
        />
        <Button
          variant="danger"
          size="sm"
          disabled={!isCustom}
          onClick={() => setDeleteConfirmOpen(true)}
        >
          {t('createDialog.deleteSubType')}
        </Button>
      </div>
      <div className="dossier-subtype__add">
        <Input
          value={custom}
          placeholder={addPlaceholder ?? t('createDialog.addSubTypePlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleAdd()
            }
          }}
        />
        <Button
          variant="ghost"
          size="md"
          onClick={() => void handleAdd()}
          disabled={custom.trim() === '' || creating}
        >
          {t('createDialog.addSubType')}
        </Button>
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeleteConfirm()}
        title={t('createDialog.deleteSubTypeTitle')}
        message={t('createDialog.deleteSubTypeMessage', {
          name: selected?.name ?? '',
          count: affectedCount ?? 0
        })}
        confirmText={tCommon('confirm')}
        cancelText={tCommon('cancel')}
      />
    </div>
  )
}

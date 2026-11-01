/**
 * 设置页 · 自定义分类管理（新增 / 重命名 / 删除）。
 *
 * 落点说明（详见交付报告「UI 落点判定」）：自定义分类是**全局共享**数据（不按书隔离），
 * 故管理入口置于设置弹窗（标题栏齿轮唤起）。弹窗内再弹二次确认（删除分类）时，
 * `Modal` 的 ESC 栈 / 焦点 trap 只作用于栈顶，故一次 Esc 只关一层，不会连带关掉设置。
 * 书籍表单的 `CategoryTreePicker` 仅负责「我的分类」分组的选择展示。
 *
 * 交互：
 * - 新增：输入框 + 「添加」；与**任何**现有分类（含官方）重名 → 行内报错；
 * - 重命名：行内切换为输入框（Enter 提交 / Esc 取消）；
 * - 删除：二次确认（复用 `useConfirm`）；被书籍引用时主进程回传占用书数，
 *   此处以行内 alert 提示「已被 N 本书使用，无法删除」，不产出主进程文案。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, useToast } from '../../components/ui'
import { useConfirm } from '../writer/chapters/useConfirm'
import SectionCard from './SectionCard'
import type { CategoryRow } from '../../../../main/database/categories'
import '../../styles/components/category-manager.css'

export default function CategoriesSection() {
  const { t } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')
  const api = window.api?.categories

  const [rows, setRows] = useState<CategoryRow[]>([])
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [renameError, setRenameError] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const renameRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const confirm = useConfirm()

  const load = useCallback((): void => {
    if (!api) return
    api
      .list()
      .then(setRows)
      .catch(() => {
        /* 读取失败静默忽略：保留现有列表 */
      })
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  // 进入重命名态后把焦点移入输入框（不用 autoFocus，规避无障碍 lint）。
  useEffect(() => {
    if (editingId !== null) renameRef.current?.focus()
  }, [editingId])

  const customRows = rows.filter((row) => row.isCustom && row.parentId === null)

  const handleCreate = (): void => {
    const name = newName.trim()
    if (name === '' || !api || busy) return
    setBusy(true)
    setCreateError(false)
    setNotice(null)
    api
      .create({ name })
      .then((created) => {
        if (created) {
          setNewName('')
          load()
        } else {
          setCreateError(true)
        }
      })
      .catch(() => setCreateError(true))
      .finally(() => setBusy(false))
  }

  const handleStartRename = (row: CategoryRow): void => {
    setEditingId(row.id)
    setEditingName(row.name)
    setRenameError(false)
    setNotice(null)
  }

  const handleCancelRename = (): void => {
    setEditingId(null)
    setEditingName('')
    setRenameError(false)
  }

  const handleCommitRename = (): void => {
    if (editingId === null || !api || busy) return
    const name = editingName.trim()
    if (name === '') {
      setRenameError(true)
      return
    }
    setBusy(true)
    setRenameError(false)
    api
      .rename(editingId, name)
      .then((updated) => {
        if (updated) {
          setEditingId(null)
          load()
        } else {
          setRenameError(true)
        }
      })
      .catch(() => setRenameError(true))
      .finally(() => setBusy(false))
  }

  const handleDelete = (row: CategoryRow): void => {
    if (!api) return
    setNotice(null)
    confirm.request(
      {
        title: t('categories.deleteConfirmTitle'),
        message: t('categories.deleteConfirmMessage', { name: row.name }),
        confirmText: t('categories.delete'),
        tone: 'danger'
      },
      async () => {
        try {
          const result = await api.delete(row.id)
          if (result.ok) {
            toast.show(t('categories.deletedToast', { name: row.name }))
            load()
          } else if (result.reason === 'inUse') {
            setNotice(t('categories.inUse', { count: result.usageCount }))
          } else {
            setNotice(t('categories.deleteFailed'))
          }
        } catch {
          setNotice(t('categories.deleteFailed'))
        }
      }
    )
  }

  return (
    <SectionCard title={t('categories.title')} description={t('categories.description')}>
      <div className="cm">
        <div className="cm-create">
          <Input
            size="sm"
            className="cm-create__input"
            value={newName}
            placeholder={t('categories.placeholder')}
            aria-label={t('categories.placeholder')}
            invalid={createError}
            onChange={(event) => {
              setNewName(event.target.value)
              setCreateError(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleCreate()
              }
            }}
          />
          <Button
            size="sm"
            variant="primary"
            onClick={handleCreate}
            disabled={newName.trim() === '' || !api}
            loading={busy && editingId === null}
          >
            {t('categories.add')}
          </Button>
        </div>

        {createError ? (
          <p className="cm-error" role="alert">
            {t('categories.duplicate')}
          </p>
        ) : null}
        {notice ? (
          <p className="cm-error" role="alert">
            {notice}
          </p>
        ) : null}

        {customRows.length === 0 ? (
          <p className="cm-empty">{t('categories.empty')}</p>
        ) : (
          <ul className="cm-list">
            {customRows.map((row) => (
              <li key={row.id} className="cm-item">
                {editingId === row.id ? (
                  <div className="cm-rename">
                    <Input
                      ref={renameRef}
                      size="sm"
                      className="cm-rename__input"
                      value={editingName}
                      invalid={renameError}
                      aria-label={t('categories.renameAria', { name: row.name })}
                      onChange={(event) => {
                        setEditingName(event.target.value)
                        setRenameError(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleCommitRename()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          handleCancelRename()
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleCommitRename}
                      disabled={busy}
                    >
                      {tCommon('save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelRename}>
                      {tCommon('cancel')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="cm-item__name">{row.name}</span>
                    <div className="cm-item__actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('categories.renameAria', { name: row.name })}
                        onClick={() => handleStartRename(row)}
                      >
                        {t('categories.rename')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('categories.deleteAria', { name: row.name })}
                        onClick={() => handleDelete(row)}
                      >
                        {t('categories.delete')}
                      </Button>
                    </div>
                  </>
                )}
                {editingId === row.id && renameError ? (
                  <p className="cm-error" role="alert">
                    {t('categories.duplicate')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirm.node}
      {toast.node}
    </SectionCard>
  )
}

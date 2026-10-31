import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input, Modal } from '../../../components/ui'
import { useModuleLabel } from '../../../shell/activityBarModules'
import type { DossierCreateInput, DossierModule, DossierRow } from './dossierTree'
import { MODULE_ENTITY_TYPE, MODULE_HAS_SUBTYPE } from './dossierTree'
import SubTypeSelect from './SubTypeSelect'

export interface DossierCreateDialogProps {
  /** 所属域（决定标题中的模块名）。 */
  module: DossierModule
  /** 当前书 id（子类分类按书隔离）。 */
  bookId: string
  /** 同域未删除列表行（用于同子类条目数提示）。 */
  rows?: DossierRow[]
  /** 删除自定义子类回调（子类选择器使用）。 */
  onDeleteSubType?: (subtypeId: number) => void | Promise<void>
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 提交新建（名称必填；返回新行 id 供调用方决定是否进入编辑器）。 */
  onSubmit: (input: DossierCreateInput) => void | Promise<number | null>
}

/**
 * 设定档案「新建」弹窗（五域共用，按 module 参数化）。
 * 世界观 / 角色 / 势力 / 物品功法显示子类选择器（选项来自分类表，可新增自定义子类）；
 * 角色预设为 主角 / 配角 / 龙套 / 反派；境界体系仅填名称。
 */
export default function DossierCreateDialog({
  module,
  bookId,
  rows = [],
  onDeleteSubType,
  onClose,
  onSubmit
}: DossierCreateDialogProps) {
  const { t } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')
  const moduleLabel = useModuleLabel(module)
  const [name, setName] = useState('')
  const [subtypeId, setSubtypeId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const showSubType = MODULE_HAS_SUBTYPE[module]

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回输入框（与 PlotLineDialog 一致）。
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const canSubmit = name.trim() !== '' && (!showSubType || subtypeId !== null)
  const dialogTitle = t('createDialog.title', { module: moduleLabel })

  const submit = (): void => {
    if (name.trim() === '') return
    if (showSubType && subtypeId === null) return
    // 境界体系不显示选择器，由主进程自动落默认预设分类（不传 null）。
    void onSubmit({
      name: name.trim(),
      ...(showSubType ? { subtypeId } : {})
    })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={dialogTitle}
      size="sm"
      ariaLabel={dialogTitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            {tCommon('confirm')}
          </Button>
        </>
      }
    >
      <div className="dossier-dialog">
        {showSubType ? (
          <FormField
            label={t('createDialog.subTypeLabel')}
            required
            error={subtypeId === null ? t('subTypeRequired') : undefined}
          >
            <SubTypeSelect
              bookId={bookId}
              entityType={MODULE_ENTITY_TYPE[module]}
              value={subtypeId}
              onChange={setSubtypeId}
              onDeleteSubType={onDeleteSubType}
              affectedCount={rows.filter((row) => row.subtypeId === subtypeId).length}
            />
          </FormField>
        ) : null}

        <FormField label={t('createDialog.nameLabel')} htmlFor="dossier-create-name" required>
          <Input
            ref={inputRef}
            id="dossier-create-name"
            value={name}
            placeholder={t('createDialog.namePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
        </FormField>
      </div>
    </Modal>
  )
}

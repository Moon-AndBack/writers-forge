import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input, Modal } from '../../../components/ui'
import { useModuleLabel } from '../../../shell/activityBarModules'
import AliasEditor from './AliasEditor'
import SubTypeSelect from './SubTypeSelect'
import type { DossierModule, DossierRow, DossierUpdatePatch } from './dossierTree'
import { MODULE_ENTITY_TYPE, MODULE_HAS_SUBTYPE } from './dossierTree'

export interface DossierEditDialogProps {
  /** 所属域（决定标题中的模块名与是否显示类别选择器）。 */
  module: DossierModule
  /** 当前书 id（类别按书隔离）。 */
  bookId: string
  /** 待编辑行（名字 / 别名 / 子类初值）。 */
  row: DossierRow
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 提交更新补丁（仅名字 / 别名 / 类别）。 */
  onSubmit: (patch: DossierUpdatePatch) => void
}

/**
 * 设定档案「编辑」弹窗（五域共用，按 module 参数化）：
 * 只编辑名字 / 类别 / 别名（类别按域必填，角色可选 主角 / 配角 / 龙套 / 反派，境界体系隐藏选择器）；
 * 关联关系已拆到卡片上的独立「关联关系」按钮（`DossierRelationsDialog`），
 * 本弹窗不再承载关系区。
 * 五域卡片均挂本入口；境界体系无类别选择器，改名称 / 别名即可。
 */
export default function DossierEditDialog({
  module,
  bookId,
  row,
  onClose,
  onSubmit
}: DossierEditDialogProps) {
  const { t } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')
  const moduleLabel = useModuleLabel(module)
  const [name, setName] = useState(row.name)
  const [aliases, setAliases] = useState<string[]>(row.aliases)
  const [subtypeId, setSubtypeId] = useState<number | null>(row.subtypeId)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回输入框（与 DossierCreateDialog 一致）。
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const showSubType = MODULE_HAS_SUBTYPE[module]
  const requireSubType = showSubType

  const canSubmit = name.trim() !== '' && (!requireSubType || subtypeId !== null)

  const submit = (): void => {
    if (!canSubmit) return
    if (showSubType) {
      onSubmit({ name: name.trim(), aliases, subtypeId })
    } else {
      onSubmit({ name: name.trim(), aliases })
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('editDialog.title', { module: moduleLabel })}
      size="md"
      ariaLabel={t('editDialog.title', { module: moduleLabel })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            {tCommon('confirm')}
          </Button>
        </>
      }
    >
      <div className="dossier-dialog">
        <FormField label={t('editDialog.nameLabel')} htmlFor="dossier-edit-name" required>
          <Input
            ref={inputRef}
            id="dossier-edit-name"
            value={name}
            placeholder={t('editDialog.namePlaceholder')}
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

        {showSubType ? (
          <FormField
            label={t('editDialog.subTypeLabel')}
            required
            error={requireSubType && subtypeId === null ? t('subTypeRequired') : undefined}
          >
            <SubTypeSelect
              bookId={bookId}
              entityType={MODULE_ENTITY_TYPE[module]}
              value={subtypeId}
              onChange={setSubtypeId}
              deleteLockedSubtypeId={row.subtypeId}
            />
          </FormField>
        ) : null}

        <FormField label={t('editDialog.aliasesLabel')}>
          <AliasEditor
            value={aliases}
            placeholder={t('editDialog.aliasesPlaceholder')}
            addLabel={t('editDialog.addAlias')}
            inputAriaLabel={t('editDialog.aliasesLabel')}
            emptyText={t('detail.emptyValue')}
            onChange={setAliases}
          />
        </FormField>
      </div>
    </Modal>
  )
}

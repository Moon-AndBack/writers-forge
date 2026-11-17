import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirm } from '@renderer/components/ui/useConfirm'
import {
  useForeshadowDeleteImpact,
  withDeleteImpactWarning
} from '../foreshadow/useForeshadowDeleteImpact'
import type { VolumeRow } from '../chapters/chapterTree'
import { useVolumeDeleteImpact } from '../volumes/useVolumeDeleteImpact'
import VolumeGroupRow from '../volumes/VolumeGroupRow'
import type { TreeExpansion } from '../useTreeExpansion'
import {
  outlineItemLabel,
  type OutlineItemRow,
  type OutlineNonVolumeEntry,
  type OutlineSelection
} from './outlineTree'
import OutlineChapterRowItem from './OutlineChapterRowItem'

export interface OutlineNonVolumeListProps {
  /** 父级（`OutlinePanel`）统一持有的卷 / 分组展开态（与卷区共用，§9 不另持一套）。 */
  expansion: TreeExpansion
  /** 置顶区顶层条目（独立条目 + 分组容器；独立条目在前、分组容器在后）。 */
  entries: OutlineNonVolumeEntry[]
  /** 当前大纲编辑选中态（页面层持有，与中栏编辑器共享）。 */
  activeSelection: OutlineSelection | null
  /** 大纲编辑目标打开回调（条目 / 分组行点击 → 中栏编辑）。 */
  onOpenTarget: (selection: OutlineSelection) => void
  /** 重命名**独立条目**（走条目通道 `outline:rename`）。 */
  onRenameItem: (id: number, title: string) => void
  /** 重命名**分组容器**（分组即卷行，走卷通道 `renameVolume`）。 */
  onRenameGroup: (id: number, title: string) => void
  /** 软删除分组容器（连带软删其下条目）。 */
  onDeleteGroup: (id: number) => void
  /** 软删除条目（走条目级 `outline:delete`）。 */
  onDeleteChapter: (id: number) => void
  /** 在指定分组容器下新建条目（分组即卷，与卷下新建同通道）。 */
  onCreateEntryInGroup: (groupId: number) => void
}

/**
 * 大纲左栏**置顶区**：顶层为「独立条目」（`volumeId === null`）或「分组容器」
 * （`volumes.kind='group'`）两类，独立条目在前、分组容器在后。
 *
 * - **独立条目**：点击 → 打开中栏编辑（`onOpenTarget({ kind: 'entry' })`）；
 * - **分组容器**：**点击分组行 = 打开编辑器并展开**（分组名纯展示）；折叠仅由箭头按钮控制；
 *   改名仅由 hover 铅笔按钮进入内联改名（走卷通道）；hover 另有「在分组下新建条目」与「删除分组」；
 *   分组不可嵌套（其下仅条目）。
 *
 * 注：独立条目与分组容器的 id 分属两个空间（`outline_items` / `volumes`），故内联改名态
 * **分开持有**，避免 id 撞号串态。
 */
export default function OutlineNonVolumeList({
  expansion,
  entries,
  activeSelection,
  onOpenTarget,
  onRenameItem,
  onRenameGroup,
  onDeleteGroup,
  onDeleteChapter,
  onCreateEntryInGroup
}: OutlineNonVolumeListProps) {
  const { t } = useTranslation('outline')
  // 内联改名态：条目 / 分组各持一套（id 空间不同，不可共用）。
  const [itemRenamingId, setItemRenamingId] = useState<number | null>(null)
  const [groupRenamingId, setGroupRenamingId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  // 已结算标记：Enter / Escape 提交或取消后，避免随后的 blur 再次提交（双写）。
  const itemSettled = useRef(false)
  const groupSettled = useRef(false)
  const confirm = useConfirm()
  // 删除确认前的双埋点伏笔查询（软删：伏笔保留，仅此处锚点失效）。
  const { inspect: inspectForeshadowImpact } = useForeshadowDeleteImpact()
  // 删除分组前的条目数预检（查询失败回退静态文案，不阻断删除）。
  const { inspect: inspectVolumeDeleteImpact } = useVolumeDeleteImpact()

  const beginRenameItem = useCallback((item: OutlineItemRow): void => {
    setItemRenamingId(item.id)
    setDraftName(item.title)
    itemSettled.current = false
  }, [])

  const settleRenameItem = useCallback(
    (item: OutlineItemRow, commit: boolean): void => {
      if (itemSettled.current) return
      itemSettled.current = true
      const next = draftName.trim()
      setItemRenamingId(null)
      if (!commit) return
      if (next === item.title.trim()) return
      onRenameItem(item.id, next)
    },
    [draftName, onRenameItem]
  )

  const beginRenameGroup = useCallback((volume: VolumeRow): void => {
    setGroupRenamingId(volume.id)
    setDraftName(volume.title)
    groupSettled.current = false
  }, [])

  const settleRenameGroup = useCallback(
    (volume: VolumeRow, commit: boolean): void => {
      if (groupSettled.current) return
      groupSettled.current = true
      const next = draftName.trim()
      setGroupRenamingId(null)
      if (!commit) return
      if (next === volume.title) return
      onRenameGroup(volume.id, next)
    },
    [draftName, onRenameGroup]
  )

  const requestDeleteGroup = useCallback(
    (volume: VolumeRow): void => {
      const name = outlineItemLabel({ title: volume.title }, t('unnamedGroup'))
      // 分组仅存在于大纲域（正文无对应卷）：预检只取条目数，`chapters` 恒 0 不展示；
      // 查询失败（null）回退静态文案，仍可删除，绝不因预检阻断。
      void (async (): Promise<void> => {
        const impact = await inspectVolumeDeleteImpact(volume.id)
        confirm.request(
          {
            title: t('dialog.deleteGroup.title'),
            message:
              impact === null
                ? t('dialog.deleteGroup.message', { name })
                : t('dialog.deleteGroup.messageWithImpact', {
                    name,
                    outlineItems: impact.outlineItems
                  }),
            confirmText: t('dialog.deleteGroup.confirm')
          },
          () => onDeleteGroup(volume.id)
        )
      })()
    },
    [confirm, onDeleteGroup, t, inspectVolumeDeleteImpact]
  )

  const requestDeleteEntry = useCallback(
    (id: number, title: string): void => {
      // 先查该独立条目是否挂着双埋点伏笔：有则在现有删除确认框正文后追加影响提示。
      void (async (): Promise<void> => {
        const warning = await inspectForeshadowImpact({ outlineItemId: id }, 'trash')
        confirm.request(
          {
            title: t('dialog.deleteChapter.title'),
            message: withDeleteImpactWarning(
              t('dialog.deleteChapter.message', {
                name: outlineItemLabel({ title }, t('unnamedChapter'))
              }),
              warning
            ),
            confirmText: t('dialog.deleteChapter.confirm')
          },
          () => onDeleteChapter(id)
        )
      })()
    },
    [confirm, onDeleteChapter, t, inspectForeshadowImpact]
  )

  if (entries.length === 0) return null

  return (
    <div className="nonvol-section pane-region">
      {entries.map((entry) => {
        if (entry.type === 'item') {
          const item = entry.item
          return (
            <OutlineChapterRowItem
              key={entry.key}
              item={item}
              active={activeSelection?.kind === 'entry' && item.id === activeSelection.id}
              onSelect={(id) => onOpenTarget({ kind: 'entry', id })}
              onDelete={(row) => requestDeleteEntry(row.id, row.title)}
              renaming={itemRenamingId === item.id}
              draftName={draftName}
              onDraftNameChange={setDraftName}
              onBeginRename={beginRenameItem}
              onCommitRename={(row) => settleRenameItem(row, true)}
              onCancelRename={(row) => settleRenameItem(row, false)}
            />
          )
        }
        const open = expansion.isOpen(entry.key)
        const volume = entry.volume
        const renaming = groupRenamingId === volume.id
        const groupName = outlineItemLabel({ title: volume.title }, t('unnamedGroup'))
        // 分组行点击三态切换：非编辑目标 → 打开编辑器并展开该分组；
        // 编辑中且展开 → 仅收起；编辑中但收起 → 仅展开（不触碰 selection，零刷新）。
        const handleGroupRowClick = (): void => {
          const isActive = activeSelection?.kind === 'group' && activeSelection.id === volume.id
          if (!isActive) {
            onOpenTarget({ kind: 'group', id: volume.id })
            expansion.open(entry.key)
          } else if (open) {
            expansion.toggle(entry.key)
          } else {
            expansion.open(entry.key)
          }
        }
        return (
          <VolumeGroupRow
            key={entry.key}
            className={`nonvol-group${
              activeSelection?.kind === 'group' && activeSelection.id === volume.id
                ? ' is-active'
                : ''
            }`}
            headClassName="nonvol-group-head"
            prefix=""
            name={groupName}
            nameClassName={`nonvol-group-name${volume.title.trim() === '' ? ' is-empty' : ''}`}
            count={entry.items.length}
            expanded={open}
            onActivate={handleGroupRowClick}
            toggleButton={{ label: groupName, onToggle: () => expansion.toggle(entry.key) }}
            actions={{
              add: {
                label: t('newChapterInGroup'),
                // 新建条目落在本分组：先展开，避免收起态下新建后看不见。
                onClick: () => {
                  expansion.open(entry.key)
                  onCreateEntryInGroup(volume.id)
                }
              },
              rename: { label: t('rename'), onClick: () => beginRenameGroup(volume) },
              delete: { label: t('deleteGroup'), onClick: () => requestDeleteGroup(volume) }
            }}
            renaming={renaming}
            draftName={draftName}
            onDraftNameChange={setDraftName}
            renameAriaLabel={t('groupNameAria')}
            onCommitRename={() => settleRenameGroup(volume, true)}
            onCancelRename={() => settleRenameGroup(volume, false)}
          >
            {open ? (
              <div className="nonvol-children">
                {entry.items.map((child) => (
                  <OutlineChapterRowItem
                    key={child.id}
                    item={child}
                    active={activeSelection?.kind === 'entry' && child.id === activeSelection.id}
                    nested
                    onSelect={(id) => onOpenTarget({ kind: 'entry', id })}
                    onDelete={(row) => requestDeleteEntry(row.id, row.title)}
                    renaming={itemRenamingId === child.id}
                    draftName={draftName}
                    onDraftNameChange={setDraftName}
                    onBeginRename={beginRenameItem}
                    onCommitRename={(row) => settleRenameItem(row, true)}
                    onCancelRename={(row) => settleRenameItem(row, false)}
                  />
                ))}
              </div>
            ) : null}
          </VolumeGroupRow>
        )
      })}
      {confirm.node}
    </div>
  )
}

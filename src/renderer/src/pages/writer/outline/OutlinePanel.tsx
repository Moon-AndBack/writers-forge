import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { EmptyState } from '../../../components/EmptyState'
import { ChevronIcon, DocIcon, PencilIcon, PlusIcon } from '../icons'
import { TrashIcon } from '../../../components/icons'
import { useConfirm } from '../chapters/useConfirm'
import {
  useForeshadowDeleteImpact,
  withDeleteImpactWarning
} from '../foreshadow/useForeshadowDeleteImpact'
import { volumeNameLabel, type VolumeRow } from '../chapters/chapterTree'
import { useChapterLabels } from '../chapters/useChapterLabels'
import { useTreeExpansion } from '../useTreeExpansion'
import { resolveDropLineId } from '../useSortableDrag'
import {
  buildOutlineTree,
  outlineItemLabel,
  type OutlineItemRow,
  type OutlineSelection
} from './outlineTree'
import OutlineChapterRowItem from './OutlineChapterRowItem'
import OutlineNonVolumeList from './OutlineNonVolumeList'
import { useOutlineDrag } from './useOutlineDrag'

export interface OutlinePanelProps {
  /** 所属书籍 id（切书时重置展开态；与 `key={bookId}` 重挂载双保险）。 */
  bookId?: string
  /** 大纲页可见卷（`kind IN ('normal','group')`：分组容器置顶、正文卷在后；由页面层取 `useOutlineVolumes`）。 */
  volumes: VolumeRow[]
  /** 未删除条目（`scope='entry'`：卷下 / 分组下 / 置顶独立条目）。 */
  chapters: OutlineItemRow[]
  /** 当前大纲编辑选中态（页面层持有，与中栏编辑器共享；条目高亮按 id 判定）。 */
  activeSelection: OutlineSelection | null
  /** 大纲编辑目标打开回调（条目 / 分组 / 卷行点击 → 中栏编辑）。 */
  onOpenTarget: (selection: OutlineSelection) => void
  /** 重命名卷（写 `title` 名段）：条目挂在正文卷 / 分组容器下时用（分组改名亦走此通道）。 */
  onRenameVolume: (id: number, title: string) => void
  /** 软删除卷（正文卷连带软删其下章节与条目；分组容器连带软删其下条目）。 */
  onDeleteVolume: (id: number) => void
  /** 在指定正文卷 / 分组下新建条目（纯自定义名，默认空名）。 */
  onCreateChapter: (volumeId: number) => void
  /** 重命名条目（走条目级 `renameChapter`）。 */
  onRenameChapter: (id: number, title: string) => void
  /** 软删除条目。 */
  onDeleteChapter: (id: number) => void
  /** 同组内重排条目（松手落库，失败由页面 reload 回滚）。 */
  onReorderChapter: (id: number, targetIndex: number) => void
  /** 在指定分组容器下新建条目（分组即卷，与卷下新建同通道）。 */
  onCreateEntryInGroup: (groupId: number) => void
}

/**
 * 大纲卷章树面板（受控）：**置顶区**（独立条目 + 分组容器 `kind='group'`）+ **卷区**（正文卷 `kind='normal'`）。
 * - **置顶区**（`OutlineNonVolumeList`）：独立条目点击进中栏编辑；分组容器可展开 / 折叠、可改名（走卷通道）；
 * - **卷与章节页同源**：共用同一卷池行（`VolumeRow`），正文卷名显示口径与章节页一致
 *   （「卷X」+ 名段）；**本页仅显示 `normal` + `group`**（排除 `custom` 自定义卷）；
 * - 条目行：名（纯自定义名，无「第X章」编号）+ 选中态 + hover 操作（删除）+ 拖拽把手（仅同组内重排）；
 * - 折叠态 / 选中态与章节页**不联动**。
 */
export default function OutlinePanel({
  bookId,
  volumes,
  chapters,
  activeSelection,
  onOpenTarget,
  onRenameVolume,
  onDeleteVolume,
  onCreateChapter,
  onRenameChapter,
  onDeleteChapter,
  onReorderChapter,
  onCreateEntryInGroup
}: OutlinePanelProps) {
  const { t } = useTranslation('outline')
  const labels = useChapterLabels()
  // 卷 / 分组展开态（白名单，本面板统一持有）：默认全部收起，仅展开当前编辑项所属项。
  // 置顶区（分组容器）与卷区共用同一份状态，避免两套逻辑漂移。
  const { isOpen, toggle, open: openKey, openMany, seedOnce } = useTreeExpansion(bookId)
  // 内联重命名态：正在改名的卷 id + 草稿名。
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  // 已结算标记：Enter / Escape 已提交或取消后，避免随后的 blur 再次提交（双写）。
  const renameSettled = useRef(false)
  const confirm = useConfirm()
  // 删除确认前的双埋点伏笔查询（软删：伏笔保留，仅此处锚点失效）。
  const { inspect: inspectForeshadowImpact } = useForeshadowDeleteImpact()

  // 卷池已由页面层过滤为大纲页可见卷（`normal` + `group`）。
  const tree = useMemo(() => buildOutlineTree(volumes, chapters), [volumes, chapters])
  const drag = useOutlineDrag({ onReorder: onReorderChapter })

  // 当前编辑项所属卷 / 分组 key（`v{volumeId}` / `g{groupId}`）：
  // - 选中卷 / 分组 → 该项自身 key；
  // - 选中卷内 / 分组内条目 → 其所属卷 / 分组的 key；
  // - 选中独立条目（`volumeId === null`）→ null（全部收起）。
  const activeExpandKey = useMemo(() => {
    if (activeSelection === null) return null
    if (activeSelection.kind === 'volume') return `v${activeSelection.id}`
    if (activeSelection.kind === 'group') return `g${activeSelection.id}`
    const item = chapters.find((row) => row.id === activeSelection.id)
    if (!item || item.volumeId === null) return null
    const volume = volumes.find((row) => row.id === item.volumeId)
    if (!volume) return null
    return volume.kind === 'group' ? `g${volume.id}` : `v${volume.id}`
  }, [activeSelection, volumes, chapters])

  // 首次数据就绪时播种：仅展开当前编辑项所属卷 / 分组。
  useEffect(() => {
    if (volumes.length === 0 && chapters.length === 0) return
    seedOnce(activeExpandKey === null ? [] : [activeExpandKey])
  }, [volumes.length, chapters.length, activeExpandKey, seedOnce])

  // 当前编辑项变化时跟随展开（保留其它项原展开态，不强制折叠）；数据刷新不触发。
  const lastActiveExpandKey = useRef<string | null>(null)
  useEffect(() => {
    if (activeExpandKey === null || lastActiveExpandKey.current === activeExpandKey) return
    lastActiveExpandKey.current = activeExpandKey
    openKey(activeExpandKey)
  }, [activeExpandKey, openKey])

  // 组内条目行 DOM 引用（key = 条目 id），供拖拽命中判定取行矩形。
  const [rowRefs] = useState(() => new Map<number, HTMLElement>())
  const registerRow = useCallback(
    (id: number, element: HTMLElement | null): void => {
      if (element === null) rowRefs.delete(id)
      else rowRefs.set(id, element)
    },
    [rowRefs]
  )

  // 条目行点击 → 打开编辑器（kind='entry'）。
  const selectEntry = useCallback(
    (id: number): void => {
      onOpenTarget({ kind: 'entry', id })
    },
    [onOpenTarget]
  )

  // 开始编辑卷名段（正文卷名段可空；分组容器名可空）。
  const beginRename = useCallback((volume: VolumeRow): void => {
    setRenamingId(volume.id)
    setDraftName(volume.title)
    renameSettled.current = false
  }, [])

  // 结算重命名（幂等：blur 不会二次提交）。名段可空（空串 = 清空）；无变化不写库。
  const settleRename = useCallback(
    (volume: VolumeRow | null, commit: boolean): void => {
      if (renameSettled.current) return
      renameSettled.current = true
      const next = draftName.trim()
      setRenamingId(null)
      if (!commit || !volume) return
      if (next === volume.title) return
      onRenameVolume(volume.id, next)
    },
    [draftName, onRenameVolume]
  )

  const requestDeleteVolume = useCallback(
    (volume: VolumeRow): void => {
      confirm.request(
        {
          title: t('dialog.deleteVolume.title'),
          message: t('dialog.deleteVolume.message', { name: labels.volumeLabel(volume) }),
          confirmText: t('dialog.deleteVolume.confirm')
        },
        () => onDeleteVolume(volume.id)
      )
    },
    [confirm, onDeleteVolume, t, labels]
  )

  const requestDeleteChapter = useCallback(
    (item: OutlineItemRow): void => {
      // 先查该条目是否挂着双埋点伏笔：有则在现有删除确认框正文后追加影响提示。
      void (async (): Promise<void> => {
        const warning = await inspectForeshadowImpact({ outlineItemId: item.id }, 'trash')
        confirm.request(
          {
            title: t('dialog.deleteChapter.title'),
            message: withDeleteImpactWarning(
              t('dialog.deleteChapter.message', {
                name: outlineItemLabel(item, t('unnamedChapter'))
              }),
              warning
            ),
            confirmText: t('dialog.deleteChapter.confirm')
          },
          () => onDeleteChapter(item.id)
        )
      })()
    },
    [confirm, onDeleteChapter, t, inspectForeshadowImpact]
  )

  const isEmpty = tree.nonVolume.length === 0 && tree.volumes.length === 0

  return (
    <div className="pane-body">
      <div className="pane-scroll">
        {isEmpty ? (
          /* 空态：无非卷条目且无任何卷时居中提示；引导文案指路标题栏「添加」按钮。 */
          <EmptyState
            compact
            icon={<DocIcon width={30} />}
            title={t('emptyTitle')}
            description={t('emptyDesc')}
          />
        ) : (
          <>
            {/* 置顶区（独立条目 + 分组容器）。 */}
            <OutlineNonVolumeList
              expansion={{ isOpen, toggle, open: openKey, openMany, seedOnce }}
              entries={tree.nonVolume}
              activeSelection={activeSelection}
              onOpenTarget={onOpenTarget}
              onRenameItem={onRenameChapter}
              onRenameGroup={onRenameVolume}
              onDeleteGroup={onDeleteVolume}
              onDeleteChapter={onDeleteChapter}
              onCreateEntryInGroup={onCreateEntryInGroup}
            />

            {/* 卷区容器卡：包裹全部正文卷分组，与上方置顶区卡成对；卡底座走通用类
                `.pane-region`（见 styles/components/surface.css），卡内纵向 6px 间距走
                `.vol-region` 自身规则（见 writer-outline.css）。 */}
            <div className="vol-region pane-region">
              {tree.volumes.map((group) => {
                const open = isOpen(group.key)
                const volume = group.volume
                const renaming = renamingId === volume.id
                const volPrefix = !renaming ? labels.volumePrefixLabel(volume) : ''
                const volName = !renaming ? volumeNameLabel(volume) : ''
                // 拖拽落点占位线：仅被拖条目所在卷的分组需要渲染。
                const draggingHere = group.chapters.some((item) => item.id === drag.draggingId)
                const dropBeforeId = draggingHere
                  ? resolveDropLineId(group.chapters, drag.draggingId, drag.dropIndex)
                  : null
                const dropAtEnd =
                  draggingHere &&
                  drag.draggingId !== null &&
                  drag.dropIndex !== null &&
                  dropBeforeId === null
                // 卷行行点击（onClick 与 onKeyDown 复用）三态切换：
                // - 非当前编辑目标 → 切换编辑并展开该卷（现状行为）；
                // - 已是编辑目标且列表展开 → 仅收起该卷（不触碰 selection，编辑器零刷新）；
                // - 已是编辑目标但列表收起 → 仅展开该卷。
                const handleVolRowClick = (): void => {
                  if (renaming) return
                  const isActive =
                    activeSelection?.kind === 'volume' && activeSelection.id === volume.id
                  if (!isActive) {
                    onOpenTarget({ kind: 'volume', id: volume.id })
                    openKey(group.key)
                  } else if (open) {
                    toggle(group.key)
                  } else {
                    openKey(group.key)
                  }
                }
                return (
                  <div
                    key={group.key}
                    className={`vol${open ? ' is-open' : ''}${
                      activeSelection?.kind === 'volume' && activeSelection.id === volume.id
                        ? ' is-active'
                        : ''
                    }`}
                  >
                    <div
                      className="vol-head"
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={(event) => {
                        // 鼠标点击后移除行焦点：本行（tabIndex=0）与行内操作按钮都在
                        // .vol-head 内，点击后焦点残留会让 :focus-within 持续命中，
                        // 鼠标移出后按钮组 / 计数隐藏、卷名让位均不恢复。
                        // 用 detail>0 只对鼠标点击 blur——键盘 Enter/Space 合成的
                        // click（detail===0）不 blur，保留键盘可达性。
                        if (event.detail > 0) event.currentTarget.blur()
                        handleVolRowClick()
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleVolRowClick()
                        }
                      }}
                    >
                      {/* 裸 chevron 包成按钮：仅折叠切换（点击不冒泡），行点击走三态逻辑。 */}
                      <button
                        type="button"
                        className="nonvol-group-arrow"
                        aria-label={t('expandVolumeAria')}
                        aria-expanded={open}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggle(group.key)
                        }}
                      >
                        <ChevronIcon className="vol-arrow" />
                      </button>
                      {renaming ? (
                        <input
                          className="vol-rename"
                          type="text"
                          value={draftName}
                          autoFocus
                          spellCheck={false}
                          aria-label={t('volumeNameAria')}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setDraftName(event.target.value)}
                          onBlur={() => settleRename(volume, true)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              settleRename(volume, true)
                            } else if (event.key === 'Escape') {
                              event.preventDefault()
                              settleRename(volume, false)
                            }
                          }}
                        />
                      ) : (
                        /* 卷名段（前缀「卷X」+ ● + 名段）：与章节页同源同口径，纯展示，
                         点击冒泡到 .vol-head 触发折叠；改名仅由行内 hover 铅笔按钮进入内联重命名。 */
                        <>
                          {volPrefix !== '' && <span className="vol-prefix">{volPrefix}</span>}
                          {volPrefix !== '' && (
                            <span className="vol-sep" aria-hidden="true">
                              ●
                            </span>
                          )}
                          {volName !== '' && <span className="vol-name">{volName}</span>}
                        </>
                      )}
                      <span className="vol-count">{group.chapters.length}</span>

                      {/* 行内 hover 操作：新建条目 + 重命名 + 删除卷。 */}
                      <span className="vol-actions" onClick={(event) => event.stopPropagation()}>
                        <IconButton
                          size="sm"
                          className="row-act"
                          label={t('newChapter')}
                          tooltipPlacement="top"
                          onClick={(event) => {
                            if (event.detail > 0) event.currentTarget.blur()
                            // 新建条目落在本卷：先展开，避免收起态下新建后看不见。
                            openKey(group.key)
                            onCreateChapter(volume.id)
                          }}
                        >
                          <PlusIcon width={14} />
                        </IconButton>
                        <IconButton
                          size="sm"
                          className="row-act"
                          label={t('rename')}
                          tooltipPlacement="top"
                          onClick={() => beginRename(volume)}
                        >
                          <PencilIcon />
                        </IconButton>
                        <IconButton
                          size="sm"
                          className="row-act"
                          tone="danger"
                          label={t('deleteVolume')}
                          tooltipPlacement="top"
                          onClick={() => requestDeleteVolume(volume)}
                        >
                          <TrashIcon />
                        </IconButton>
                      </span>
                    </div>

                    <div className="chapters">
                      <div className="chapters-inner">
                        <div className="outline-chapters-list">
                          {group.chapters.map((chapter) => (
                            <div key={chapter.id}>
                              {dropBeforeId === chapter.id && (
                                <div className="drop-line" aria-hidden="true" />
                              )}
                              <OutlineChapterRowItem
                                item={chapter}
                                active={
                                  activeSelection?.kind === 'entry' &&
                                  chapter.id === activeSelection.id
                                }
                                dragging={chapter.id === drag.draggingId}
                                registerRow={registerRow}
                                dragHandle={{
                                  onPointerDown: (event, target) =>
                                    drag.onPointerDown(event, target, {
                                      items: group.chapters,
                                      rowRefs
                                    }),
                                  onPointerMove: drag.onPointerMove,
                                  onPointerUp: drag.onPointerUp,
                                  onPointerCancel: drag.onPointerCancel
                                }}
                                onSelect={selectEntry}
                                onDelete={requestDeleteChapter}
                              />
                            </div>
                          ))}
                          {dropAtEnd && <div className="drop-line" aria-hidden="true" />}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {confirm.node}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { TrashIcon } from '../../../components/icons'
import { EmptyState } from '../../../components/EmptyState'
import { ChevronIcon, PencilIcon, PlusIcon, SpecialChapterIcon, SpecialVolumeIcon } from '../icons'
import { useTreeExpansion } from '../useTreeExpansion'
import {
  groupChapters,
  volumeNameLabel,
  type ChapterPin,
  type ChapterRow,
  type VolumeGroup,
  type VolumeRow
} from './chapterTree'
import ChapterList from './ChapterList'
import SpecialChapterDialog from './SpecialChapterDialog'
import { useChapterDrag } from './useChapterDrag'
import { useChapterLabels } from './useChapterLabels'
import { useConfirm } from './useConfirm'
import {
  useForeshadowDeleteImpact,
  withDeleteImpactWarning
} from '../foreshadow/useForeshadowDeleteImpact'
import type { CreateChapterInput } from './useChapterTree'

/** 跨卷拖拽悬停收起卷的自动展开延迟（ms）。 */
const DROP_EXPAND_DELAY = 450

export interface ChaptersPanelProps {
  /** 所属书籍 id（切书时重置展开态；与 `key={bookId}` 重挂载双保险）。 */
  bookId?: string
  /** 未删除卷（后端顺序：特殊卷置顶）。 */
  volumes: VolumeRow[]
  /** 未删除章（后端顺序：按卷分组、组内 pin 段序）。 */
  chapters: ChapterRow[]
  /** 当前选中章节 id（页面层持有，与中栏编辑器共享）。 */
  activeChapterId: number | null
  /** 章节选中回调。 */
  onSelectChapter: (id: number) => void
  /** 新建章（v2：volumeId 必填；普通章自动「第X章」）。 */
  onCreateChapter: (input: CreateChapterInput) => void
  /** 重命名卷：写名段（`title`）；`custom` 卷整名必填，`normal` 卷名段可空。 */
  onRenameVolume: (id: number, title: string) => void
  /** 软删除卷（整卷入回收站）。 */
  onDeleteVolume: (id: number) => void
  /** 软删除章。 */
  onDeleteChapter: (id: number) => void
  /** 特殊章置顶 / 置底切换。 */
  onSetChapterPin: (id: number, pin: ChapterPin) => void
  /** 同段内重排章（松手落库，失败由页面 reload 回滚）。 */
  onReorderChapter: (id: number, targetIndex: number) => void
  /** 跨卷移动章（追加到目标卷末尾，失败由页面 reload 回滚）。 */
  onMoveChapter: (id: number, volumeId: number) => void
  /** 各卷普通章数（达上限时「新建章」禁用，tooltip「已达卷内最大容量」）。 */
  isVolumeFull: (volumeId: number) => boolean
}

/**
 * 章节树面板：卷 / 章两级行。
 * - 卷列表拆为三块容器卡（对齐大纲侧）：上卡自定义卷（`kind='custom'`，如「番外」）、
 *   下卡正文卷（`kind='normal'`，自动「卷X」编号）、底卡系统「未分卷」（`isUnfiled`，
 *   仅其下有章时出卡，只可折叠 / 展开，不提供建章 / 重命名 / 删除）；卡内保持
 *   `sort_order` 顺序（仅分组，不重排、不动数据）；某类卷为 0 时该卡不渲染
 *   （对齐大纲非卷区空卡行为）；
 * - 卷行双段：「卷X」（斜体，不可编辑）+ `·` 分隔点 + 名段（可编辑，内联）；
 *   自定义卷整名（无编号前缀），重命名 = 整名编辑；
 * - 章行三段：dot → 前缀段（斜体）→ ● 圆点 → 名段；特殊章带置顶 / 置底切换；
 * - 拖拽：把手 pointer 模式；同卷同段内重排，拖到其它可接收卷 = 跨卷移动（追加到卷末尾）。
 */
export default function ChaptersPanel({
  bookId,
  volumes,
  chapters,
  activeChapterId,
  onSelectChapter,
  onCreateChapter,
  onRenameVolume,
  onDeleteVolume,
  onDeleteChapter,
  onSetChapterPin,
  onReorderChapter,
  onMoveChapter,
  isVolumeFull
}: ChaptersPanelProps) {
  const { t } = useTranslation('chapters')
  const labels = useChapterLabels()
  // 卷展开态（白名单）：默认全部收起，仅展开当前编辑章所属卷。
  const { isOpen, toggle: toggleVolume, open: openVolume, seedOnce } = useTreeExpansion(bookId)
  // 内联重命名态：正在改名的卷 id + 草稿名。
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  // 已结算标记：Enter / Escape 已提交或取消后，避免随后的 blur 再次提交（双写）。
  const renameSettled = useRef(false)
  // 「新建特殊章」弹窗：目标正文卷（null = 关闭）。
  const [specialChapterVolume, setSpecialChapterVolume] = useState<VolumeRow | null>(null)
  const confirm = useConfirm()
  // 删除确认前的双埋点伏笔查询（软删：伏笔保留，仅此处锚点失效）。
  const { inspect: inspectForeshadowImpact } = useForeshadowDeleteImpact()

  const groups = groupChapters(volumes, chapters)
  // 可见分组：系统「未分卷」卷仅在其下有章时出卡（空卡隐藏）；其余卷恒出卡。
  // 空态按可见分组判定，避免「存在空未分卷卷」让空态失效。
  const visibleGroups = groups.filter(
    (group) => !group.volume.isUnfiled || group.chapters.length > 0
  )
  // 三卡分组（仅 filter，不重排）：上卡自定义卷（`custom`，排除系统未分卷）/
  // 下卡正文卷（`normal`）/ 底卡系统未分卷（`isUnfiled`）。
  const specialGroups = visibleGroups.filter(
    (group) => group.volume.kind === 'custom' && !group.volume.isUnfiled
  )
  const normalGroups = visibleGroups.filter((group) => group.volume.kind === 'normal')
  const unfiledGroups = visibleGroups.filter((group) => group.volume.isUnfiled)
  // 松手落卷立即展开目标卷：快速拖入收起卷时避免章移动后「消失」；
  // 悬停 450ms 自动展开（见下方 effect）只是提前预览。
  const handleDropChapter = useCallback(
    (id: number, volumeId: number): void => {
      openVolume(`v${volumeId}`)
      onMoveChapter(id, volumeId)
    },
    [openVolume, onMoveChapter]
  )
  const drag = useChapterDrag({
    onReorder: onReorderChapter,
    onMove: handleDropChapter,
    volumes
  })

  // 跨卷拖拽悬停收起卷约 450ms 自动展开（复用卷展开态与 grid 过渡）；离开后不强制收起。
  // 定时器随目标变化 / 拖拽结束（dropContainerKey 归 null）/ 组件卸载自动清理。
  useEffect(() => {
    const targetKey = drag.dropContainerKey
    if (targetKey === null || isOpen(targetKey)) return undefined
    const timer = window.setTimeout(() => openVolume(targetKey), DROP_EXPAND_DELAY)
    return () => window.clearTimeout(timer)
  }, [drag.dropContainerKey, isOpen, openVolume])

  // 当前编辑章所属卷 key（章节 key 约定 `v{volumeId}`）。
  const activeVolumeKey = useMemo(() => {
    if (activeChapterId === null) return null
    const chapter = chapters.find((row) => row.id === activeChapterId)
    return chapter ? `v${chapter.volumeId}` : null
  }, [activeChapterId, chapters])

  // 首次数据就绪时播种：只展开当前编辑章所属卷（空书 / 未选中 → 全收起）。
  // 仅在 `volumes` 与 `chapters` 都不为空时播种，避免数据分批到达时提前锁定空集。
  useEffect(() => {
    if (volumes.length === 0 || chapters.length === 0) return
    seedOnce(activeVolumeKey === null ? [] : [activeVolumeKey])
  }, [volumes.length, chapters.length, activeVolumeKey, seedOnce])

  // 未分卷卡首次出现（从回收站还原章后懒创建 / 首次检测到其下有章）时自动展开一次：
  // 默认全收起的左栏若把该卡收起，用户会误以为还原的章没有回来。
  // 仅首次出现时展开；之后用户手动收起，不因数据刷新再次打开；普通卷仍默认收起。
  const unfiledAutoOpened = useRef(false)
  const firstUnfiledKey = unfiledGroups.find((group) => group.chapters.length > 0)?.key ?? null
  useEffect(() => {
    if (unfiledAutoOpened.current || firstUnfiledKey === null) return
    unfiledAutoOpened.current = true
    openVolume(firstUnfiledKey)
  }, [firstUnfiledKey, openVolume])

  // 当前编辑项变化时跟随展开新卷（保留其它卷的原展开态，不强制折叠）。
  // 仅在 key 真正变化时触发：数据刷新（rename / reorder / 正文保存）不会重开用户手工收起的卷。
  const lastActiveVolumeKey = useRef<string | null>(null)
  useEffect(() => {
    if (activeVolumeKey === null || lastActiveVolumeKey.current === activeVolumeKey) return
    lastActiveVolumeKey.current = activeVolumeKey
    openVolume(activeVolumeKey)
  }, [activeVolumeKey, openVolume])

  // 开始编辑卷名段：`custom` = 整名（`title`）；`normal` = 名段（可空）。
  const beginRename = useCallback((volume: VolumeRow): void => {
    setRenamingId(volume.id)
    setDraftName(volume.title)
    renameSettled.current = false
  }, [])

  // 结算重命名：`normal` 名段可空（空串 = 清空）；`custom` 整名必填（空串视为取消）。
  // 幂等（blur 不会二次提交）。
  const settleRename = useCallback(
    (volume: VolumeRow | null, commit: boolean): void => {
      if (renameSettled.current) return
      renameSettled.current = true
      const next = draftName.trim()
      setRenamingId(null)
      if (!commit || !volume) return
      if (volume.kind === 'custom') {
        // 自定义卷整名必填（空串视为取消）。
        if (next === '' || next === volume.title) return
        onRenameVolume(volume.id, next)
        return
      }
      // 正文卷：名段可空（空串 = 清空），无变化不写库。
      if (next === volume.title) return
      onRenameVolume(volume.id, next)
    },
    [draftName, onRenameVolume]
  )

  const requestDeleteVolume = useCallback(
    (volume: VolumeRow, displayName: string): void => {
      confirm.request(
        {
          title: t('dialog.deleteVolume.title'),
          message: t('dialog.deleteVolume.message', { name: displayName }),
          confirmText: t('dialog.deleteVolume.confirm')
        },
        () => onDeleteVolume(volume.id)
      )
    },
    [confirm, onDeleteVolume, t]
  )

  const requestDeleteChapter = useCallback(
    (chapter: ChapterRow): void => {
      // 先查该章是否挂着双埋点伏笔：有则在现有删除确认框正文后追加影响提示，
      // 无则原样展示（不额外弹框、不改删除流程）。
      void (async (): Promise<void> => {
        const warning = await inspectForeshadowImpact({ chapterId: chapter.id }, 'trash')
        confirm.request(
          {
            title: t('dialog.deleteChapter.title'),
            message: withDeleteImpactWarning(
              t('dialog.deleteChapter.message', { name: labels.chapterLabel(chapter) }),
              warning
            ),
            confirmText: t('dialog.deleteChapter.confirm')
          },
          () => onDeleteChapter(chapter.id)
        )
      })()
    },
    [confirm, onDeleteChapter, t, labels, inspectForeshadowImpact]
  )

  // 单个卷分组的 `.vol` 块渲染：自定义卷卡 / 正文卷卡 / 未分卷卡共用（仅分组不同，
  // 行结构与折叠 / 章行拖拽完全一致；未分卷卡不渲染操作组、不可重命名）。
  const renderVolumeGroup = (group: VolumeGroup) => {
    const open = isOpen(group.key)
    const volume = group.volume
    const unfiled = volume.isUnfiled
    const renaming = !unfiled && renamingId === volume.id
    const volPrefix = !renaming ? labels.volumePrefixLabel(volume) : ''
    const volName = !renaming
      ? unfiled
        ? labels.volumeLabel(volume)
        : volumeNameLabel(volume)
      : ''
    const full = isVolumeFull(volume.id)
    const dropTarget = drag.dropContainerKey === group.key
    return (
      <div
        key={group.key}
        data-volume-id={volume.id}
        className={`vol${open ? ' is-open' : ''}${volume.kind === 'custom' ? ' is-special' : ' is-plain'}${unfiled ? ' is-unfiled' : ''}`}
      >
        <div
          className={`vol-head${dropTarget ? ' is-drop-target' : ''}`}
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
            if (renaming) return
            toggleVolume(group.key)
          }}
          onKeyDown={(event) => {
            if (renaming) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleVolume(group.key)
            }
          }}
        >
          <ChevronIcon className="vol-arrow" />
          {renaming ? (
            <input
              className="vol-rename"
              type="text"
              value={draftName}
              autoFocus
              spellCheck={false}
              aria-label={
                volume.kind === 'custom' ? t('specialVolumeNameAria') : t('customVolumeNameAria')
              }
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
            <>
              {/* 卷名段（前缀「卷X」+ ● + 名段）：纯展示，点击冒泡到 .vol-head 触发折叠；
                改名仅由行内 hover「重命名」铅笔按钮进入内联重命名。 */}
              {volPrefix !== '' && <span className="vol-prefix">{volPrefix}</span>}
              {/* 卷行分隔点：与章行「●」分隔符一致（纯装饰，斜体前缀段与正体名段之间）。 */}
              {volPrefix !== '' && (
                <span className="vol-sep" aria-hidden="true">
                  ●
                </span>
              )}
              {volName !== '' && <span className="vol-name">{volName}</span>}
            </>
          )}
          <span className="vol-count">{group.chapters.length}</span>

          {/* 行内 hover 操作：新建章 + 新建特殊章（正文卷）/ 重命名 / 删除。
              系统「未分卷」卡不提供任何操作（不可建章 / 重命名 / 删除），整组不渲染。 */}
          {!unfiled && (
            <span className="vol-actions" onClick={(event) => event.stopPropagation()}>
              <IconButton
                size="sm"
                className="row-act"
                label={full ? t('volumeFull') : t('newChapter')}
                tooltipPlacement="top"
                disabled={full}
                onClick={(event) => {
                  // 鼠标点击后 blur：本按钮无弹窗接焦，焦点残留会让
                  // .vol-head:focus-within 持续命中（移出后按钮组不隐藏）。
                  // detail>0 限定鼠标；键盘触发不 blur 保持可达性。
                  if (event.detail > 0) event.currentTarget.blur()
                  // 新建章落在本卷：先展开，避免收起态下新建后看不见。
                  openVolume(group.key)
                  onCreateChapter({ volumeId: volume.id })
                }}
              >
                <PlusIcon width={14} />
              </IconButton>
              {volume.kind !== 'custom' && (
                <IconButton
                  size="sm"
                  className="row-act"
                  label={t('newSpecialChapter')}
                  tooltipPlacement="top"
                  onClick={() => setSpecialChapterVolume(volume)}
                >
                  <SpecialChapterIcon width={14} />
                </IconButton>
              )}
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
                onClick={() => requestDeleteVolume(volume, labels.volumeLabel(volume))}
              >
                <TrashIcon />
              </IconButton>
            </span>
          )}
        </div>

        <div className="chapters">
          <div className="chapters-inner">
            <ChapterList
              chapters={group.chapters}
              activeChapterId={activeChapterId}
              drag={drag}
              onSelect={onSelectChapter}
              onDelete={requestDeleteChapter}
              onTogglePin={onSetChapterPin}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pane-body">
      <div className="pane-scroll">
        {visibleGroups.length === 0 ? (
          /* 空态：无任何可见卷时居中提示（复用通用 EmptyState 的紧凑变体）。
             未分卷卷空卡已从 visibleGroups 过滤，不会让空态失效；
             引导文案指路标题栏「新建卷」（入口不在本侧栏，故不给可点击假象）。 */
          <EmptyState
            compact
            icon={<SpecialVolumeIcon width={30} />}
            title={t('emptyTitle')}
            description={t('emptyDesc')}
          />
        ) : (
          /* 分区容器卡：拆为三块——上卡自定义卷（`custom`，如「番外」）、中卡正文卷
             （`normal`，自动编号）、底卡系统未分卷（`isUnfiled`，仅其下有章时出卡）；
             卡内保持 sort_order 顺序（仅分组，不重排）；某类卷为 0 时该卡不渲染
             （对齐大纲非卷区空卡 return null 行为）。卡底座走通用类 `.pane-region`
             （--soft-solid 圆角底 + 6px 内衬），与大纲侧 `.nonvol-section` /
             `.vol-region` 同源（见 styles/components/surface.css）；卡片间距由
             `.pane-scroll > .pane-region` 统一规则提供（writer-side-panels.css）。 */
          <>
            {specialGroups.length > 0 && (
              <div className="pane-region vol-special-region">
                {specialGroups.map(renderVolumeGroup)}
              </div>
            )}
            {normalGroups.length > 0 && (
              <div className="pane-region">{normalGroups.map(renderVolumeGroup)}</div>
            )}
            {unfiledGroups.length > 0 && (
              <div className="pane-region">{unfiledGroups.map(renderVolumeGroup)}</div>
            )}
          </>
        )}
      </div>

      {confirm.node}
      {specialChapterVolume ? (
        <SpecialChapterDialog
          onClose={() => setSpecialChapterVolume(null)}
          onSubmit={(input) => {
            const target = specialChapterVolume
            setSpecialChapterVolume(null)
            if (target) {
              // 新建特殊章落在该卷：先展开，保证新建后可见。
              openVolume(`v${target.id}`)
              onCreateChapter({ volumeId: target.id, ...input, isSpecial: true })
            }
          }}
        />
      ) : null}
    </div>
  )
}

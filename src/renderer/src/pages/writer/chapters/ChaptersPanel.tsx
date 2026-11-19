import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { EmptyState } from '../../../components/EmptyState'
import { LoadErrorState } from '../../../components/LoadErrorState'
import { useInlineRename } from '../../../components/useInlineRename'
import { SpecialChapterIcon, SpecialVolumeIcon } from '../icons'
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
import { useChapterFold } from './useChapterFold'
import { useChapterLabels } from './useChapterLabels'
import { useConfirm } from '@renderer/components/ui/useConfirm'
import {
  useForeshadowDeleteImpact,
  withDeleteImpactWarning
} from '../foreshadow/useForeshadowDeleteImpact'
import { useVolumeDeleteImpact } from '../volumes/useVolumeDeleteImpact'
import VolumeGroupRow from '../volumes/VolumeGroupRow'
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
  /** 章节树 / 卷池是否仍在首次加载（三态顺序：loading → error → empty）。 */
  loading: boolean
  /** 章节树或卷池读取失败（仅在无可见卷时展示错误态）。 */
  loadError: unknown | null
  /** 重试读取章节树与卷池。 */
  onRetry: () => void
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
  loading,
  loadError,
  onRetry,
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
  const { t: tCommon } = useTranslation('common')
  const labels = useChapterLabels()
  // 卷展开态（白名单）：默认全部收起，仅展开当前编辑章所属卷。
  const { isOpen, toggle: toggleVolume, open: openVolume, seedOnce } = useTreeExpansion(bookId)
  // 卷收起过渡结束后卸载章行；重挂载批次抑制进场动画（见 useChapterFold）。
  const fold = useChapterFold(isOpen, toggleVolume)
  // 内联重命名：状态与 Enter / Esc / 失焦结算由共享 hook 持有。
  const rename = useInlineRename<number>({
    // 提交语义：`normal` 名段可空（空串 = 清空）；`custom` 整名必填（空串视为取消）；
    // 与原名相同不写库。
    onCommit: (id, value, previous) => {
      const volume = volumes.find((row) => row.id === id)
      if (!volume) return
      if (volume.kind === 'custom' && value === '') return
      if (value === previous) return
      onRenameVolume(id, value)
    }
  })
  // 「新建特殊章」弹窗：目标正文卷（null = 关闭）。
  const [specialChapterVolume, setSpecialChapterVolume] = useState<VolumeRow | null>(null)
  const confirm = useConfirm()
  // 删除确认前的双埋点伏笔查询（软删：伏笔保留，仅此处锚点失效）。
  const { inspect: inspectForeshadowImpact } = useForeshadowDeleteImpact()
  // 删除卷确认前的跨域影响预检（章节数 / 大纲条目数；失败回退静态文案）。
  const { inspect: inspectVolumeDeleteImpact } = useVolumeDeleteImpact()

  // 分组与三卡筛选只随卷 / 章数据变化重算（与 OutlinePanel 的 tree memo 同口径）。
  const { visibleGroups, specialGroups, normalGroups, unfiledGroups } = useMemo(() => {
    const groups = groupChapters(volumes, chapters)
    // 可见分组：系统「未分卷」卷仅在其下有章时出卡（空卡隐藏）；其余卷恒出卡。
    // 空态按可见分组判定，避免「存在空未分卷卷」让空态失效。
    const visible = groups.filter((group) => !group.volume.isUnfiled || group.chapters.length > 0)
    // 三卡分组（仅 filter，不重排）：上卡自定义卷（`custom`，排除系统未分卷）/
    // 下卡正文卷（`normal`）/ 底卡系统未分卷（`isUnfiled`）。
    return {
      visibleGroups: visible,
      specialGroups: visible.filter(
        (group) => group.volume.kind === 'custom' && !group.volume.isUnfiled
      ),
      normalGroups: visible.filter(
        (group) => group.volume.kind === 'normal' && !group.volume.isUnfiled
      ),
      unfiledGroups: visible.filter((group) => group.volume.isUnfiled)
    }
  }, [volumes, chapters])
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
  const beginRename = (volume: VolumeRow): void => {
    rename.begin(volume.id, volume.title)
  }

  const requestDeleteVolume = useCallback(
    (volume: VolumeRow, displayName: string): void => {
      // 卷级删除会同时软删章节与大纲条目：先预检两侧数量再弹确认；
      // 查询失败（null）回退静态文案，仍可删除，绝不因预检阻断。
      void (async (): Promise<void> => {
        const impact = await inspectVolumeDeleteImpact(volume.id)
        confirm.request(
          {
            title: t('dialog.deleteVolume.title'),
            message:
              impact === null
                ? t('dialog.deleteVolume.message', { name: displayName })
                : t('dialog.deleteVolume.messageWithImpact', {
                    name: displayName,
                    chapters: impact.chapters,
                    outlineItems: impact.outlineItems
                  }),
            confirmText: t('dialog.deleteVolume.confirm')
          },
          () => onDeleteVolume(volume.id)
        )
      })()
    },
    [confirm, onDeleteVolume, t, inspectVolumeDeleteImpact]
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
    const renaming = !unfiled && rename.renamingId === volume.id
    const volPrefix = !renaming ? labels.volumePrefixLabel(volume) : ''
    const volName = !renaming
      ? unfiled
        ? labels.volumeLabel(volume)
        : volumeNameLabel(volume)
      : ''
    const full = isVolumeFull(volume.id)
    const dropTarget = drag.dropContainerKey === group.key
    return (
      <VolumeGroupRow
        key={group.key}
        className={`vol${volume.kind === 'custom' ? ' is-special' : ' is-plain'}${unfiled ? ' is-unfiled' : ''}`}
        headClassName={dropTarget ? 'is-drop-target' : undefined}
        dataVolumeId={volume.id}
        prefix={volPrefix}
        name={volName}
        count={group.chapters.length}
        expanded={open}
        onActivate={() => fold.toggle(group.key)}
        actions={
          unfiled
            ? undefined
            : {
                add: {
                  label: full ? t('volumeFull') : t('newChapter'),
                  disabled: full,
                  // 新建章落在本卷：先展开，避免收起态下新建后看不见。
                  onClick: () => {
                    openVolume(group.key)
                    onCreateChapter({ volumeId: volume.id })
                  }
                },
                extra:
                  volume.kind !== 'custom' ? (
                    <IconButton
                      size="sm"
                      className="row-act"
                      label={t('newSpecialChapter')}
                      tooltipPlacement="top"
                      onClick={() => setSpecialChapterVolume(volume)}
                    >
                      <SpecialChapterIcon width={14} />
                    </IconButton>
                  ) : undefined,
                rename: { label: t('rename'), onClick: () => beginRename(volume) },
                delete: {
                  label: t('deleteVolume'),
                  onClick: () => requestDeleteVolume(volume, labels.volumeLabel(volume))
                }
              }
        }
        renaming={renaming}
        draftName={rename.draft}
        onDraftNameChange={rename.setDraft}
        renameAriaLabel={
          volume.kind === 'custom' ? t('specialVolumeNameAria') : t('customVolumeNameAria')
        }
        onCommitRename={rename.commit}
        onCancelRename={rename.cancel}
      >
        <div className="chapters" onTransitionEnd={(event) => fold.onFoldEnd(group.key, event)}>
          <div className="chapters-inner">
            {fold.isMounted(group.key) ? (
              <ChapterList
                chapters={group.chapters}
                activeChapterId={activeChapterId}
                drag={drag}
                suppressEnter={fold.suppressEnter(group.key)}
                onSelect={onSelectChapter}
                onDelete={requestDeleteChapter}
                onTogglePin={onSetChapterPin}
              />
            ) : null}
          </div>
        </div>
      </VolumeGroupRow>
    )
  }

  return (
    <div className="pane-body">
      <div className="pane-scroll">
        {loading ? (
          /* 首读：先于错误 / 空态判定，避免数据未回来时先闪「还没有创建卷」。 */
          <div className="rp-list-empty">{tCommon('loading')}</div>
        ) : loadError !== null && visibleGroups.length === 0 ? (
          /* 读取失败且无可见卷：与真空态区分，给出重试入口。 */
          <LoadErrorState compact onRetry={onRetry} />
        ) : visibleGroups.length === 0 ? (
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

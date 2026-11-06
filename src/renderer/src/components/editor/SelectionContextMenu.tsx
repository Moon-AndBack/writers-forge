import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { deriveForeshadowStatus } from '../../../../shared/foreshadowStatus'
import { sliceSelectedText } from '../../../../shared/foreshadowAnchorText'
import type { ForeshadowAnchor } from '../../../../main/database/foreshadows'
import type { CleanWordCategory } from '../../../../preload/types/cleanWords'
import { EditorContextMenu } from './EditorContextMenu'
import { FormatButton } from './FormatPopover'
import { buildAnchor } from './foreshadowAnchor'
import { resolveParagraphAnchor } from './paragraphAnchor'
import { useAttachForeshadow } from './useAttachForeshadow'
import {
  FORESHADOW_MARKS_REFRESH_EVENT,
  refreshForeshadowMarks,
  type ForeshadowLabelResolver
} from './useForeshadowMarks'
import ForeshadowCreateDialog from '../dialogs/ForeshadowCreateDialog'
import ForeshadowRecoverDialog from '../dialogs/ForeshadowRecoverDialog'
import { useForeshadowFilters } from '../../pages/writer/foreshadow/foreshadowFilterContext'
import { CATEGORIES, CATEGORY_LABEL_KEYS, MAX_WORD_CHARS } from '../dialogs/cleanWordsMeta'
import type { CleanWordAddOutcome } from '../dialogs/cleanWordActions'
import { useToast } from '../ui'

/**
 * 正文右键**选区菜单**（章节编辑器 / 大纲编辑器共用，§9 唯一实现）。
 *
 * ⚠️ 菜单壳（`EditorContextMenu`）每个实例都会各自在 `editor.view.dom` 上挂
 * `contextmenu` 监听并各自 `preventDefault`——同一编辑器上**只允许挂一个**本类菜单，
 * 否则两个浮层会同时弹出。故「添加伏笔 / 搜索选中文字 / 加入违禁词库」合并为
 * 一个菜单，由调用方传回调决定可选项目是否出现。
 *
 * 壳（挂载 / 拦截 / 定位 / 关闭 / 选区保持）见 `EditorContextMenu`；本组件只声明：
 * - **接管条件**：选区落在单个顶层块内（`resolveParagraphAnchor` 非 null），
 *   大纲额外要求不在表格内（让给 `TableContextMenu`，经 `shouldOpenExtra` 传入）；
 * - **菜单内容**：
 *   1. 「添加伏笔」（`foreshadow` ns `contextMenu.add`，始终出现）；
 *   2. 「关联伏笔」（`foreshadow` ns `contextMenu.attach`，始终出现）——点击后把**当前
 *      选区快照**挂成某条伏笔的埋点（槽位由上下文决定：章节 → 正文埋点，大纲条目 → 大纲埋点；
 *      弹窗内选目标，无可挂候选时由弹窗给空态提示）；
 *   3. 「回收伏笔」（`foreshadow` ns `contextMenu.recover`，**仅章节编辑器**出现——回收是
 *      「伏笔在正文里兑现」的事件、需要正文位置，大纲是规划层，故大纲不显示该项；当前书
 *      **没有**埋设中（派生 `planted`）伏笔时置灰不可点，可回收性在 `bookId` 变化 / 伏笔写操作后重算）；
 *   4. 「搜索选中文字」（传 `onSearchText` 时出现）；
 *   5. 「加入违禁词库」（传 `onAddCleanWord` 时出现）——点击后**在同一浮层内**展开
 *      六个类别按钮（二级选择），选完即入库并收起。
 * - **点击后**：`FormatButton` 已 `onMouseDown` 阻止默认，故编辑器选区在回调内仍有效；
 * - **创建伏笔成功后**：按本题 `chapterId` / `outlineItemId` 重拉伏笔并写回正文标记
 *   （`refreshForeshadowMarks`，meta 事务，不改文档 / 不动选区）；
 * - **回收伏笔**：点菜单项时把**当前选区快照**记为回收锚点（与添加伏笔共用 `buildAnchor`），
 *   回收成功后再 `refreshForeshadowMarks`：埋设点变灰实线、回收处铺「回收点」标记。
 *
 * 选中文字来源（两处一致）：`resolveParagraphAnchor` 的 `quote` 按 `charStart` / `charEnd`
 * 截取。选它而不是 `readEditorSelection`：锚点函数已保证选区**落在单个顶层块内**，
 * 天然排除跨段文本（搜索按段 `indexOf`，跨段查询词必然匹配不到）。
 *
 * 锚点载体：
 * - 传 `chapterId` → `kind: 'chapter'`（章 + 段落序号 + 段文本 + 段内字符区间）；
 * - 传 `outlineItemId` → `kind: 'outline'`（仅大纲**条目行**；卷纲 / 分组行不传，见下）——
 *   同样写入 `paragraphIdx`（大纲正文是富文本，序号按顶层块计），否则正文标记无从定位；
 * - 两者皆无（如大纲的卷 / 分组目标）→ `kind: 'none'`（未锚定，正文标记批次不覆盖）。
 *
 * 约束：菜单 / 弹窗状态全部由 React `useState` 持有，**不得**塞进 `useEditor` 的
 * `editorProps` 闭包（W11 中文输入法焦点修复硬约束，见 `richTextExtensions.ts`）。
 */
export interface SelectionContextMenuProps {
  /** Tiptap 编辑器实例；null 时不挂监听。 */
  editor: Editor | null
  /** 所属书籍 id（创建伏笔时写入）。 */
  bookId: string
  /** 章节编辑器：当前章 id（章节页传；大纲页不传）。 */
  chapterId?: number | null
  /** 大纲编辑器：当前**条目行** id（卷 / 分组目标不传 → 未锚定）。 */
  outlineItemId?: number | null
  /** 关联位置展示串（卷 · 章 / 卷 · 条目；由调用方按当前编辑目标派生，空串 = 未关联）。 */
  contextLabel?: string
  /** 伏笔正文标记的位置名解析（创建 / 回收后重拉标记时组悬停文案用；省略 → 未知位置）。 */
  resolveForeshadowTargetLabel?: ForeshadowLabelResolver
  /** 额外接管条件（大纲：`!isActive('table')` 时本菜单才接管）。 */
  shouldOpenExtra?: (editor: Editor) => boolean
  /** 用选中文字发起查找；省略则不显示「搜索选中文字」。 */
  onSearchText?: (text: string) => void
  /**
   * 把选中文字加入违禁词库；省略则不显示「加入违禁词库」。
   * 只有挂 `CleanWordMark` 的编辑器（章节正文）才应传入——否则加了词也看不到标记。
   */
  onAddCleanWord?: (word: string, category: CleanWordCategory) => Promise<CleanWordAddOutcome>
}

/** 右键点开菜单时的锚点快照（弹窗据此构造落库 payload）。 */
interface PendingAnchor {
  anchor: ForeshadowAnchor
  /** 选中文字 = 锚点 `quote.slice(charStart, charEnd)`（**不是**整段快照）。 */
  selectedText: string
}

/** 单条添加结果 → toast 文案 key（`common` ns）。 */
const TOAST_KEYS = {
  inserted: 'selectionMenu.wordAdded',
  updated: 'selectionMenu.wordUpdated',
  exists: 'selectionMenu.wordExists',
  failed: 'selectionMenu.wordFailed'
} as const satisfies Record<CleanWordAddOutcome, string>

/**
 * 取选中的文字片段（所在块文本按段内区间截取后 trim）。
 *
 * 选区跨块 / 空选区时 `resolveParagraphAnchor` 返回 null，此处回退空串（调用方不动作）。
 */
function readSelectedText(editor: Editor | null): string {
  if (!editor) return ''
  const info = resolveParagraphAnchor(editor)
  if (!info) return ''
  return sliceSelectedText(info.quote, info.charStart, info.charEnd).trim()
}

/**
 * 搜索词规整：搜索是**逐段 `indexOf`**，换行永远匹配不到。
 * 顶层块内一般无换行（锚点函数已排除跨块选区），但富文本段落内的硬换行会出现在
 * 块文本里——取首个非空行，避免整条查询直接失效。
 */
function toSearchQuery(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  )
}

/**
 * 读取全书伏笔并判断是否存在「可回收」项（**派生状态为 `planted`**）。
 * 建设中 / 已废弃 / 已回收均不可回收（回收点优先，废弃记录不再参与判断）。
 * 失败按不可回收处理（永不抛错）：菜单项置灰比误开空弹窗更稳妥。
 */
async function fetchRecoverable(bookId: string): Promise<boolean> {
  try {
    const rows = await window.api.foreshadow.list(bookId)
    return rows.some((row) => deriveForeshadowStatus(row) === 'planted')
  } catch {
    return false
  }
}

interface SelectionMenuContentProps {
  editor: Editor | null
  /** 收起菜单（由壳提供）。 */
  close: () => void
  /** 打开伏笔创建弹窗（锚点快照在父组件内取，菜单先收起）。 */
  onAddForeshadow: () => void
  /** 打开「关联伏笔」弹窗（把当前选区挂成某条伏笔的埋点）。 */
  onAttachForeshadow: () => void
  /** 当前上下文是否显示「回收伏笔」（仅章节编辑器；大纲是规划层，回收只在正文发生）。 */
  showRecover: boolean
  /** 当前书是否有埋设中（派生 `planted`）伏笔（false → 「回收伏笔」置灰，菜单项仍显示）。 */
  canRecover: boolean
  /** 打开回收伏笔弹窗（菜单先收起）。 */
  onRecoverForeshadow: () => void
  /** 用选中文字发起查找；省略 → 不显示该项。 */
  onSearchText?: (text: string) => void
  /** 把选中文字加入违禁词库；省略 → 不显示该项。 */
  onAddCleanWord?: (word: string, category: CleanWordCategory) => Promise<CleanWordAddOutcome>
  /** 校验 / 结果提示（toast 挂在父组件，菜单收起后仍可见）。 */
  showToast: (message: string) => void
}

/**
 * 菜单内容（仅在菜单展开期间挂载）。
 *
 * 二级选择状态 `pendingWord` 放在**本子组件内**：菜单关闭时壳返回 null → 子组件卸载 →
 * 状态自然重置，下次右键不会残留上次的类别面板。
 */
function SelectionMenuContent({
  editor,
  close,
  onAddForeshadow,
  onAttachForeshadow,
  showRecover,
  canRecover,
  onRecoverForeshadow,
  onSearchText,
  onAddCleanWord,
  showToast
}: SelectionMenuContentProps): ReactNode {
  const { t } = useTranslation('common')
  // 伏笔项文案沿用其专属 ns（`foreshadow` 既有 key，不重复造词）。
  const { t: tForeshadow } = useTranslation('foreshadow')
  // 六个类别名复用词库 ns（`chapters`）的既有 key，避免两处平行维护（§10 允许跨 ns 取用）。
  const { t: tCleanWords } = useTranslation('chapters')
  /** 非 null = 已展开「选择类别」二级面板（值为待入库的词）。 */
  const [pendingWord, setPendingWord] = useState<string | null>(null)

  /**
   * 进入「加入违禁词库」：先按 IPC 口径前置校验，不合法就地提示并收起菜单。
   *
   * 为何必须前置：`cleanWords:import` 任一条非法即整批返回 null（整批失败），
   * 且长度 < 2 的词不会被正文标注（`proofreadMark` 首字分桶跳过单字词），
   * 让用户「加了却看不到效果」比直接提示更糟。
   */
  const beginAddWord = (): void => {
    const text = readSelectedText(editor)
    if (text === '') {
      showToast(t('selectionMenu.wordEmpty'))
      close()
      return
    }
    if (/[\r\n]/.test(text)) {
      showToast(t('selectionMenu.wordMultiline'))
      close()
      return
    }
    if (text.length < 2) {
      showToast(t('selectionMenu.wordTooShort'))
      close()
      return
    }
    if (text.length > MAX_WORD_CHARS) {
      showToast(t('selectionMenu.wordTooLong', { max: MAX_WORD_CHARS }))
      close()
      return
    }
    setPendingWord(text)
  }

  /** 选类别 → 入库（关闭菜单后执行；toast 挂在父组件，不受菜单卸载影响）。 */
  const commitWord = (category: CleanWordCategory): void => {
    if (pendingWord === null || onAddCleanWord === undefined) return
    const word = pendingWord
    close()
    void onAddCleanWord(word, category).then(
      (outcome) => showToast(t(TOAST_KEYS[outcome])),
      () => showToast(t('selectionMenu.wordFailed'))
    )
  }

  /** 用选中文字发起查找（换行截断见 `toSearchQuery`）。 */
  const runSearch = (): void => {
    if (onSearchText === undefined) return
    const query = toSearchQuery(readSelectedText(editor))
    if (query === '') {
      showToast(t('selectionMenu.searchEmpty'))
      close()
      return
    }
    close()
    onSearchText(query)
  }

  /**
   * 二级类别面板（标题 + 六类，两列）。
   *
   * 宽度严格按**当前显示的内容**决定，不做跨状态预留：一级阶段菜单只按当前菜单项
   * 中最长者撑开，点开类别后按本面板（标题 + 两列）撑开——允许宽度跳变。变宽后由壳的
   * `ResizeObserver` 按实测宽重新夹取位置（见 `EditorContextMenu`），不会超出视口。
   */
  const renderCategoryPanel = (): ReactNode => (
    <div className="wf-format-pop__section">
      <div className="wf-format-pop__title">{t('selectionMenu.categoryTitle')}</div>
      <div className="wf-format-pop__grid wf-format-pop__grid--pair">
        {CATEGORIES.map((category) => (
          <FormatButton
            key={category}
            label={tCleanWords(CATEGORY_LABEL_KEYS[category])}
            onClick={() => commitWord(category)}
          />
        ))}
      </div>
    </div>
  )

  return (
    <>
      <div className="wf-format-pop__section">
        <div className="wf-format-pop__grid wf-format-pop__grid--stack">
          <FormatButton label={tForeshadow('contextMenu.add')} onClick={onAddForeshadow} />
          {/* 「关联伏笔」始终显示、不置灰：没有可挂的候选时由弹窗给出空态提示
              （`attach.empty`），比在菜单里猜「为什么不可点」更可解释。 */}
          <FormatButton label={tForeshadow('contextMenu.attach')} onClick={onAttachForeshadow} />
          {/* 「回收伏笔」只在章节上下文渲染（大纲是规划层，回收语义错位）；章节内当前书
              没有埋设中伏笔时仍渲染并置灰——`FormatButton` 原生 `disabled` 已排除 hover
              并给出 not-allowed 光标，无需额外阻止点击（浏览器不派发 click）。 */}
          {showRecover && (
            <FormatButton
              label={tForeshadow('contextMenu.recover')}
              disabled={!canRecover}
              onClick={onRecoverForeshadow}
            />
          )}
          {onSearchText !== undefined && (
            <FormatButton label={t('selectionMenu.search')} onClick={runSearch} />
          )}
          {onAddCleanWord !== undefined && pendingWord === null && (
            <FormatButton label={t('selectionMenu.addWord')} onClick={beginAddWord} />
          )}
        </div>
      </div>
      {/* 二级选择：同一浮层内展开六类，不弹新窗口（选完即入库并收起）。
          一级阶段**不渲染**本面板（宽度只按当前菜单项撑开）；展开后菜单按面板内容
          变宽，位置由壳的 ResizeObserver 重夹（跳变与重夹均为预期行为）。 */}
      {onAddCleanWord !== undefined && pendingWord !== null && renderCategoryPanel()}
    </>
  )
}

export function SelectionContextMenu({
  editor,
  bookId,
  chapterId = null,
  outlineItemId = null,
  contextLabel = '',
  resolveForeshadowTargetLabel,
  shouldOpenExtra,
  onSearchText,
  onAddCleanWord
}: SelectionContextMenuProps): ReactNode {
  const { t } = useTranslation('common')
  // 无障碍名（`role="menu"` 的 aria-label）沿用 `common` 的「选中文字」文案；
  // 菜单**不渲染可见标题**（上部直接是菜单项），伏笔项文案在内容组件内取 `foreshadow` ns。
  const { t: tForeshadow } = useTranslation('foreshadow')
  // toast 由本组件持有（菜单卸载 / 弹窗卸载后提示仍可见）。
  const { show: showToast, node: toastNode } = useToast()
  // 「关联伏笔」：选区快照 → 弹窗 → toast / 刷新标记，全部封装在 hook 内
  // （第三个弹窗的状态不继续堆进本组件，见 `useAttachForeshadow`）。
  const { openAttach, dialog: attachDialog } = useAttachForeshadow({
    editor,
    bookId,
    chapterId,
    outlineItemId,
    resolveForeshadowTargetLabel,
    showToast
  })
  /**
   * 伏笔筛选条件（外部 store 单例，活动栏浮层写入）：右键新建成功后须清空，
   * 否则新建的「建设中」伏笔在当前状态筛选（如只看「已回收」）下不可见。
   * 与标题栏「新建」同口径（见 `ForeshadowView` 的 `handleCreated`）。
   */
  const { clearAll: clearForeshadowFilters } = useForeshadowFilters(bookId)
  /** 非 null = 创建弹窗打开（同时持有右键时的选区快照）。 */
  const [pending, setPending] = useState<PendingAnchor | null>(null)
  /** 非 null = 回收弹窗打开（值 = 点菜单项时的选区快照，落库为回收锚点）。 */
  const [recoverAnchor, setRecoverAnchor] = useState<ForeshadowAnchor | null>(null)
  /** 「回收伏笔」仅在章节上下文出现（大纲是规划层，回收只在正文发生；槽位语义固定）。 */
  const showRecover = chapterId !== null
  /**
   * 当前书是否存在「埋设中」伏笔（派生状态为 `planted`；软删除已由数据层过滤）。
   * 决定「回收伏笔」菜单项是否置灰；未就绪时按不可回收处理（保守，避免点开空列表）。
   */
  const [hasRecoverable, setHasRecoverable] = useState(false)
  /** 请求序号：bookId 快速切换时丢弃过期响应，只采纳最后一次查询。 */
  const recoverSeqRef = useRef(0)

  const refreshRecoverable = useCallback(async (): Promise<void> => {
    const seq = ++recoverSeqRef.current
    const next = await fetchRecoverable(bookId)
    if (seq !== recoverSeqRef.current) return
    setHasRecoverable(next)
  }, [bookId])

  // bookId 变化时重算一次（setState 只发生在异步回调内）；大纲上下文不显示该项，不查询。
  useEffect(() => {
    if (!showRecover) return
    let cancelled = false
    const seq = ++recoverSeqRef.current
    void fetchRecoverable(bookId).then((next) => {
      if (cancelled || seq !== recoverSeqRef.current) return
      setHasRecoverable(next)
    })
    return () => {
      cancelled = true
    }
  }, [bookId, showRecover])

  // 伏笔写操作（创建 / 回收 / 列表页编辑 / 删除）后经统一事件广播重算。
  useEffect(() => {
    const handleRefresh = (): void => {
      void refreshRecoverable()
    }
    window.addEventListener(FORESHADOW_MARKS_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(FORESHADOW_MARKS_REFRESH_EVENT, handleRefresh)
  }, [refreshRecoverable])

  const openDialog = (): void => {
    const info = editor ? resolveParagraphAnchor(editor) : null
    if (!info) return
    setPending({
      anchor: buildAnchor(info, chapterId, outlineItemId),
      // 弹窗只展示「选中文字」：快照整段仍随 anchor.quote 落库（失效判定用），
      // 展示侧必须切出窄串，避免再次把整段当选中文字渲染。
      selectedText: sliceSelectedText(info.quote, info.charStart, info.charEnd)
    })
  }

  return (
    <>
      <EditorContextMenu
        editor={editor}
        ariaLabel={t('selectionMenu.title')}
        // 宽度交由内容决定（不传 `width`）；`wf-selectionmenu` 只用于两列网格的
        // 列宽下限修正与菜单项文字左对齐（见 editor-format.css），不影响表格菜单。
        className="wf-selectionmenu"
        shouldOpen={(instance) =>
          (shouldOpenExtra ? shouldOpenExtra(instance) : true) &&
          resolveParagraphAnchor(instance) !== null
        }
      >
        {(close) => (
          <SelectionMenuContent
            editor={editor}
            close={close}
            onAddForeshadow={() => {
              openDialog()
              close()
            }}
            onAttachForeshadow={() => {
              // 与「回收伏笔」同口径：先取选区快照（菜单按钮已阻止 mousedown 默认，
              // 编辑器选区此刻仍有效），再收起菜单 / 打开弹窗，避免壳的「外部 pointerdown
              // 关闭」监听把随后打开的 Modal 遮罩当成外部点击。
              if (!openAttach()) showToast(tForeshadow('contextMenu.noSelection'))
              close()
            }}
            showRecover={showRecover}
            canRecover={hasRecoverable}
            onRecoverForeshadow={() => {
              // 先取选区快照（菜单内按钮已阻止 mousedown 默认，编辑器选区此刻仍有效），
              // 再收起菜单 / 打开弹窗：壳的「外部 pointerdown 关闭」监听随 `anchor=null`
              // 在同一提交内清理，不会把随后打开的 Modal 遮罩当成外部点击。
              const info = editor ? resolveParagraphAnchor(editor) : null
              if (info === null) {
                // 防御性分支（菜单接管已要求选区非空且落在单个顶层块内，理论上不可达）：
                // 选择「阻止打开」而非写 `kind: 'none'`——没有回收锚点会让回收处静默缺标记，
                // 用户无法理解「回收了却看不到回收点」，显式提示更可诊断。
                showToast(tForeshadow('contextMenu.noSelection'))
                close()
                return
              }
              close()
              setRecoverAnchor(buildAnchor(info, chapterId, outlineItemId))
            }}
            onSearchText={onSearchText}
            onAddCleanWord={onAddCleanWord}
            showToast={showToast}
          />
        )}
      </EditorContextMenu>
      {pending !== null && (
        <ForeshadowCreateDialog
          bookId={bookId}
          anchor={pending.anchor}
          contextLabel={contextLabel}
          selectedText={pending.selectedText}
          defaultTitle=""
          onClose={() => setPending(null)}
          onCreated={() => {
            showToast(tForeshadow('toast.createSuccess'))
            setPending(null)
            // 新建的多为「建设中」且可能不匹配当前筛选：先清条件，确保新行可见
            // （仅在创建成功后清；失败由 `onFailed` 处理，不动用户既有条件）。
            clearForeshadowFilters()
            // 创建成功后按锚点重拉并写回正文标记（复用同一刷新实现，无需跨组件通信）。
            void refreshForeshadowMarks(editor, chapterId, outlineItemId, {
              resolveLabel: resolveForeshadowTargetLabel,
              t: tForeshadow
            })
            // 新伏笔可回收：重算菜单项可点性。
            void refreshRecoverable()
          }}
          onFailed={() => showToast(tForeshadow('toast.createFailed'))}
        />
      )}
      {recoverAnchor !== null && (
        <ForeshadowRecoverDialog
          key={bookId}
          bookId={bookId}
          recoverAnchor={recoverAnchor}
          onClose={() => setRecoverAnchor(null)}
          onRecovered={() => {
            setRecoverAnchor(null)
            showToast(tForeshadow('toast.recoverSuccess'))
            // 回收后按锚点重拉正文标记：埋设点变「已回收」样式（悬停显示回收位置），
            // 回收处另铺一条「回收点」标记（悬停显示原埋设位置 + 名称）。
            void refreshForeshadowMarks(editor, chapterId, outlineItemId, {
              resolveLabel: resolveForeshadowTargetLabel,
              t: tForeshadow
            })
            void refreshRecoverable()
          }}
          onFailed={() => showToast(tForeshadow('toast.recoverFailed'))}
        />
      )}
      {attachDialog}
      {toastNode}
    </>
  )
}

export default SelectionContextMenu

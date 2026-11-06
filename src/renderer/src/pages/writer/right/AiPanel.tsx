import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Textarea, useToast } from '../../../components/ui'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import {
  clearSelectionMirror,
  showSelectionMirror
} from '../../../components/editor/linkSelectionMirror'
import {
  readEditorSelection,
  type EditorSelectionSnapshot
} from '../../../components/editor/useEditorSelection'
import { insertAfter, replaceSelection } from './ai/applyToEditor'
import { AI_QUICK_ACTIONS } from './ai/functions'
import type { AiComposeAction } from './ai/functions'
import { useAiConversation } from './ai/useAiConversation'
import { useAiSessions } from './ai/useAiSessions'
import { AiSessionBar } from './ai/AiSessionBar'
import { canApplyMessage, readFullText, toOption } from './ai/panelUtils'
import { useAiModels } from './ai/useAiModels'
import { useBookProfile } from './ai/useBookProfile'
import { AiControls } from './ai/AiControls'
import { BuiltinPrompt } from './ai/BuiltinPrompt'
import { ChatMessage } from './ai/ChatMessage'
import { AiComposerStatus } from './ai/AiComposerStatus'
import { useContextUsage } from './ai/useContextUsage'
import { useEditorMetrics } from './ai/useEditorMetrics'

/** 功能 → 文案 key（静态映射，避免拼接 key 丢类型）。 */
const ACTION_LABEL_KEYS = {
  polish: 'panel.action.polish',
  continue: 'panel.action.continue',
  rewrite: 'panel.action.rewrite',
  translate: 'panel.action.translate',
  chat: 'panel.action.chat'
} as const satisfies Record<AiComposeAction, string>

/** 失焦期选区镜像饰带类名（样式见 `styles/writer-ai.css` 的 `.ai-selection-mirror`）。 */
const AI_SELECTION_MIRROR_CLASS = 'ai-selection-mirror'

export interface AiPanelProps {
  bookId: string
  chapterId: number | null
  /** 页签是否可见（用于惰性加载）。 */
  active: boolean
}

/**
 * 章节右栏 AI 面板（逻辑层见 `right/ai/`）。
 *
 * 统一输入区（不再区分快捷 / 对话模式）：
 * - 主体：对话记录（`.rp-card--list`，占满剩余高度、自动贴底）；
 * - 底部 `.ai-panel__composer`：作品设定开关（「携带内置提示词」，默认开启）+
 *   多行输入框（Enter 发送 / Shift+Enter 换行）+ 控件行（见 `AiControls`）。
 *
 * 请求口径：功能规则进 system，输入框内容 + 勾选的上下文进 user（见 `composeMessages`）；
 * 作品设定（书稿频道 + 分类风格约束，见 `bookContext.ts` / `useBookProfile`）只进 system，
 * 无论润色 / 续写 / 改写 / 翻译 / 自由对话都带（可由开关关闭）。
 * 「携带全文」（整章正文）与「携带选中文本」互斥，默认勾「选中文本」。
 *
 * 模型切换只写本面板的 `modelOverride`（作为 `useAiConversation` 的 `model` 入参），
 * **不写回**全局 AI 配置，避免临时选择污染设置页。
 *
 * 会话：同一本书可保存多条会话（跨章共享，切章不打断生成），头部会话栏一行承载
 * 「当前会话下拉 + ⋯ 操作 + 新建」（见 `AiSessionBar`）；默认打开该书最近一条
 * （见 `useAiSessions`），「新建」进入未落库草稿，首次发送时才创建会话；
 * 新建会话的首轮回复完成后由 AI 自动命名（失败回落首条消息截断）。
 *
 * 选区快照：点「发送」的瞬间读一次 `readEditorSelection(editor)` 存入 `selectionRef`
 * ——回插时用这份 range，不重新读，保证「发起请求时选中的那段」就是被替换 / 插入参照的那段。
 */
export function AiPanel({ bookId, chapterId, active }: AiPanelProps) {
  const { t } = useTranslation('ai')
  const { show: showToast, node: toastNode } = useToast()
  const { editor } = useRichTextEditor('chapter')

  /* ---------- 模型（仅本面板） ---------- */

  const modelsState = useAiModels(active)
  /** 面板内临时选择：null = 跟随全局配置的当前模型。 */
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const model = modelOverride ?? modelsState.current

  const modelOptions = useMemo(() => {
    if (model !== '' && !modelsState.models.includes(model)) {
      return [{ value: model, label: model }, ...modelsState.models.map(toOption)]
    }
    return modelsState.models.map(toOption)
  }, [model, modelsState.models])

  /* ---------- 输入 / 功能 / 上下文勾选 ---------- */

  const [action, setAction] = useState<AiComposeAction>('polish')
  const [input, setInput] = useState('')
  /** 携带整章正文（与 `carrySelection` 互斥）。 */
  const [carryFull, setCarryFull] = useState(false)
  /** 携带编辑器选中文本（默认勾选）。 */
  const [carrySelection, setCarrySelection] = useState(true)
  /**
   * 携带内置提示词（作品设定：频道 + 分类风格约束）：默认开启。
   * 与「携带全文 / 选中文本」不同——它进 system，所有功能（含自由对话）都带。
   */
  const [carryBuiltin, setCarryBuiltin] = useState(true)

  /** 当前书籍的作品设定（无书 / 未激活 / 读取失败 → context 为空串）。 */
  const profile = useBookProfile(bookId, active)

  /* ---------- 会话 ---------- */

  const {
    sessions: sessionList,
    activeSessionId,
    loading: sessionsLoading,
    select: selectSession,
    notifyCreated: notifySessionCreated,
    refresh: refreshSessions,
    rename: renameSession,
    remove: removeSession
  } = useAiSessions({ bookId, chapterId, active })

  const handleNewSession = useCallback((): void => {
    selectSession(null)
  }, [selectSession])

  /** 新建会话被 AI 自动命名后刷新列表（不改当前选中，避免抢回用户已切换的会话）。 */
  const handleSessionTitled = useCallback((): void => {
    void refreshSessions()
  }, [refreshSessions])

  const { messages, generating, compressing, hydrating, summary, notice, send, abort } =
    useAiConversation({
      bookId,
      chapterId,
      active,
      model,
      sessionId: activeSessionId,
      onSessionCreated: notifySessionCreated,
      onSessionTitled: handleSessionTitled
    })

  /** 发起请求瞬间的选区快照（回插依据；切章不清空，仅由下一次发送覆盖）。 */
  const selectionRef = useRef<EditorSelectionSnapshot | null>(null)

  /** 编辑器派生的只读指标（选区 / 全章字数、选区文案、焦点），订阅逻辑见 `useEditorMetrics`。 */
  const { selectionChars, totalChars, selectionText, selectionRange, editorFocused } =
    useEditorMetrics(editor)

  /**
   * 上下文占用估算：未压缩历史 + 已存摘要 + 输入框草稿 + 携带正文。
   * 窗口值按模型缓存，模型不变不重复 IPC；目录刷新后缓存失效并自动重取。
   */
  const usage = useContextUsage({
    model,
    messages,
    covered: summary?.covered ?? 0,
    summaryText: summary?.content ?? '',
    draft: input,
    carryContext: carryFull ? readFullText(editor) : carrySelection ? selectionText : '',
    active
  })

  /**
   * 编辑器失焦但仍有非空选区时，在正文里标出该选区（面板聚焦时 ProseMirror
   * 不渲染原生选区，用户看不到「会带进 AI 的是哪段」）。
   *
   * 聚焦期**不在此处清理**：聚焦由点击正文触发，同步 dispatch 清理事务会与
   * ProseMirror 本次鼠标选区处理同帧执行并把它覆盖掉，这一次点击就落不下光标
   * （要点第二下）。聚焦期由 CSS 隐藏饰带
   * （`.ProseMirror-focused .ai-selection-mirror`）；选区一变，插件随该事务清空
   * 快照（见 linkSelectionMirror.ts 的 apply）。
   */
  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined
    // 页签不可见 / 未勾选「携带选中文本」：选区不会带进 AI，不留高亮。
    if (!active || !carrySelection) {
      clearSelectionMirror(editor)
      return undefined
    }
    if (editorFocused || selectionRange === null) return undefined
    showSelectionMirror(editor, selectionRange, AI_SELECTION_MIRROR_CLASS)
  }, [active, carrySelection, editor, editorFocused, selectionRange])

  /** 发请求瞬间快照选区（回插 range 的真源）。 */
  const captureSelection = useCallback((): EditorSelectionSnapshot | null => {
    const snapshot = readEditorSelection(editor)
    selectionRef.current = snapshot
    return snapshot
  }, [editor])

  /* ---------- 回插 ---------- */

  /** 回插成功后刷新快照，避免连续回插仍指向已变化的旧 range（字数随 update 事件自更新）。 */
  const refreshSnapshot = useCallback((): void => {
    selectionRef.current = readEditorSelection(editor)
  }, [editor])

  const handleApplyReplace = useCallback(
    (text: string): void => {
      const snapshot = selectionRef.current
      const range = snapshot ?? readEditorSelection(editor)
      if (range !== null && replaceSelection(editor, text, { from: range.from, to: range.to })) {
        refreshSnapshot()
        showToast(t('panel.apply.replaced'))
        return
      }

      // 兜底：快照失配（文档已改动 / 切了章）时，用当前非空选区再试一次。
      const live = readEditorSelection(editor)
      if (
        live !== null &&
        !live.empty &&
        replaceSelection(editor, text, { from: live.from, to: live.to })
      ) {
        refreshSnapshot()
        showToast(t('panel.apply.replaced'))
        return
      }
      showToast(t('panel.apply.failed'))
    },
    [editor, refreshSnapshot, showToast, t]
  )

  const handleApplyInsert = useCallback(
    (text: string): void => {
      const snapshot = selectionRef.current
      const position = snapshot !== null ? snapshot.to : (editor?.state.selection.to ?? null)
      if (position !== null && insertAfter(editor, text, position)) {
        refreshSnapshot()
        showToast(t('panel.apply.inserted'))
        return
      }
      showToast(t('panel.apply.failed'))
    },
    [editor, refreshSnapshot, showToast, t]
  )

  /* ---------- 互斥勾选（谁被勾上，谁把另一个关掉） ---------- */

  const handleCarryFullChange = (checked: boolean): void => {
    setCarryFull(checked)
    if (checked) setCarrySelection(false)
  }

  const handleCarrySelectionChange = (checked: boolean): void => {
    setCarrySelection(checked)
    if (checked) setCarryFull(false)
  }

  /* ---------- 发送 ---------- */

  const handleSend = (): void => {
    // 生成中 / 整理上下文 / 会话或历史载入中由发送按钮切换成「停止」或禁用，此处再兜一层。
    if (generating || compressing || hydrating || sessionsLoading || chapterId === null) return

    const text = input.trim()
    const hasContext = carryFull ? totalChars > 0 : carrySelection ? selectionChars > 0 : false
    if (text === '' && !hasContext) return

    // 选区快照在点击发送的瞬间读（回插 range 依据），与本轮请求上下文同源。
    const snapshot = captureSelection()
    const context = carryFull ? readFullText(editor) : carrySelection ? (snapshot?.text ?? '') : ''
    if (text === '' && context.trim() === '') return

    const actionLabel = t(ACTION_LABEL_KEYS[action])
    const carryLabel = carryFull
      ? t('panel.carry.fullLabel')
      : carrySelection
        ? t('panel.carry.selectionLabel')
        : ''
    const display =
      text === '' ? `[${actionLabel}]${carryLabel !== '' ? ` ${carryLabel}` : ''}` : undefined
    const draft = input
    setInput('')
    void send({
      action,
      input: text,
      context,
      ...(display !== undefined ? { display } : {}),
      // 作品设定只进 system（见 `composeMessages`）；开关关闭 / 无文本时不传。
      ...(carryBuiltin ? { bookContext: profile.context } : {})
    }).then((accepted) => {
      // 超预算被拒：消息未发出，把输入恢复回输入框，方便换模型 / 减少携带内容后重发。
      if (!accepted) setInput(draft)
    })
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    handleSend()
  }

  /* ---------- 对话区自动贴底 ---------- */

  const listRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const list = listRef.current
    if (list === null) return
    list.scrollTop = list.scrollHeight
  }, [messages])

  /* ---------- 渲染 ---------- */

  if (!active) return null

  if (chapterId === null) {
    return (
      <div className="rp-panel rp-panel--center">
        <div className="rp-list-empty">{t('panel.empty.noChapter')}</div>
      </div>
    )
  }

  const modelHint = modelsState.loading
    ? t('panel.model.loading')
    : modelOptions.length === 0 && modelsState.error === null
      ? t('panel.model.empty')
      : null

  const canSend =
    !compressing &&
    !hydrating &&
    !sessionsLoading &&
    (input.trim() !== '' ||
      (carryFull ? totalChars > 0 : carrySelection ? selectionChars > 0 : false))

  const carryHint = carryFull
    ? t('panel.carry.fullCount', { chars: totalChars })
    : carrySelection
      ? selectionChars > 0
        ? t('panel.carry.selectionCount', { chars: selectionChars })
        : t('panel.carry.selectionEmpty')
      : t('panel.carry.none')

  const actionOptions = [
    ...AI_QUICK_ACTIONS.map((item) => ({ value: item, label: t(ACTION_LABEL_KEYS[item]) })),
    { value: 'chat', label: t(ACTION_LABEL_KEYS.chat) }
  ]

  const emptyText =
    hydrating || (sessionsLoading && sessionList.length === 0)
      ? t('panel.sessions.loading')
      : t('panel.empty.chat')

  return (
    <div className="rp-panel">
      {/* 会话栏：一行承载「当前会话下拉 + 操作 + 新建」（见 AiSessionBar） */}
      <AiSessionBar
        sessions={sessionList}
        activeSessionId={activeSessionId}
        busy={generating}
        onSelect={selectSession}
        onCreate={handleNewSession}
        onRename={renameSession}
        onDelete={removeSession}
      />

      {/* 主体：对话记录（占满剩余高度，自身滚动） */}
      <div ref={listRef} className="rp-card rp-card--list ai-chat">
        {messages.length === 0 ? (
          <div className="rp-list-empty">{emptyText}</div>
        ) : (
          messages.map((message) =>
            message.divider !== undefined ? (
              <div key={message.id} className="ai-chat__divider" role="separator">
                {t(
                  message.divider.kind === 'truncated' ? 'message.truncated' : 'message.compacted',
                  { rounds: message.divider.rounds }
                )}
              </div>
            ) : (
              <ChatMessage
                key={message.id}
                message={message}
                canApply={canApplyMessage(message, chapterId)}
                fromOtherChapter={message.chapterId != null && message.chapterId !== chapterId}
                onApplyReplace={handleApplyReplace}
                onApplyInsert={handleApplyInsert}
              />
            )
          )
        )}
      </div>

      {/* 统一输入区：作品设定开关 + 第一行输入，第二行模型 / 功能 / 上下文 / 发送 */}
      <div className="ai-panel__composer">
        <BuiltinPrompt
          enabled={carryBuiltin}
          onToggle={setCarryBuiltin}
          text={profile.context}
          hasCategories={profile.hasCategories}
        />
        <Textarea
          className="ai-panel__input"
          size="sm"
          rows={3}
          value={input}
          placeholder={t('panel.composer.placeholder')}
          aria-label={t('panel.composer.placeholder')}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
        <AiControls
          model={model}
          modelOptions={modelOptions}
          onModelChange={setModelOverride}
          action={action}
          actionOptions={actionOptions}
          onActionChange={setAction}
          carryFull={carryFull}
          carrySelection={carrySelection}
          onToggleCarryFull={() => handleCarryFullChange(!carryFull)}
          onToggleCarrySelection={() => handleCarrySelectionChange(!carrySelection)}
          generating={generating}
          canSend={canSend}
          onSend={handleSend}
          onAbort={abort}
        />
        <AiComposerStatus
          error={modelsState.error}
          errorLoading={modelsState.loading}
          onRefresh={modelsState.refresh}
          modelHint={modelHint}
          hint={carryHint}
          usage={usage}
          compressing={compressing}
          notice={notice}
        />
      </div>

      {toastNode}
    </div>
  )
}

export default AiPanel

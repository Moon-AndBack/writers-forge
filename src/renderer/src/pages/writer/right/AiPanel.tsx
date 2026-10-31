import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { Button, Textarea, useToast } from '../../../components/ui'
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
import { useAiConversation, type AiConversationMessage } from './ai/useAiConversation'
import { useAiModels } from './ai/useAiModels'
import { useBookProfile } from './ai/useBookProfile'
import { AiControls } from './ai/AiControls'
import { BuiltinPrompt } from './ai/BuiltinPrompt'
import { AI_ERROR_TEXT_KEYS } from './ai/aiErrorText'
import { ChatMessage } from './ai/ChatMessage'

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

  const { messages, generating, send, abort } = useAiConversation({
    bookId,
    chapterId,
    active,
    model
  })

  /** 发起请求瞬间的选区快照（回插依据；切章不清空，仅由下一次发送覆盖）。 */
  const selectionRef = useRef<EditorSelectionSnapshot | null>(null)

  /**
   * 编辑器字数（选区 / 全章）：只用于面板提示。
   *
   * 走 `useSyncExternalStore` 订阅编辑器的 `selectionUpdate` / `update`——面板聚焦在
   * 输入框时选区仍在编辑器内部状态里，用户回正文改选 / 打字后提示要跟着变；
   * 不在 effect 里 setState（避免级联渲染）。
   *
   * 额外订阅 `focus` / `blur`：选区镜像只在失焦期存在，而 blur 不触发
   * `selectionUpdate`（选区本身没变），只能靠这两个事件驱动重渲染。
   */
  const subscribeEditor = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!editor || editor.isDestroyed) return () => undefined
      editor.on('selectionUpdate', onStoreChange)
      editor.on('update', onStoreChange)
      editor.on('focus', onStoreChange)
      editor.on('blur', onStoreChange)
      return () => {
        editor.off('selectionUpdate', onStoreChange)
        editor.off('update', onStoreChange)
        editor.off('focus', onStoreChange)
        editor.off('blur', onStoreChange)
      }
    },
    [editor]
  )
  /** 选区 range 缓存：`getSnapshot` 必须返回引用稳定的值（每次新建对象会触发无限重渲染）。 */
  const selectionRangeRef = useRef<{ from: number; to: number } | null>(null)
  const readSelectionRange = useCallback((): { from: number; to: number } | null => {
    const snapshot = readEditorSelection(editor)
    const next =
      snapshot === null || snapshot.empty ? null : { from: snapshot.from, to: snapshot.to }
    const prev = selectionRangeRef.current
    if (prev !== null && next !== null && prev.from === next.from && prev.to === next.to) {
      return prev
    }
    selectionRangeRef.current = next
    return next
  }, [editor])
  const selectionChars = useSyncExternalStore(
    subscribeEditor,
    () => readSelectionChars(editor),
    () => 0
  )
  const totalChars = useSyncExternalStore(
    subscribeEditor,
    () => readTotalChars(editor),
    () => 0
  )
  /** 当前非空选区（空选区 → null）；镜像饰带与字数提示同源。 */
  const selectionRange = useSyncExternalStore(subscribeEditor, readSelectionRange, () => null)
  const editorFocused = useSyncExternalStore(
    subscribeEditor,
    () => editor !== null && !editor.isDestroyed && editor.isFocused,
    () => false
  )

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
    // 生成中由发送按钮切换成「停止」，此处再兜一层（Enter 快捷键也能触发）。
    if (generating || chapterId === null) return

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
    send({
      action,
      input: text,
      context,
      ...(display !== undefined ? { display } : {}),
      // 作品设定只进 system（见 `composeMessages`）；开关关闭 / 无文本时不传。
      ...(carryBuiltin ? { bookContext: profile.context } : {})
    })
    setInput('')
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

  const modelErrorText =
    modelsState.error !== null
      ? t('panel.model.failed', {
          message: t(AI_ERROR_TEXT_KEYS[modelsState.error.code])
        })
      : null

  const canSend =
    input.trim() !== '' ||
    (carryFull ? totalChars > 0 : carrySelection ? selectionChars > 0 : false)

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

  return (
    <div className="rp-panel">
      {/* 主体：对话记录（占满剩余高度，自身滚动） */}
      <div ref={listRef} className="rp-card rp-card--list ai-chat">
        {messages.length === 0 ? (
          <div className="rp-list-empty">{t('panel.empty.chat')}</div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              canApply={canApplyMessage(message)}
              onApplyReplace={handleApplyReplace}
              onApplyInsert={handleApplyInsert}
            />
          ))
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
        {modelErrorText !== null ? (
          <div className="ai-panel__error" role="alert">
            <span>{modelErrorText}</span>
            <Button
              size="sm"
              variant="ghost"
              loading={modelsState.loading}
              onClick={modelsState.refresh}
            >
              {t('panel.model.refresh')}
            </Button>
          </div>
        ) : null}
        {modelsState.loading ? (
          <div className="ai-panel__hint">{t('panel.model.loading')}</div>
        ) : modelOptions.length === 0 && modelErrorText === null ? (
          <div className="ai-panel__hint">{t('panel.model.empty')}</div>
        ) : null}
        <div className="ai-panel__hint">{carryHint}</div>
      </div>

      {toastNode}
    </div>
  )
}

/** assistant 回复可回插的判定：非流式、无错误、正文非空（user 消息恒不可回插）。 */
function canApplyMessage(message: AiConversationMessage): boolean {
  return (
    message.role === 'assistant' &&
    message.streaming !== true &&
    message.error === undefined &&
    message.content.trim() !== ''
  )
}

/** 当前选区字数（空选区 / 无编辑器 → 0）。 */
function readSelectionChars(editor: Editor | null): number {
  const snapshot = readEditorSelection(editor)
  return snapshot === null || snapshot.empty ? 0 : snapshot.text.length
}

/**
 * 整章正文（段落之间以空行分隔）。
 *
 * 直接取纯文本会把各文本节点首尾相接、段间没有换行，送进模型后是一坨连续文字；
 * `textBetween` 用 `\n\n` 把段落读回来，模型才能感知分段。发送与字数统计共用本函数，
 * 保证两者口径一致（分隔符也计入字数）。
 */
function readFullText(editor: Editor | null): string {
  if (!editor || editor.isDestroyed) return ''
  const { doc } = editor.state
  return doc.textBetween(0, doc.content.size, '\n\n')
}

/** 整章正文字数（与「携带全文」发送的内容同源，含段间分隔符）。 */
function readTotalChars(editor: Editor | null): number {
  return readFullText(editor).length
}

/** 模型 ID → 下拉选项（展示名与 ID 一致）。 */
function toOption(value: string): { value: string; label: string } {
  return { value, label: value }
}

export default AiPanel

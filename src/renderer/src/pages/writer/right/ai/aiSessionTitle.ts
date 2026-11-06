import type { AiProviderId } from '../../../../../../preload/types/ai'
import { chatLog } from './chatRuntime'
import type { ActiveRequest } from './chatRuntime'

/**
 * 新建会话的 AI 自动命名。
 *
 * 时机：本次新建会话的首轮回复**正常完成**（`handleDone`）后异步触发，不阻塞 UI；
 * 失败只记日志并回落首条消息截断。写入走 `renameIfEmpty`（仅标题为空时生效），
 * 因此用户在生成中 / 生成后手动改过的名字不会被覆盖。
 */

/** 标题请求的输出上限：标题很短，32 token 足够且能压住模型「顺手解释」的倾向。 */
const TITLE_MAX_TOKENS = 32
/** 写入库的标题字符上限（与窄栏展示 / 输入框 200 上限取更小值）。 */
const TITLE_MAX_CHARS = 40
/** 兜底标题（截断首条消息）的字符上限。 */
const FALLBACK_MAX_CHARS = 24
/** 送进 prompt 的首条用户消息 / 助手回复截断长度。 */
const USER_TEXT_MAX_CHARS = 1000
const ASSISTANT_TEXT_MAX_CHARS = 1500

const TITLE_SYSTEM_PROMPT = [
  '你在为写作助手的对话生成标题。',
  '根据作者提问与助手回复，用 6–14 个简体汉字概括这段对话的主题。',
  '只输出标题本身：不要引号、书名号、序号、标点、解释或前后缀。'
].join('\n')

/** 清理模型输出：单行化、去包裹引号与序号、去尾部标点，最后压到长度上限。 */
function normalizeTitle(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’「」『』《》]+/, '')
    .replace(/[\s"'“”‘’「」『』《》]+$/, '')
    .replace(/^\d+\s*[.、:：)]\s*/, '')
    .replace(/[。．.!！?？]+$/, '')
    .trim()
    .slice(0, TITLE_MAX_CHARS)
}

/**
 * 首条消息截断兜底：折叠空白后取前 24 字；空文本返回空串（调用方跳过写入）。
 */
export function fallbackTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized === '' ? '' : normalized.slice(0, FALLBACK_MAX_CHARS)
}

/**
 * 调用 AI 生成会话标题；失败返回 `null`（调用方回落 `fallbackTitle`）。
 *
 * 复用 `ai:chat:complete`（非流式、独立 requestId），不占面板的流式请求表，
 * 也不会被面板的「停止」中止。
 */
export async function generateSessionTitle(input: {
  provider: AiProviderId
  model: string
  firstUserText: string
  firstAssistantText: string
}): Promise<string | null> {
  const userText = input.firstUserText.trim()
  const assistantText = input.firstAssistantText.trim()
  if (userText === '' && assistantText === '') return null

  const api = window.api?.ai
  if (!api) return null

  const content = [
    '【作者提问】',
    userText.slice(0, USER_TEXT_MAX_CHARS),
    '【助手回复】',
    assistantText.slice(0, ASSISTANT_TEXT_MAX_CHARS)
  ].join('\n')

  try {
    const result = await api.chat.complete({
      messages: [
        { role: 'system', content: TITLE_SYSTEM_PROMPT },
        { role: 'user', content }
      ],
      provider: input.provider,
      ...(input.model.trim() !== '' ? { model: input.model.trim() } : {}),
      maxTokens: TITLE_MAX_TOKENS
    })
    if (!result.ok || result.text === undefined) {
      chatLog.warn('AI 会话标题生成失败', result.error?.code)
      return null
    }
    const title = normalizeTitle(result.text)
    return title === '' ? null : title
  } catch (error) {
    chatLog.warn('AI 会话标题生成异常', error)
    return null
  }
}

/**
 * 生成并写入标题（AI 结果为空时用首条消息截断兜底）。
 *
 * 写入使用 `renameIfEmpty`：仅当库内标题仍为空才落库，原子地避免覆盖用户改名。
 */
async function applySessionTitle(input: {
  sessionId: number
  provider: AiProviderId
  model: string
  firstUserText: string
  assistantText: string
  onApplied?: () => void
}): Promise<void> {
  const generated = await generateSessionTitle({
    provider: input.provider,
    model: input.model,
    firstUserText: input.firstUserText,
    firstAssistantText: input.assistantText
  })
  const title =
    generated ?? (fallbackTitle(input.firstUserText) || fallbackTitle(input.assistantText))
  if (title === '') return

  const api = window.api?.ai
  if (!api) return
  try {
    const ok = await api.sessions.renameIfEmpty(input.sessionId, title)
    if (ok) input.onApplied?.()
  } catch (error) {
    chatLog.warn('AI 会话标题写入失败', error)
  }
}

/**
 * `handleDone` 的自动命名入口：仅当请求带 `autoTitle`（本次新建会话）时触发。
 * 不返回 Promise（fire-and-forget），失败只记日志，不影响本轮回复定稿。
 */
export function autoTitleSession(request: ActiveRequest, onApplied?: () => void): void {
  const spec = request.autoTitle
  if (spec === undefined || request.sessionId === null) return

  void applySessionTitle({
    sessionId: request.sessionId,
    provider: spec.provider,
    model: spec.model,
    firstUserText: spec.firstUserText,
    assistantText: request.content,
    ...(onApplied !== undefined ? { onApplied } : {})
  })
}

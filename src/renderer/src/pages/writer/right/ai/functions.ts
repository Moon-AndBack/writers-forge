/**
 * 章节右栏 AI · prompt 模板与请求组装（纯常量 + 纯函数，无 React / 无 IPC）。
 *
 * 设计取舍：
 * - **prompt 集中一处**：`CHAT_SYSTEM_PROMPT` 从 `chatRuntime.ts` 搬到本文件——两个
 *   system prompt（自由对话 / 快捷功能）都由本文件的 `composeMessages` 产出，放同一处
 *   便于对照口径；`chatRuntime.ts` 只留运行期工具（id 生成 / 落库 / 会话载入）；
 * - **输出口径优先**：章节正文是「每段一个 paragraph」的纯段落口径（见 `ChaptersView` 的
 *   StarterKit 裁剪），故所有 prompt 都要求纯段落输出、禁用标题 / 列表 / 代码块，
 *   避免模型给出无法直接回插正文的 markdown 结构；
 * - **复合指令**：统一输入区下，「功能规则」进 system，「用户输入 + 上下文」进 user；
 *   上下文用 `【…】` 分隔标记包裹（见 `BLOCK_*`），模型能明确区分「待处理正文」与
 *   「我的补充要求」，避免把指令当正文改写；
 * - **翻译方向由模型判定**：签名不额外引入「目标语言」参数，system prompt 要求按原文主要
 *   语言在中 ↔ 英之间自动选向。
 */

/** 快捷功能标识。 */
export type AiQuickAction = 'polish' | 'continue' | 'rewrite' | 'translate'

/** 面板请求类型：「自由对话」与快捷功能同处一个下拉（统一输入区）。 */
export type AiComposeAction = AiQuickAction | 'chat'

/** 全部快捷功能（按面板展示顺序；供后续 UI 生成按钮）。 */
export const AI_QUICK_ACTIONS: readonly AiQuickAction[] = [
  'polish',
  'continue',
  'rewrite',
  'translate'
]

/**
 * 自由对话的系统提示（不落库，仅随请求发送）。
 *
 * 与快捷模式口径一致：回答可直接作为正文段落，不用 markdown 标题 / 列表 / 代码块，
 * 让「复制 / 回插」在任何功能下表现一致。
 */
export const CHAT_SYSTEM_PROMPT = [
  '你是一名协助作者打磨小说正文的写作助手，回答使用简体中文，直接、具体。',
  '若给出可直接插入正文的段落，用连续的自然段落表达，不要使用标题（#）、列表（- / 1.）、引用（>）或 markdown 代码块。'
].join('\n')

/**
 * user 消息里的块标记。
 *
 * - `PROCESS`：要处理的正文（选中文本 / 整章正文）——快捷功能用；
 * - `REQUIREMENT`：作者在输入框里写的补充要求——与 `PROCESS` 同时出现时加此标记，
 *   让模型知道这段是「怎么改」而不是「要改的内容」；
 * - `REFERENCE`：自由对话的参考上下文（语气上是参考资料，不是待改写对象）。
 */
const BLOCK_PROCESS = '【待处理正文】'
const BLOCK_REQUIREMENT = '【补充要求】'
const BLOCK_REFERENCE = '【上下文】'

/**
 * 所有功能共用的输出格式约束。
 *
 * 三条要求分别对应：可直接回插（无解释 / 引导语）、不产生非 paragraph 块（禁 markdown 结构）、
 * 段落边界清晰（空行分段，不会被 `applyToEditor` 拼成一段）。
 */
const OUTPUT_RULES = `输出格式（必须遵守）：
- 只输出可直接放入小说正文的成品文字，不要解释、不要前言或结语、不要称呼、不要「以下是……」之类的引导语；
- 不要用 markdown 代码块包裹，不要使用标题（#）、列表（- / 1.）、引用（>）或表格；
- 用连续的自然段落表达，需要分段时用空行分隔；不要输出分隔线。`

/** 各功能的 system prompt 主体（各自的任务与要求）。 */
const QUICK_TASK_PROMPTS: Record<AiQuickAction, string> = {
  polish: `你是一名资深中文小说编辑，负责润色作者选中的正文。
任务：在不改变原意与信息量的前提下，只改写表达。

要求：
- 保留原文的全部事实、人物、动作、对白与情节细节，不增删内容、不补充设定；
- 修正语病、歧义、冗余与重复用词，让句子更准确、顺畅、有节奏；
- 调整不自然的语序与搭配，但不要为了华丽而堆砌辞藻；
- 保持原文的人称、视角、时态与语气（书面或口语、冷峻或抒情）一致；
- 篇幅与原文相当，不扩写、不缩写。`,

  continue: `你是一名与作者协作的小说写手，任务是基于作者选中的正文继续往下写。

要求：
- 从选中文本的结尾处自然承接，不重复、不复述、不总结已有内容；
- 沿用原文的人称、视角、时态、语气与叙事节奏，保持同一位叙述者的声音；
- 与已有的人物性格、场景、时间线保持一致，不引入未铺垫的新设定或新人物；
- 推进情节或深化场景，写出具体可感的动作、对白或细节，避免空泛抒情；
- 篇幅约 150～300 字（2～4 段），在自然的停顿处收笔，不要强行收束整章。`,

  rewrite: `你是一名资深中文编辑，负责重写作者选中的正文。

要求：
- 重写后必须与原文在句子层面明显不同：不得复用原句结构，不得只替换同义词；
- 可以重排段落与叙述顺序，用新的组织方式重建同一场景；
- 可以增删修饰、调整详略与节奏，篇幅可明显增减，但不得改变事实、人物关系与情节走向；
- 默认保持原文的人称、视角与语气；
- 若【补充要求】指定了人称、视角、语气或改写方向，以补充要求为准，此时可不受「保持原视角」的限制。`,

  translate: `你是一名专业文学译者，负责在中英之间互译作者选中的正文。

要求：
- 先判断原文的主要语言：中文译成英文，英文译成中文；中英混排时以叙述主体语言为准；
- 译文准确传达原意、语气与潜台词，符合目标语言的文学表达习惯，避免逐字直译与翻译腔；
- 保留原文的段落划分与叙述节奏，人名、地名与专有名词前后一致；
- 只输出译文，不要附上原文、音标或注释。`
}

/** 丢弃空段后再拼接（`bookContext` 可为空 / 全空白，此时不留空行）。 */
function joinPromptParts(parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => part !== undefined && part.trim() !== '')
    .join('\n\n')
}

/**
 * 构造快捷操作的 system prompt（任务规则 → 作品设定 → 输出格式约束）。
 * @param action 功能标识
 * @param bookContext 作品设定（书籍频道 / 分类风格约束，见 `bookContext.ts`）；可省略
 */
export function buildQuickSystemPrompt(action: AiQuickAction, bookContext?: string): string {
  return joinPromptParts([QUICK_TASK_PROMPTS[action], bookContext, OUTPUT_RULES])
}

/** 一次发送请求的组成要素（来自统一输入区）。 */
export interface AiComposeInput {
  /** 功能（含「自由对话」）。 */
  action: AiComposeAction
  /** 用户输入框的内容（可能为空）。 */
  input: string
  /** 勾选的上下文（选中文本或整章正文；未勾选时为空串）。 */
  context: string
  /**
   * 气泡展示文本（可选）：用户输入为空时由面板传入占位文案（如「[润色] 整章正文」）。
   * 仅用于 UI 显示与落库，不参与发给模型的 user 消息组装。
   */
  display?: string
  /**
   * 作品设定（可选）：按当前书籍频道 / 分类拼出的写作风格约束（见 `bookContext.ts`）。
   * 只进 system（任务规则之后、输出格式约束之前），不进 user；面板关闭「携带内置提示词」时不传。
   */
  bookContext?: string
}

/** 请求消息（只产出 system / user；assistant 历史由调用方按需插入）。 */
export interface AiComposeMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * 组装一次请求：`system` + `user` 两条消息。
 *
 * 规则：
 * - `action === 'chat'`：system 走 `CHAT_SYSTEM_PROMPT`（+ 作品设定），user = 输入 [+ `【上下文】`块]；
 * - 其他功能：system 走 `buildQuickSystemPrompt(action, bookContext)`，
 *   user = [`【补充要求】`+ 输入] + [`【待处理正文】`+ 上下文]——无上下文时输入不加标记
 *   （此时它既是要求也是唯一素材，与旧版快捷口径一致），无输入时只发上下文块；
 * - `bookContext` 为作品设定（书籍频道 / 分类风格约束）：有值时追加在任务规则之后、
 *   输出格式约束之前（自由对话则接在系统提示之后），只进 system、不进 user；
 * - **输入与上下文都为空**（trim 后）：返回空数组，由调用方决定是否禁止发送。
 */
export function composeMessages(input: AiComposeInput): AiComposeMessage[] {
  const text = input.input.trim()
  const context = input.context.trim()
  if (text === '' && context === '') return []

  const bookContext = input.bookContext?.trim() ?? ''

  if (input.action === 'chat') {
    const parts: string[] = []
    if (text !== '') parts.push(text)
    if (context !== '') parts.push(`${BLOCK_REFERENCE}\n${context}`)
    return [
      { role: 'system', content: joinPromptParts([CHAT_SYSTEM_PROMPT, bookContext]) },
      { role: 'user', content: parts.join('\n\n') }
    ]
  }

  const parts: string[] = []
  if (text !== '') {
    parts.push(context !== '' ? `${BLOCK_REQUIREMENT}\n${text}` : text)
  }
  if (context !== '') parts.push(`${BLOCK_PROCESS}\n${context}`)

  return [
    { role: 'system', content: buildQuickSystemPrompt(input.action, bookContext) },
    { role: 'user', content: parts.join('\n\n') }
  ]
}

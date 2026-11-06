/**
 * 内置模型上下文窗口基线表（离线兜底）。
 *
 * 本项目 AGENTS 约定「代码内不硬编码任何模型名」（见 config.ts）。
 * 本表是例外：它只提供「能力元数据」的离线兜底，不用于判断模型是否存在或可用；
 * 运行时目录拉取成功后以目录为准；两者都不可用时回落 DEFAULT_CONTEXT_WINDOW。
 *
 * 键为小写模型名（或末段名），值为上下文窗口 tokens。
 * 数值为各厂商公开文档标注的**最大**上下文窗口；截至 2026-11，需随目录刷新。
 * 本表只用于限额估算，不参与模型可用性判断、模型列表展示或请求发送。
 */
export const BASELINE_CONTEXT_WINDOWS: Record<string, number> = {
  // DeepSeek
  'deepseek-chat': 128_000,
  'deepseek-reasoner': 128_000,
  'deepseek-coder': 128_000,
  'deepseek-v3': 128_000,
  'deepseek-r1': 128_000,

  // OpenAI
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4.1': 1_047_576,
  'gpt-4.1-mini': 1_047_576,
  'gpt-4.1-nano': 1_047_576,
  'gpt-4-turbo': 128_000,
  'gpt-3.5-turbo': 16_385,
  o1: 200_000,
  o3: 200_000,
  'o4-mini': 200_000,

  // Anthropic
  'claude-opus-4': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-3-5-sonnet': 200_000,
  'claude-3-5-haiku': 200_000,
  'claude-3-opus': 200_000,
  'claude-3-haiku': 200_000,

  // Google
  'gemini-2.5-pro': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
  'gemini-2.0-flash': 1_048_576,

  // 常见开源模型
  'llama-3.1-70b': 131_072,
  'llama-3.3-70b': 131_072,
  'qwen-2.5-72b': 131_072,
  'qwen3-235b': 131_072,
  'mistral-large': 131_072,
  'mixtral-8x7b': 32_768
}

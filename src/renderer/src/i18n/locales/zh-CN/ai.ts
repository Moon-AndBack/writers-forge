/**
 * AI 文案命名空间（`ai`）：设置页 AI 配置分区，以及后续右栏 AI 对话面板。
 *
 * 约定：
 * - 错误码文案与主进程 `AiErrorCode` 的 12 个值一一对应（`error.*`），供设置页与
 *   对话面板共用；渲染层以静态映射取用，不做字符串拼接 key。
 * - 服务商展示名（DeepSeek / opencode）为品牌标识，保持原文。
 */
const ai = {
  section: {
    title: 'AI 助手',
    description: '配置用于写作辅助的大模型服务；API Key 仅经系统安全存储加密后保存在本地'
  },
  provider: {
    label: '服务商',
    description: '选择提供模型服务的平台',
    deepseek: 'DeepSeek',
    opencode: 'OpenCode Go',
    opencodeHint: 'OpenCode Go 使用 OpenAI 兼容接口'
  },
  baseUrl: {
    label: 'Base URL',
    description: '接口地址，需包含版本路径',
    placeholder: 'https://api.deepseek.com/v1',
    placeholderOpencode: 'https://opencode.ai/inference/go',
    hint: '可填中转站地址；留空则恢复默认地址'
  },
  model: {
    label: '模型',
    description: '从服务商动态拉取，或手动填写模型 ID',
    placeholder: '选择或输入模型 ID',
    refresh: '刷新',
    loading: '正在获取模型列表…',
    empty: '未获取到模型，请手动填写模型 ID',
    failed: '获取模型列表失败：{{message}}',
    custom: '自定义模型…',
    useList: '从列表选择'
  },
  apiKey: {
    label: 'API Key',
    description: '密钥经系统安全存储加密后保存在本地',
    placeholder: '输入 API Key',
    placeholderSaved: '已保存 {{masked}}，输入新密钥以替换',
    saved: '已保存：{{masked}}',
    save: '保存',
    clear: '清除',
    encryptionUnavailable: '当前环境不支持安全存储，无法保存密钥',
    opencodeHint: '需使用 OpenCode Console 生成的 oc_sk_ 开头的 Personal API Key',
    savedToast: 'API Key 已保存',
    clearedToast: 'API Key 已清除',
    saveFailed: 'API Key 操作失败，请重试'
  },
  test: {
    label: '测试连接',
    description: '拉取一次模型列表以验证配置（不会发送任何正文）',
    button: '测试',
    testing: '正在测试…',
    success: '连接成功',
    failed: '连接失败：{{message}}',
    latency: '延迟 {{latency}} ms'
  },
  error: {
    network: '网络错误，请检查网络连接或 Base URL',
    timeout: '请求超时，请稍后重试',
    auth: '鉴权失败，请检查 API Key',
    rate_limit: '请求过于频繁，请稍后重试',
    invalid_request: '请求参数有误，请检查 Base URL 与模型 ID',
    upstream: '服务商返回错误，请稍后重试',
    aborted: '请求已取消',
    unknown: '未知错误，请稍后重试',
    plan_restricted: '当前档位不支持该模型，请更换模型或升级档位',
    session_missing: '会话标识缺失，请重新打开对话后重试',
    auth_missing: '尚未配置 API Key',
    auth_invalid: 'API Key 无效或已过期，请重新填写'
  },
  panel: {
    model: {
      label: '模型',
      aria: '切换模型（仅对本面板生效）',
      loading: '正在获取模型列表…',
      empty: '未获取到模型，将使用默认模型',
      refresh: '刷新',
      failed: '获取模型失败：{{message}}'
    },
    action: {
      label: '功能',
      polish: '润色',
      continue: '续写',
      rewrite: '改写',
      translate: '翻译',
      chat: '自由对话'
    },
    carry: {
      full: '携带全文',
      selection: '携带选中文本',
      fullLabel: '整章正文',
      selectionLabel: '选中文本',
      fullCount: '全文 {{chars}} 字',
      selectionCount: '已选 {{chars}} 字',
      selectionEmpty: '未选中正文',
      none: '未携带上下文'
    },
    builtin: {
      toggle: '携带内置提示词',
      expand: '展开',
      collapse: '收起',
      baseHint: '未设分类，使用通用写作约束'
    },
    composer: {
      placeholder: '输入你的要求，Enter 发送，Shift+Enter 换行'
    },
    stop: '停止',
    empty: {
      noChapter: '请先选择一个章节',
      chat: '还没有对话，输入内容或勾选上下文后发送'
    },
    chat: {
      send: '发送'
    },
    apply: {
      replace: '替换选中',
      insert: '插入到光标后',
      replaced: '已替换选中正文',
      inserted: '已插入到光标后',
      failed: '写入正文失败：章节可能已定稿（只读），或编辑器不可用'
    }
  }
}

export default ai

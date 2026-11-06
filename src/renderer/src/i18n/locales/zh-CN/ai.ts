/**
 * AI 文案命名空间（`ai`）：设置页 AI 配置分区，以及后续右栏 AI 对话面板。
 *
 * 约定：
 * - 错误码文案与主进程 `AiErrorCode` 的 14 个值一一对应（`error.*`），供设置页与
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
  catalog: {
    label: '模型目录',
    description: '用于识别各模型的上下文窗口；离线时使用内置基线',
    refresh: '刷新模型目录',
    loading: '正在刷新模型目录…',
    summary: '已收录 {{count}} 个模型',
    updatedAt: '更新于 {{time}}',
    stale: '目录已过期，建议刷新',
    idle: '尚未获取目录，将使用内置基线',
    failed: '刷新模型目录失败：{{message}}'
  },
  compression: {
    enabled: {
      label: '启用自动压缩',
      description:
        '达到上下文窗口 80% 时，发送前自动把较早对话压成摘要；关闭后仍显示占用、仍按预算省略较早对话，但不再生成摘要（不额外消耗额度）'
    },
    window: {
      label: '自定义上下文窗口',
      description:
        '模型目录匹配不到的模型可手动指定窗口（按模型名保存，范围 1024–10000000 tokens）；保存后占用条与压缩阈值立即按新窗口计算',
      modelPlaceholder: '模型 ID',
      tokensPlaceholder: 'tokens',
      save: '保存',
      remove: '删除',
      empty: '尚未自定义任何模型窗口',
      modelRequired: '请先填写模型 ID',
      invalidTokens: '窗口需为 1024–10000000 之间的整数',
      saveFailed: '保存失败，请重试'
    }
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
    auth_invalid: 'API Key 无效或已过期，请重新填写',
    forbidden: '无权访问该模型（地区限制或账号权限不足），请更换模型或检查账号权限',
    insufficient_quota: '账户余额不足，请充值后重试'
  },
  message: {
    /** 上游报错中断的结构化标记（随消息 `status` 展示，不进正文）。 */
    interrupted: '此回复因错误中断',
    /** 上下文压缩分隔行（不是气泡，不进正文）。 */
    compacted: '已压缩前 {{rounds}} 轮对话',
    /** 摘要生成失败 / 后续再超限时的纯截断说明。 */
    truncated: '摘要暂不可用，已省略较早的 {{rounds}} 轮对话'
  },
  panel: {
    model: {
      label: '模型',
      aria: '切换模型（仅对本面板生效）',
      loading: '正在获取模型列表…',
      empty: '未获取到模型，将使用默认模型',
      refresh: '刷新',
      refreshAria: '刷新模型列表',
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
    context: {
      label: '上下文',
      summary: '{{used}} / {{limit}}（{{percent}}）',
      percent: '{{ratio}}%',
      unknownModel: '未知模型 · 按 {{tokens}} 估算',
      matchedFrom: '匹配自 {{id}}',
      calibrated: '已按最近一次真实用量校准',
      nearLimit: '接近上限',
      overLimit: '已超上限',
      compressing: '正在整理上下文…',
      overBudget: '本期对话过长：约 {{used}} / {{limit}}（上下文窗口）',
      overBudgetHint: '建议换用窗口更大的模型、手动填写模型窗口，或减少携带的正文。'
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
    sessions: {
      title: '会话',
      current: '当前会话',
      draft: '新对话',
      untitled: '会话 {{id}}',
      openCount: '会话（{{count}}）',
      new: '新建',
      rename: '重命名',
      renameTitle: '重命名会话',
      renameLabel: '会话名称',
      renameFailed: '重命名失败，请重试',
      save: '保存',
      cancel: '取消',
      close: '关闭',
      delete: '删除',
      deleteTitle: '删除会话',
      deleteConfirm: '确定删除「{{title}}」吗？该会话的全部消息将一并删除，且无法恢复。',
      deleteFailed: '删除会话失败，请重试',
      busyHint: '生成中无法切换或管理会话，请先停止生成。',
      loading: '正在载入会话…',
      empty: '该章还没有会话，点「新建」开始一段新对话。'
    },
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

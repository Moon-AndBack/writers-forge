/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * 说明：服务商展示名（DeepSeek / opencode）为品牌标识，保留原文。
 */
import type { ZhCNResources } from '../zh-CN'

const ai = {
  section: {
    title: 'AI assistant',
    description:
      'Configure the model service used for writing assistance; the API key is stored locally, encrypted by system secure storage'
  },
  provider: {
    label: 'Provider',
    description: 'Choose the platform that offers model access',
    deepseek: 'DeepSeek',
    opencode: 'OpenCode Go',
    opencodeHint: 'OpenCode Go uses an OpenAI-compatible API',
    modelHint: 'Choose the model in the AI panel on the right of the writing page'
  },
  baseUrl: {
    label: 'Base URL',
    description: 'Endpoint address, including the version path',
    placeholder: 'https://api.deepseek.com/v1',
    placeholderOpencode: 'https://opencode.ai/inference/go',
    hint: 'Relay endpoints are allowed; leave empty to restore the default'
  },
  catalog: {
    label: 'Model catalog',
    description: 'Identifies each model’s context window; the built-in baseline is used offline',
    refresh: 'Refresh model catalog',
    loading: 'Refreshing model catalog…',
    summary: '{{count}} models in the catalog',
    updatedAt: 'Updated {{time}}',
    stale: 'The catalog is out of date; please refresh',
    idle: 'The catalog has not been fetched yet; the built-in baseline will be used',
    failed: 'Failed to refresh the model catalog: {{message}}'
  },
  compression: {
    enabled: {
      label: 'Enable automatic compaction',
      description:
        'When the context reaches 80% of the window, earlier conversation is compacted into a summary before sending; when disabled, usage is still shown and earlier turns are still omitted by budget, but no summary is generated (no extra quota used)'
    },
    window: {
      label: 'Custom context window',
      description:
        'Set the window manually for models missing from the catalog (saved per model name, 1024–10000000 tokens); the context percentage and compaction threshold update immediately after saving',
      modelPlaceholder: 'Model ID',
      tokensPlaceholder: 'tokens',
      save: 'Save',
      remove: 'Delete',
      empty: 'No custom model windows yet',
      modelRequired: 'Enter a model ID first',
      invalidTokens: 'The window must be an integer between 1024 and 10000000',
      saveFailed: 'Save failed, please retry'
    }
  },
  apiKey: {
    label: 'API Key',
    description: 'The key is encrypted by system secure storage and saved locally',
    placeholder: 'Enter API key',
    placeholderSaved: 'Saved {{masked}}; enter a new key to replace it',
    saved: 'Saved: {{masked}}',
    save: 'Save',
    clear: 'Clear',
    encryptionUnavailable:
      'Secure storage is unavailable in this environment; the key cannot be saved',
    opencodeHint:
      'Requires a Personal API key starting with oc_sk_ generated in the OpenCode Console',
    savedToast: 'API key saved',
    clearedToast: 'API key cleared',
    saveFailed: 'API key operation failed, please retry'
  },
  test: {
    label: 'Test connection',
    description: 'Fetch the model list once to verify the configuration (no content is sent)',
    button: 'Test',
    testing: 'Testing…',
    success: 'Connected',
    failed: 'Connection failed: {{message}}',
    latency: 'Latency {{latency}} ms'
  },
  error: {
    network: 'Network error, please check the connection or Base URL',
    timeout: 'Request timed out, please retry later',
    auth: 'Authentication failed, please check the API key',
    rate_limit: 'Too many requests, please retry later',
    invalid_request: 'Invalid request parameters, please check the Base URL and model ID',
    upstream: 'The provider returned an error, please retry later',
    aborted: 'Request cancelled',
    unknown: 'Unknown error, please retry later',
    plan_restricted:
      'The current plan does not support this model; switch models or upgrade your plan',
    session_missing: 'The conversation identifier is missing; reopen the conversation and retry',
    auth_missing: 'No API key configured yet',
    auth_invalid: 'The API key is invalid or expired, please enter it again',
    forbidden:
      'Access denied for this model (region restriction or insufficient account permissions); switch models or check your account permissions',
    insufficient_quota: 'Insufficient balance in your provider account; please top up and retry'
  },
  message: {
    interrupted: 'This reply was interrupted by an error',
    otherChapter: 'This reply comes from another chapter and cannot be inserted into this chapter',
    expand: 'Expand',
    collapse: 'Collapse',
    compacted: 'Compacted the previous {{rounds}} conversation turns',
    truncated: 'Summary unavailable; earlier {{rounds}} turns were omitted'
  },
  panel: {
    model: {
      label: 'Model',
      aria: 'Switch model (your choice is remembered for next time)',
      loading: 'Fetching model list…',
      empty: 'No models found; the default model will be used',
      refresh: 'Refresh',
      refreshAria: 'Refresh model list',
      failed: 'Failed to fetch models: {{message}}',
      saveFailed: 'Failed to save the model selection. Please retry.'
    },
    action: {
      label: 'Action',
      polish: 'Polish',
      continue: 'Continue',
      rewrite: 'Rewrite this passage',
      translate: 'Translate',
      chat: 'Free chat'
    },
    carry: {
      full: 'Carry full chapter',
      selection: 'Carry selected text',
      fullLabel: 'full chapter text',
      selectionLabel: 'selected text',
      fullCount: '{{chars}} characters in chapter',
      selectionCount: '{{chars}} characters selected',
      selectionEmpty: 'No text selected',
      none: 'No context carried'
    },
    context: {
      label: 'Context',
      summary: '{{used}} / {{limit}} ({{percent}})',
      percent: '{{ratio}}%',
      unknownModel: 'Unknown model; estimating with {{tokens}}',
      providerReported: 'Provided by the model service',
      matchedFrom: 'Matched from {{id}}',
      calibrated: 'Calibrated against the latest actual usage',
      nearLimit: 'Near limit',
      overLimit: 'Over limit',
      compressing: 'Organizing the context…',
      overBudget: 'This conversation is too long: about {{used}} / {{limit}} (context window)',
      overBudgetHint:
        'Switch to a model with a larger window, set the window manually, or carry less text.'
    },
    builtin: {
      toggle: 'Carry built-in prompt',
      expand: 'Expand',
      collapse: 'Collapse',
      baseHint: 'No category set; generic writing constraints are used'
    },
    composer: {
      placeholder: 'Enter your request; Enter to send, Shift+Enter for a new line'
    },
    stop: 'Stop',
    sessions: {
      title: 'Conversations',
      current: 'Current conversation',
      draft: 'New conversation',
      untitled: 'Conversation {{id}}',
      selectAria: 'Current conversation',
      actions: 'Conversation actions',
      openCount: 'Conversations ({{count}})',
      new: 'New',
      rename: 'Rename',
      renameTitle: 'Rename conversation',
      renameLabel: 'Conversation name',
      renameFailed: 'Rename failed, please try again',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      delete: 'Delete',
      deleteTitle: 'Delete conversation',
      deleteConfirm:
        'Delete "{{title}}"? All messages in this conversation will be deleted permanently.',
      deleteFailed: 'Failed to delete the conversation, please try again',
      busyHint: 'You cannot switch or manage conversations while generating; stop first.',
      loading: 'Loading conversation…',
      empty: 'No conversations in this chapter yet. Click "New" to start one.'
    },
    empty: {
      noChapter: 'Select a chapter first',
      chat: 'No conversation yet. Type a request or tick a context option to start'
    },
    chat: {
      send: 'Send'
    },
    apply: {
      replace: 'Replace selection',
      insert: 'Insert after selection',
      insertAtEnd: 'Insert at end',
      replaced: 'Selection replaced',
      inserted: 'Inserted after selection',
      insertedAtEnd: 'Inserted at the end',
      noSelection: 'Select text to replace first',
      staleSelection: 'The text has changed; select it again',
      failed:
        'Could not write to the chapter: it may be finalized (read-only), or the editor is unavailable'
    }
  }
} satisfies ZhCNResources['ai']

export default ai

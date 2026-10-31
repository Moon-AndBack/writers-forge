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
    opencodeHint: 'OpenCode Go uses an OpenAI-compatible API'
  },
  baseUrl: {
    label: 'Base URL',
    description: 'Endpoint address, including the version path',
    placeholder: 'https://api.deepseek.com/v1',
    placeholderOpencode: 'https://opencode.ai/inference/go',
    hint: 'Relay endpoints are allowed; leave empty to restore the default'
  },
  model: {
    label: 'Model',
    description: 'Fetch the list from the provider, or enter a model ID manually',
    placeholder: 'Select or enter a model ID',
    refresh: 'Refresh',
    loading: 'Fetching model list…',
    empty: 'No models found; please enter a model ID manually',
    failed: 'Failed to fetch models: {{message}}',
    custom: 'Custom model…',
    useList: 'Choose from list'
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
    unknown: 'Unknown error, please retry later'
  },
  panel: {
    model: {
      label: 'Model',
      aria: 'Switch model (affects this panel only)',
      loading: 'Fetching model list…',
      empty: 'No models found; the default model will be used',
      refresh: 'Refresh',
      failed: 'Failed to fetch models: {{message}}'
    },
    action: {
      label: 'Action',
      polish: 'Polish',
      continue: 'Continue',
      rewrite: 'Rewrite',
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
    empty: {
      noChapter: 'Select a chapter first',
      chat: 'No conversation yet. Type a request or tick a context option to start'
    },
    chat: {
      send: 'Send'
    },
    apply: {
      replace: 'Replace selection',
      insert: 'Insert after cursor',
      replaced: 'Selection replaced',
      inserted: 'Inserted after cursor',
      failed:
        'Could not write to the chapter: it may be finalized (read-only), or the editor is unavailable'
    }
  }
} satisfies ZhCNResources['ai']

export default ai

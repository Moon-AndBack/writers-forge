/**
 * 设置页 · AI 分区「上下文压缩」配置（开关 + 手填模型窗口）。
 *
 * 两行：
 * - 「启用自动压缩」开关写 `ai:compression:enabled`（走 `ai:compression:set`，
 *   因为 `ai:` 前缀的设置键对 `window.api.settings` 全屏蔽）；
 * - 「自定义上下文窗口」为目录匹配不到的模型手填窗口（走 `ai:catalog:override`），
 *   下方列出已保存的覆写，可逐条删除。写入后经 `overrideContextLimit` 失效渲染层
 *   窗口缓存，已打开的 AI 面板占用条立即按新窗口重算。
 */
import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Switch, useTooltip } from '../../components/ui'
import { formatTokenCount } from '../writer/right/ai/contextBudget'
import { overrideContextLimit } from '../writer/right/ai/useContextUsage'
import SettingRow from './SettingRow'
import { settingRowDescriptionId } from './settingRowIds'

/** 手填窗口的合法区间（与主进程 `catalogCache` 的 MIN / MAX_CONTEXT_TOKENS 一致）。 */
const MIN_CONTEXT_TOKENS = 1_024
const MAX_CONTEXT_TOKENS = 10_000_000

interface OverrideEntry {
  model: string
  tokens: number
}

/** 覆写 Map → 按模型名排序的列表（展示用）。 */
function toEntries(record: Record<string, number>): OverrideEntry[] {
  return Object.entries(record)
    .map(([name, value]) => ({ model: name, tokens: value }))
    .sort((a, b) => a.model.localeCompare(b.model))
}

/**
 * 覆写列表的模型名：超长时 CSS 省略，完整名称改由自绘 Tooltip 展示
 * （原生 `title` 已移除）。每个列表项各持一个锚点，故单独成组件承载 hook。
 */
function ModelName({ name }: { name: string }) {
  const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLSpanElement>({ content: name })

  return (
    <>
      {tooltip}
      <span ref={anchorRef} {...anchorProps} className="ai-window__model">
        {name}
      </span>
    </>
  )
}

export function AiCompressionRow() {
  const { t } = useTranslation('ai')

  const [enabled, setEnabled] = useState(true)
  const [model, setModel] = useState('')
  const [tokens, setTokens] = useState('')
  const [busy, setBusy] = useState(false)
  const [overrides, setOverrides] = useState<OverrideEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const enabledControlId = useId()
  const windowControlId = useId()

  /** 重新读取已保存覆写（失败保留旧列表，不打扰用户）。 */
  const refreshOverrides = useCallback(async (): Promise<void> => {
    const api = window.api?.ai
    if (!api) return
    try {
      setOverrides(toEntries(await api.catalog.overrides()))
    } catch {
      /* 读取失败保留旧列表 */
    }
  }, [])

  useEffect(() => {
    const api = window.api?.ai
    if (!api) return undefined
    let active = true
    api.compression
      .get()
      .then((value) => {
        if (active) setEnabled(value)
      })
      .catch(() => undefined)
    api.catalog
      .overrides()
      .then((record) => {
        if (active) setOverrides(toEntries(record))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const handleToggle = (next: boolean): void => {
    setEnabled(next)
    void (async () => {
      try {
        const ok = await window.api?.ai?.compression.set(next)
        // 写入失败回滚到原值，避免界面与主进程不一致。
        if (ok === false) setEnabled(!next)
      } catch {
        setEnabled(!next)
      }
    })()
  }

  const handleSave = (): void => {
    const name = model.trim()
    const value = Number(tokens)
    if (name === '') {
      setError(t('compression.window.modelRequired'))
      return
    }
    if (!Number.isInteger(value) || value < MIN_CONTEXT_TOKENS || value > MAX_CONTEXT_TOKENS) {
      setError(t('compression.window.invalidTokens'))
      return
    }

    setError(null)
    setBusy(true)
    void (async () => {
      const ok = await overrideContextLimit(name, value)
      setBusy(false)
      if (!ok) {
        setError(t('compression.window.saveFailed'))
        return
      }
      setModel('')
      setTokens('')
      await refreshOverrides()
    })()
  }

  const handleRemove = (name: string): void => {
    setError(null)
    setBusy(true)
    void (async () => {
      const ok = await overrideContextLimit(name, null)
      setBusy(false)
      if (!ok) {
        setError(t('compression.window.saveFailed'))
        return
      }
      await refreshOverrides()
    })()
  }

  return (
    <>
      <SettingRow
        controlId={enabledControlId}
        label={t('compression.enabled.label')}
        description={t('compression.enabled.description')}
      >
        <Switch
          id={enabledControlId}
          aria-describedby={settingRowDescriptionId(enabledControlId)}
          size="sm"
          checked={enabled}
          aria-label={t('compression.enabled.label')}
          onChange={(event) => handleToggle(event.target.checked)}
        />
      </SettingRow>

      <SettingRow
        controlId={windowControlId}
        label={t('compression.window.label')}
        description={
          <>
            {t('compression.window.description')}
            {error !== null ? (
              <span className="ai-status ai-status--error" role="alert">
                {error}
              </span>
            ) : null}
          </>
        }
      >
        <div className="ai-window">
          <div className="ai-control">
            <Input
              id={windowControlId}
              aria-describedby={settingRowDescriptionId(windowControlId)}
              size="sm"
              className="settings-control settings-control--wide"
              value={model}
              placeholder={t('compression.window.modelPlaceholder')}
              aria-label={t('compression.window.modelPlaceholder')}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setModel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSave()
                }
              }}
            />
            <Input
              size="sm"
              className="settings-control settings-control--tokens"
              value={tokens}
              placeholder={t('compression.window.tokensPlaceholder')}
              aria-label={t('compression.window.tokensPlaceholder')}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => setTokens(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleSave()
                }
              }}
            />
            <Button size="sm" variant="ghost" loading={busy} onClick={handleSave}>
              {t('compression.window.save')}
            </Button>
          </div>
          {overrides.length === 0 ? (
            <span className="ai-status">{t('compression.window.empty')}</span>
          ) : (
            <ul className="ai-window__list">
              {overrides.map((entry) => (
                <li key={entry.model} className="ai-window__item">
                  <ModelName name={entry.model} />
                  <span className="ai-window__tokens">{formatTokenCount(entry.tokens)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => handleRemove(entry.model)}
                  >
                    {t('compression.window.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingRow>
    </>
  )
}

AiCompressionRow.displayName = 'AiCompressionRow'

export default AiCompressionRow

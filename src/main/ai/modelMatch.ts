import { BASELINE_CONTEXT_WINDOWS } from './catalogBaseline'
import { readCatalog, readOverrides } from './catalogCache'

/**
 * 模型 → 上下文窗口解析。
 *
 * 匹配优先级（命中即停）：
 * 1. 用户覆写（override）
 * 2. 运行时目录（catalog）：L1 完全相等 → L2 末段相等 → L3 去装饰后末段相等
 * 3. 内置基线（baseline）
 * 4. 默认值（DEFAULT_CONTEXT_WINDOW）
 *
 * 明确禁止：前缀 / 包含 / 编辑距离 / 剥离数字版本段匹配。
 * 反例：`gpt-4` 与 `gpt-4o` 的上下文窗口差 16 倍，任何「包含」或
 * 「去掉版本号后比较」的做法都会把两者误判为同一模型。
 */

/** 未知模型的默认上下文窗口（32K）。 */
export const DEFAULT_CONTEXT_WINDOW = 32_768

/** 匹配置信度 / 来源细分。 */
export type MatchConfidence =
  'override' | 'exact' | 'suffix' | 'normalized' | 'baseline' | 'default'

/** 解析后的上下文窗口限额。 */
export interface ResolvedLimit {
  tokens: number
  source: 'override' | 'catalog' | 'baseline' | 'default'
  confidence: MatchConfidence
  /** 命中的原始 id（便于 UI 显示「匹配自 xxx」），未命中为 null。 */
  matchedId: string | null
}

/** 目录匹配结果。 */
export interface CatalogMatch {
  id: string
  contextLength: number
  confidence: 'exact' | 'suffix' | 'normalized'
}

/** 取路径末段（无 `/` 时返回自身）。 */
function lastSegment(id: string): string {
  const parts = id.split('/')
  return parts[parts.length - 1] ?? ''
}

/** 归一化装饰后的键：剥 `:free` / `:nitro` / `:extended`、日期戳，`.` ↔ `-`，小写。 */
function decoratedKey(id: string): string {
  return lastSegment(id.trim().toLowerCase())
    .replace(/:(?:free|nitro|extended)$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/\./g, '-')
}

/**
 * 从同级候选中选唯一结果。
 *
 * 命中多个不同 `contextLength` 视为歧义（例如同一末段对应不同厂商的不同窗口），
 * 直接放弃，**不**降级到下一级规则，避免猜错。
 */
function pickUnique(matches: CatalogMatch[]): CatalogMatch | null {
  if (matches.length === 0) return null
  const first = matches[0]
  if (matches.some((match) => match.contextLength !== first.contextLength)) return null
  return first
}

/**
 * 在目录条目中匹配模型。
 *
 * - L1 完全相等（trim + 小写）；
 * - L2 末段相等：`orId.split('/').pop() === ourId`；
 * - L3 去装饰后末段相等（`:free` / `:nitro` / `:extended`、日期戳、`.` ↔ `-`）。
 */
export function matchCatalog(
  modelId: string,
  entries: Record<string, number>
): CatalogMatch | null {
  const target = modelId.trim().toLowerCase()
  if (!target) return null

  // L1：完全相等。只比较完整 id，绝不做前缀 / 包含匹配。
  const exact: CatalogMatch[] = []
  for (const [id, contextLength] of Object.entries(entries)) {
    if (id.trim().toLowerCase() !== target) continue
    exact.push({ id, contextLength, confidence: 'exact' })
  }
  if (exact.length > 0) return pickUnique(exact)

  // L2：末段相等（`deepseek/deepseek-chat` → `deepseek-chat`）。
  const suffix: CatalogMatch[] = []
  for (const [id, contextLength] of Object.entries(entries)) {
    if (lastSegment(id).trim().toLowerCase() !== target) continue
    suffix.push({ id, contextLength, confidence: 'suffix' })
  }
  if (suffix.length > 0) return pickUnique(suffix)

  // L3：去装饰后末段相等（`openai/gpt-4o:free` ≈ `gpt-4o`）。
  const normalizedTarget = decoratedKey(target)
  if (!normalizedTarget) return null
  const normalized: CatalogMatch[] = []
  for (const [id, contextLength] of Object.entries(entries)) {
    if (decoratedKey(id) !== normalizedTarget) continue
    normalized.push({ id, contextLength, confidence: 'normalized' })
  }
  return pickUnique(normalized)
}

/** 解析指定模型的上下文窗口限额。 */
export function resolveContextLimit(model: string): ResolvedLimit {
  const trimmed = model.trim()
  const normalized = trimmed.toLowerCase()

  if (normalized) {
    // 1. 用户覆写（最高优先级）。
    const overrides = readOverrides()
    const override = overrides[normalized]
    if (typeof override === 'number' && override > 0) {
      return { tokens: override, source: 'override', confidence: 'override', matchedId: trimmed }
    }

    // 2. 运行时目录。
    const catalog = readCatalog()
    if (catalog) {
      const matched = matchCatalog(normalized, catalog.entries)
      if (matched) {
        return {
          tokens: matched.contextLength,
          source: 'catalog',
          confidence: matched.confidence,
          matchedId: matched.id
        }
      }
    }

    // 3. 内置基线。
    const baseline = BASELINE_CONTEXT_WINDOWS[normalized]
    if (typeof baseline === 'number' && baseline > 0) {
      return {
        tokens: baseline,
        source: 'baseline',
        confidence: 'baseline',
        matchedId: normalized
      }
    }
  }

  // 4. 默认值（未知模型 32K）。
  return {
    tokens: DEFAULT_CONTEXT_WINDOW,
    source: 'default',
    confidence: 'default',
    matchedId: null
  }
}

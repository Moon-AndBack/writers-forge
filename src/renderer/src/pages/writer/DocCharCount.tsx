import { Trans, useTranslation } from 'react-i18next'
import { DOC_LIMIT_WARN_CHARS, MAX_DOC_CHARS } from './docWordLimit'

/**
 * 编辑器脚注「正文有效字数 / 单篇上限」指示（章节编辑器与大纲编辑器**共用**，§9 通用化）。
 *
 * - **显示**：`当前字数 / 200,000`（与 `filterTransaction` 的拦截判定**同源** ——
 *   均取自 `docWordLimit` 的块级字数缓存，故脚注显示的数就是拦截依据的数）；
 * - **预警**：≥ 90%（180,000）转 `--warn` 色并提示「接近上限」；
 * - **达限**：≥ 上限转 `--danger` 色并提示「已达单篇字数上限」。
 *
 * **文案全部走 i18n（§10）**：字数脚注在两域的 key 结构一致，故按 scope 选**固定
 * i18nKey**（不拼字符串），两域切换用两个 `<Trans>` 分支表达（禁用字符串前缀拼接）；
 * 预警 / 达限提示为**跨域共用文案**，统一取 `chapters.editor.*`。
 */

export interface DocCharCountProps {
  /** 当前有效字数（调用方从 `docCharCount(editor)` 取，保证与拦截同源）。 */
  count: number
  /** 文案域：`chapter` = 章节域 / `entry` = 大纲域（key 结构一致，仅命名空间不同）。 */
  scope: 'chapter' | 'entry'
}

export function DocCharCount({ count, scope }: DocCharCountProps) {
  // 预警 / 达限提示为**跨域共用文案**，统一取章节域；字数脚注按 scope 取各自域。
  const { t: tChapters } = useTranslation('chapters')

  const reached = count >= MAX_DOC_CHARS
  const near = !reached && count >= DOC_LIMIT_WARN_CHARS
  const modifier = reached ? ' is-full' : near ? ' is-warn' : ''
  const values = { count: count.toLocaleString(), limit: MAX_DOC_CHARS.toLocaleString() }
  const bold = <b style={{ fontFamily: 'var(--mono)' }} />

  return (
    <span className={`editor-foot-count${modifier}`}>
      {scope === 'chapter' ? (
        <Trans i18nKey="editor.footCount" ns="chapters" values={values} components={{ b: bold }} />
      ) : (
        <Trans i18nKey="footCount" ns="outline" values={values} components={{ b: bold }} />
      )}
      {/* 提示文案：达限优先于接近上限，两者互斥 */}
      {reached && <span className="doc-limit-hint">{tChapters('editor.wordLimitReached')}</span>}
      {!reached && near && (
        <span className="doc-limit-hint">{tChapters('editor.wordLimitNear')}</span>
      )}
    </span>
  )
}

export default DocCharCount

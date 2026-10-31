/**
 * 写作页「保存状态」指示（渲染在编辑器脚注 `.editor-foot` 左侧，与「本章共 X 字」同行）。
 *
 * 纯显示：数据来自 `useChapterDoc` 的保存链路（status + dirty），
 * 不新增 / 不修改任何保存机制；小圆点配色复用 `.st-dot` 体系，
 * 四主题随 --ok / --brand / --warn / --danger 自动适配。
 * 复用状态栏 .st-item / .st-dot 语义类；脚注内的边距 / 字号对齐见
 * writer-editor-doc.css 的 `.editor-foot .st-save`。
 * 文案走 `status` i18n 命名空间的 `save.*`。
 */
import { useTranslation } from 'react-i18next'

/** 保存显示态（由 status 与 dirty 归并得出）。 */
export type ChapterSaveState = 'loading' | 'saving' | 'dirty' | 'saved' | 'error'

const STATE_META: Record<
  ChapterSaveState,
  {
    labelKey: 'save.loading' | 'save.saving' | 'save.dirty' | 'save.saved' | 'save.error'
    modifier: string
  }
> = {
  loading: { labelKey: 'save.loading', modifier: 'is-loading' },
  saving: { labelKey: 'save.saving', modifier: 'is-saving' },
  dirty: { labelKey: 'save.dirty', modifier: 'is-dirty' },
  saved: { labelKey: 'save.saved', modifier: 'is-saved' },
  error: { labelKey: 'save.error', modifier: 'is-error' }
}

/** 状态栏保存状态：小圆点 + 文案。 */
export function SaveStatus({ state }: { state: ChapterSaveState }) {
  const { t } = useTranslation('status')
  const meta = STATE_META[state]
  return (
    <span className={`st-item st-save ${meta.modifier}`}>
      <span className="st-dot" aria-hidden="true" />
      <b>{t(meta.labelKey)}</b>
    </span>
  )
}

export default SaveStatus

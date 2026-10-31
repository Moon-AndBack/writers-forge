import type { CSSProperties } from 'react'

/* ---------- 内联样式（本批允许改动面仅限组件与 i18n 资源，不新增样式表） ----------
   弹窗外壳（root / statsRow / importBox / hint / close）与词表（filtersRow 起）共用同一
   张表；`muted` 被两处引用，故不随任一组件单独存放。样式值均为原样迁移。 */

export const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 10 },
  statsRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  importBox: { display: 'flex', flexDirection: 'column', gap: 6 },
  hint: { margin: 0, fontSize: 11, color: 'var(--text-mute)', whiteSpace: 'pre-line' },
  filtersRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  search: { flex: '1 1 140px', minWidth: 120 },
  muted: { margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--text-mute)' },
  list: { maxHeight: '40vh', overflowY: 'auto', border: '1px solid var(--line)' },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px' },
  word: { flex: 1, minWidth: 0, fontSize: 12.5, overflowWrap: 'anywhere' },
  tip: { margin: 0, padding: '10px 6px', fontSize: 12, color: 'var(--text-mute)' },
  error: { margin: 0, padding: '10px 6px', fontSize: 12, color: 'var(--danger)' },
  more: { display: 'flex', justifyContent: 'center', padding: '6px 0' },
  close: { marginLeft: 'auto' }
} satisfies Record<string, CSSProperties>

/**
 * 时间线 origin 自由文本解析器（渲染层镜像，与主进程 `database/plot.ts` 的
 * `parseTimelineOrigin` 同口径）。
 *
 * origin 取值：'元年' / '纪前 N 年' / '纪后 N 年' / '时间未定' / 其他自由文本 / 空。
 * 返回结构化时间四字段，供新建场景继承父剧情线的默认时间使用。
 */
export function parseTimelineOrigin(origin: unknown): {
  timeEra: string
  timeYear: number | null
  timeDesc: string
  timeText: string
} {
  const raw = typeof origin === 'string' ? origin.trim() : ''
  // 回填输出留空：展示层经 `t('plot.timeEra.zero')` / `t('plot.undatedScene')` 兜底；
  // 下方判据中的 '元年' / '时间未定' 为存量数据格式，保持原样。
  if (raw === '' || raw === '元年') {
    return { timeEra: 'zero', timeYear: null, timeDesc: '', timeText: '' }
  }
  if (raw === '时间未定') {
    return { timeEra: '', timeYear: null, timeDesc: '', timeText: '' }
  }
  const bcMatch = raw.match(/^纪前\s*(\d+)\s*年?$/)
  if (bcMatch) {
    return { timeEra: 'bc', timeYear: Number(bcMatch[1]), timeDesc: '', timeText: raw }
  }
  const adMatch = raw.match(/^纪后\s*(\d+)\s*年?$/)
  if (adMatch) {
    return { timeEra: 'ad', timeYear: Number(adMatch[1]), timeDesc: '', timeText: raw }
  }
  return { timeEra: '', timeYear: null, timeDesc: raw, timeText: raw }
}
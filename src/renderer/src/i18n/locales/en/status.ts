/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 */
import type { ZhCNResources } from '../zh-CN'

const status = {
  save: {
    loading: 'Loading…',
    saving: 'Saving…',
    dirty: 'Unsaved',
    saved: 'Saved',
    error: 'Save failed'
  },
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  pinBar: 'Pin module bar (full height)',
  unpinBar: 'Unpin module bar (floating)',
  writingSession: {
    summary: 'Session <b>{{chars}}</b> chars · <b>{{speed}}</b>/hr',
    charsOnly: 'Session <b>{{chars}}</b> chars',
    title: 'Net chapter characters written this session; speed excludes idle time',
    detailTitle: 'Session details',
    chars: 'This session',
    charsValue: '{{chars}} chars',
    speed: 'Typing speed',
    speedValue: '{{speed}} chars/hr',
    activeTime: 'Writing time',
    idleTime: 'Idle time',
    hoursMinutes: '{{hours}} hr {{minutes}} min',
    minutesSeconds: '{{minutes}} min {{seconds}} sec',
    seconds: '{{seconds}} sec',
    openAria: 'View session writing details',
    lock: 'Keep open',
    unlock: 'Stop keeping open'
  }
} satisfies ZhCNResources['status']

export default status

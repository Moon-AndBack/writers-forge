/** 状态栏 / 保存状态命名空间（`status`）：保存五态、缩放、模块栏固定、本次码字统计。 */
const status = {
  save: {
    loading: '加载中…',
    saving: '保存中…',
    dirty: '未保存',
    saved: '已保存',
    error: '保存失败'
  },
  zoomOut: '缩小',
  zoomIn: '放大',
  zoom: '页面缩放',
  pinBar: '固定模块栏（撑满高度）',
  unpinBar: '取消固定模块栏（恢复悬浮）',
  writingSession: {
    summary: '本次 <b>{{chars}}</b> 字 · <b>{{speed}}</b> 字/时',
    charsOnly: '本次 <b>{{chars}}</b> 字',
    title: '本次打开程序后章节正文的净增字数；时速按活跃时长折算，不含空闲时间',
    detailTitle: '本次码字详情',
    chars: '本次码字',
    charsValue: '{{chars}} 字',
    speed: '打字速度',
    speedValue: '{{speed}} 字/时',
    activeTime: '码字时间',
    idleTime: '空闲时间',
    hoursMinutes: '{{hours}} 小时 {{minutes}} 分',
    minutesSeconds: '{{minutes}} 分 {{seconds}} 秒',
    seconds: '{{seconds}} 秒',
    openAria: '查看本次码字详情',
    lock: '锁定常驻',
    unlock: '取消锁定'
  }
}

export default status

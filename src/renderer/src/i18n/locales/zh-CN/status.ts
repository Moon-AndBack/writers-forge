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
  pinBar: '固定模块栏（撑满高度）',
  unpinBar: '取消固定模块栏（恢复悬浮）',
  writingSession: {
    summary: '本次 <b>{{chars}}</b> 字 · <b>{{speed}}</b> 字/时',
    charsOnly: '本次 <b>{{chars}}</b> 字',
    title: '本次打开程序后章节正文的净增字数；时速按活跃时长折算，不含空闲时间'
  }
}

export default status

/** 浮层显示延迟（鼠标停稳后才出现，避免扫过时频繁弹出）。 */
export const POPOVER_SHOW_DELAY = 260
/** 浮层隐藏延迟（给「锚点 → 浮层」往返移动留余量）。 */
export const POPOVER_HIDE_DELAY = 120
/**
 * 实体悬停卡的隐藏延迟：正文高亮 span 之间横向移动时的容错窗口。
 * 数值沿用改造前的字面量 160ms（比通用隐藏延迟多 40ms），保持既有手感不变。
 */
export const ENTITY_HOVER_HIDE_DELAY = 160

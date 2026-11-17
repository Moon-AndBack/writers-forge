/**
 * 写作页左栏判定常量。
 * 章节树见 `writer/chapters/`、大纲见 `writer/outline/`、剧情见 `writer/plot/`、
 * 设定档案四域（世界观 / 角色 / 势力 / 物品功法）见 `writer/dossier/`、伏笔见
 * `writer/foreshadow/`（均已接库）。
 */
import type { WriterModule } from '../../shell/activityBar'

/**
 * 有左侧栏的模块（章节 / 大纲 / 剧情 / 时间线）。
 * 设定档案四域（世界观 / 角色 / 势力 / 物品功法）改卡片式中栏、收起左栏；
 * 伏笔为卡片列表式中栏（选中 / 编辑在右栏）、同样不需要实体左栏；
 * 灵感仍为占位（无实体左栏，一并收起）。
 */
export const SIDE_MODULES: readonly WriterModule[] = ['chapters', 'outline', 'plot', 'timeline']

/** 该模块是否渲染左侧栏。 */
export function hasSidePane(module: WriterModule): boolean {
  return SIDE_MODULES.includes(module)
}

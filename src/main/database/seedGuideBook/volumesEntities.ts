import type { SeedVolume } from '../seedBlocks'
import { ENTITY_SUBTYPE_CHAPTERS } from './volumesSubtypes'

/**
 * 卷五「设定档案」章节域载体（前半，独立文件，§3 单文件 ≤500 行）。
 *
 * 骨架批次：卷序与卷名已登记，前 5 章待后续批次填充：
 * 五域总览与卡片 / 新建编辑与删除 / 别名与关系 / 子类与专属字段 / 角色年龄锚点。
 * 后 3 章（势力组织架构 / 境界体系 / 首次登场与实体高亮）由
 * `./volumesSubtypes.ts` 提供，并在下方展开进本卷，保证两文件的拆分接线成立。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_ENTITIES: SeedVolume = {
  kind: 'normal',
  title: '设定档案',
  chapters: [
    // 骨架态为空；后半章节载体先接线，后续批次填充后自动并入本卷且顺序在后。
    ...ENTITY_SUBTYPE_CHAPTERS
  ]
}

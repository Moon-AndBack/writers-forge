/**
 * 教学书**剧情域**种子数据（首启唯一书籍「Writer's Forge · 使用指南」的示范剧情线 / 场景）。
 *
 * 约定（与 `plot.ts` / `schema/plot.ts` 对齐）：
 * - 2 条剧情线 × 各 3 个场景（新书恒为空，`plot_lines` / `plot_scenes` 按书隔离随书级联）；
 * - 剧情线示范类型色：主线 `main` + 品牌首色 `purple`，支线 `branch` + 次色 `blue`
 *   （`chapterSeed.ts` 的 `seedGuidePlot` 透传本结构时须同步转发 `lineType` / `lineColor`）；
 * - 场景字段全中文示范：`timeText` 时间原文（过渡保留）/ `timeDesc` 时间描述
 *   （结构化值：纪前 / 元年 / 纪后 + 年份 + 描述，`chapterSeed.ts` 的
 *   `seedGuidePlot` 透传本结构时须同步转发三字段）/
 *   `title` 标题 / `description` 描述；
 * - **无出场人物字段**：剧情页的实体胶囊由正文**自动匹配实体**生成（停笔约 0.5 秒后自动刷新、不落库），
 *   显示在场景卡内部、描述下方（卡内胶囊区），故种子只写描述；匹配词表取统一设定库（`worldEntitySeed.ts` 的五大类示范实体，
 *   如世界观「文心城」、角色「砚秋」、物品「锻笔剑」「墨玉砚」、境界体系「文心九境」），
 *   写到名字即可看到高亮与胶囊。
 * - **关联设定（批F）**：每场景可再手动关联若干统一设定库实体（`entityKeys`，写
 *   `plot_scene_world_entities`），在节点弹窗里以勾选列表呈现；与正文自动胶囊互不影响。
 *
 * 生效范围：仅新库首启与教学书重灌（`chapterSeed.ts` 的 `seedGuidePlot` 经正式写入口灌入）；
 * 守卫键见 `chapterSeed.ts` 的 `MIGRATION_KEY`，不在本文件内，由该文件统一管理。
 *
 * 时间对照意图（与右栏纪元下拉 / 主时间线聚合口径一致）：
 * - 「初入文心城」纪前 2 年（`bc` + 2）；
 * - 「试炼静心诀」元年（`zero`，年份恒空）；
 * - 「剑心初成」与「城中传闻」同为纪后 2 年（`ad` + 2，跨线同年，主时间线同排）；
 * - 「静心阁夜话」「风云暂歇」不设纪元年份（未定年对照，沉底）；
 * - `timeDesc` 保留原文说明（展示为「纪前 2年 · 清晨」一类），`timeText` 留原文兜底。
 */

/** 单场景种子：时间原文 + 结构化时间 / 标题 / 描述 + 关联设定。 */
export interface SeedPlotScene {
  timeText: string
  timeEra?: string
  timeYear?: number | null
  timeDesc?: string
  title: string
  description: string
  /**
   * 手动关联的统一设定库实体（按 `worldEntitySeed.ts` 的 demo `key` 引用，如 `city` / `sword`）。
   * 写入时机：`seedDemoWorldEntities` 在实体创建后按场景标题回填连接表
   * （`plot_scene_world_entities`）；未给 key 的场景不建连接行。
   */
  entityKeys?: string[]
}

/** 单剧情线种子：线名 + 类型 / 颜色（缺省由 `createPlotLine` 取默认 `'main'` + 首色）+ 其下场景（顺序即展示顺序）。 */
export interface SeedPlotLine {
  name: string
  lineType?: string
  lineColor?: string
  timelineId?: string
  defaultOrigin?: string
  scenes: SeedPlotScene[]
}

/** 教学书示范剧情线（2 线 × 各 3 场景）。 */
export const GUIDE_PLOT_LINES: readonly SeedPlotLine[] = [
  {
    name: "主线 · Writer's Forge 的锻笔之旅",
    lineType: 'main',
    lineColor: 'purple',
    timelineId: 'default',
    defaultOrigin: '',
    scenes: [
      {
        timeText: '清晨',
        timeEra: 'bc',
        timeYear: 2,
        timeDesc: '清晨',
        title: '初入文心城',
        description:
          "Writer's Forge 带着锻笔剑与墨玉砚来到文心城，在城门口立下誓言：要写出一部属于自己的作品。",
        entityKeys: ['city', 'sword', 'artifact']
      },
      {
        timeText: '正午',
        timeEra: 'zero',
        timeYear: null,
        timeDesc: '正午',
        title: '试炼静心诀',
        description: "Writer's Forge 在城中老宅闭门修炼静心诀，第一次体会到心静则笔稳的道理。",
        entityKeys: ['hero', 'power-linear']
      },
      {
        timeText: '夜晚',
        timeEra: 'ad',
        timeYear: 2,
        timeDesc: '夜晚',
        title: '剑心初成',
        description:
          "Writer's Forge 以锻笔剑为笔、静心诀为意，在文心城的灯火下写完第一章，剑心初成。",
        entityKeys: ['sword', 'talent']
      }
    ]
  },
  {
    name: '支线 · 文心城风云',
    lineType: 'branch',
    lineColor: 'blue',
    timelineId: 'default',
    defaultOrigin: '',
    scenes: [
      {
        timeText: '三日前',
        timeEra: 'ad',
        timeYear: 2,
        timeDesc: '三日前',
        title: '城中传闻',
        description: '文心城中流传着锻笔剑重现的消息，各方人物悄然向城中聚集。',
        entityKeys: ['city', 'faction']
      },
      {
        timeText: '昨日',
        timeDesc: '昨日',
        title: '静心阁夜话',
        description: "Writer's Forge 在静心阁与旧友夜话，得知静心诀的下半部就藏在文心城中。",
        entityKeys: ['hero', 'faction']
      },
      {
        timeText: '今日',
        timeDesc: '今日',
        title: '风云暂歇',
        description: "Writer's Forge 决定暂放传闻，先守住文心城的安宁，把故事的下一章留给明天。",
        entityKeys: ['hero']
      }
    ]
  }
]

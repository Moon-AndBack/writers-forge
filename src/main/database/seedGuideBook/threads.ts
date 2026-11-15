import { plainTextToDocJson } from '../../../shared/richTextDoc'

/**
 * 教学书**伏笔与灵感示范数据**（卷六「伏笔与灵感」配套，§3 单文件 ≤500 行）。
 *
 * 与 `./volumesThreads.ts` / `./outlineTools.ts` 的教学文案同批维护：章节正文讲功能，
 * 这里的示范条目让用户在模块里直接看到「埋设中 / 已回收 / 建设中 / 已废弃」四种形态与
 * 灵感标签的用法，可随时删除。播种流程见 `../guideThreadSeed.ts`。
 *
 * **锚点不硬编码段号**：正文锚点按「卷名 + 章名 + 关键字」声明，大纲锚点按「条目名 +
 * 关键字」声明，播种时再查库解析成 `paragraphIdx` / `quote` / 字符区间快照——教学文案
 * 增删段落时锚点自动跟随；解析失败只留空该槽位并告警，不中断播种。
 *
 * 灵感标签只用 6 个预置建议（点子 / 场景 / 台词 / 人物 / 设定 / 待办），避免筛选下拉
 * 出现用户没见过的自定义项。
 */

/** 正文锚点声明：卷 + 章 + 段落内必须存在的关键字。 */
export interface SeedForeshadowBodyAnchor {
  /** 所在正文卷名（`volumes.title`，须与教学书卷名逐字一致）。 */
  volumeTitle: string
  /** 所在章名（`chapters.title`）。 */
  chapterTitle: string
  /** 关键字：取该章首个包含它的段落（2–8 字，短且唯一）。 */
  needle: string
}

/** 大纲锚点声明：条目 + 正文块内必须存在的关键字。 */
export interface SeedForeshadowOutlineAnchor {
  /** 大纲条目名（`outline_items.title`）。 */
  itemTitle: string
  /** 关键字：取该条目首个包含它的顶层块（2–8 字，短且唯一）。 */
  needle: string
}

/** 伏笔示范条目。 */
export interface SeedGuideForeshadow {
  title: string
  /** 描述：块级富文本 JSON（由 `plainTextToDocJson` 生成，多行文本 → 多个段落块）。 */
  descriptionJson: string
  /** 正文埋点；缺省 = 该槽位留空。 */
  body?: SeedForeshadowBodyAnchor
  /** 大纲埋点；缺省 = 该槽位留空。 */
  outline?: SeedForeshadowOutlineAnchor
  /** 回收位置（只接受正文锚点）；缺省 = 未回收。 */
  recover?: SeedForeshadowBodyAnchor
  /** 回收备注（`recover` 存在时写入；右栏只读展示）。 */
  recoveryNote?: string
  /** 是否打废弃标记（可撤销）。 */
  abandoned?: boolean
}

/** 灵感示范条目。 */
export interface SeedGuideInspiration {
  title: string
  /** 正文：纯文本多行（灵感模块不保留富文本格式）。 */
  content: string
  /** 标签：只用预置建议之一 / 之二。 */
  tags: readonly string[]
}

/**
 * 四条示范伏笔：覆盖四种派生状态。
 *
 * - 埋设中：正文 + 大纲双埋点；
 * - 已回收：双埋点 + 回收位置 + 回收备注；
 * - 建设中：无任何锚点（未锚定伏笔完全合法）；
 * - 已废弃：正文埋点 + 废弃标记（可恢复）。
 */
export const GUIDE_FORESHADOWS: readonly SeedGuideForeshadow[] = [
  {
    title: '先建伏笔，再补埋点',
    descriptionJson: plainTextToDocJson(
      [
        '标题栏的「新建伏笔」只建条，不带锚点：两个埋点槽位都空着，状态停在「建设中」。',
        '埋设中不是建出来的，是埋出来的：正文档位挂上正文埋点、或大纲里挂上大纲埋点，状态才会变成「埋设中」。',
        '所以顺序是「先建伏笔，再补埋点」——建完回正文选中一句话，右键「关联伏笔」挂上即可。'
      ].join('\n')
    ),
    body: { volumeTitle: '伏笔与灵感', chapterTitle: '创建伏笔', needle: '新建伏笔' },
    outline: { itemTitle: '伏笔的三种建立方式', needle: '三个入口' }
  },
  {
    title: '回收点要落在兑现的那句话上',
    descriptionJson: plainTextToDocJson(
      [
        '三处锚点齐全的样子：正文埋点标出伏笔在哪埋下，大纲埋点标出规划里对应的位置，回收点标出它在哪里兑现。',
        '回收点只接受章节正文里的选区，落点应是兑现的那句话，而不是整章或叙述旁白。',
        '三处齐全后状态显示「已回收」，卡片上埋设点转灰，回收处出现「回收点」标记。'
      ].join('\n')
    ),
    body: { volumeTitle: '伏笔与灵感', chapterTitle: '创建伏笔', needle: '添加伏笔' },
    outline: { itemTitle: '回收伏笔与三处锚点', needle: '回收只发生在章节正文' },
    recover: {
      volumeTitle: '伏笔与灵感',
      chapterTitle: '筛选、回收与删除',
      needle: '回收只能在章节正文里做'
    },
    recoveryNote: '在「筛选、回收与删除」章说明回收流程处兑现'
  },
  {
    title: '状态是算出来的，不是选出来的',
    descriptionJson: plainTextToDocJson(
      [
        '新建伏笔时没有状态下拉，界面上也找不到改状态的入口。',
        '四种状态全部由锚点与废弃标记派生：有回收点算已回收，打了废弃标记算已废弃，有任一埋点算埋设中，什么都没有算建设中。',
        '所以一条只有名称和描述的伏笔停在「建设中」完全合法——它是待补锚点的草稿，不是异常数据。'
      ].join('\n')
    )
  },
  {
    title: '给每条伏笔配一句固定提示语',
    descriptionJson: plainTextToDocJson(
      [
        '试过的做法：每条伏笔的描述第一行写一句固定提示语，提醒自己它要兑现什么。',
        '后来发现提示语会和正文摘抄重复，读卡片时反而更吵，于是把这条伏笔废弃了。',
        '废弃是可逆的：右栏保存条左侧的「恢复」能把状态退回按锚点判定，锚点与描述都不会丢。'
      ].join('\n')
    ),
    body: { volumeTitle: '伏笔与灵感', chapterTitle: '伏笔总览', needle: '配色跟着状态走' },
    abandoned: true
  }
]

/** 三条示范灵感：只用预置标签，示范「悬在某一句话上」「标签克制」「开章前过一遍伏笔」。 */
export const GUIDE_INSPIRATIONS: readonly SeedGuideInspiration[] = [
  {
    title: '回收点落在一句台词上',
    content: [
      '与其在叙述句里回收，不如让角色把关键话说出来：读者记住的是那句台词，不是旁白。',
      '下次给埋设中的伏笔找回收位置时，先想想这条伏笔能不能由某个角色一句话点破。'
    ].join('\n'),
    tags: ['台词', '场景']
  },
  {
    title: '一条灵感只挂一两个标签',
    content: [
      '标签是筛选工具，不是分类树：一条灵感挂太多标签，筛选下拉会越来越长，反而找不到。',
      '默认只挂一两个最贴近的，剩下的交给搜索框。'
    ].join('\n'),
    tags: ['点子', '待办']
  },
  {
    title: '开新章前扫一遍埋设中的伏笔',
    content: [
      '开新章前把「埋设中」筛出来过一遍：这章能兑现哪条？埋太久的，是补锚点还是直接废弃。',
      '留在「建设中」的也顺手看一眼，要么补埋点，要么删掉。'
    ].join('\n'),
    tags: ['待办', '场景']
  }
]

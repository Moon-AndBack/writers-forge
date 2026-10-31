import Database from 'better-sqlite3'
import { getDb } from './index'
import { getSetting, setSetting } from './settings'

/** 起点频道归属：男频 / 女频 / 出版；自定义分类为 NULL。 */
export type CategoryChannel = 'male' | 'female' | 'publish'

/** 频道合法值（供类型收敛与后续 IPC 校验复用）。 */
export const CATEGORY_CHANNELS: readonly CategoryChannel[] = ['male', 'female', 'publish']

/** 分类领域对象：`isCustom` 对库内 0/1 收敛为布尔。 */
export interface CategoryRow {
  id: number
  /** 起点官方 ID（一级 = chanId，二级 = subtype）；自定义分类为 null。 */
  originId: number | null
  /** 所属频道；自定义分类为 null。 */
  channel: CategoryChannel | null
  /** 父级一级分类 id；null = 一级分类。 */
  parentId: number | null
  /** 中文原文（不译项，不进 i18n）。 */
  name: string
  sortOrder: number
  /** true = 用户自定义分类。 */
  isCustom: boolean
}

/** 分类种子的一次性灌入标记（对齐 `chapterSeed.ts` 的 `MIGRATION_KEY` 风格，用 settings 表）。 */
const SEED_KEY = 'categories:seed:v1'

/** 种子分类节点：`children` 缺省 = 无二级（如出版频道）。 */
interface SeedCategory {
  name: string
  originId: number
  children?: ReadonlyArray<SeedCategory>
}

/** 一个频道的种子分类组。 */
interface SeedGroup {
  channel: CategoryChannel
  items: ReadonlyArray<SeedCategory>
}

/**
 * 分类种子数据（两级树，逐字取自起点官网 DOM，2026-10-13 两次独立抓取交叉核对）。
 *
 * - 一级 33 条（男 15 / 女 11 / 出版 7）；二级 145 条（男 79 / 女 66 / 出版 0）；
 * - `originId`：一级 = 括号内 chanId，二级 = 括号内 subtype；
 * - **「短篇」男频(20076) 与女频(30083) 同名**，靠 `channel` 区分，不冲突；
 * - 「王朝争霸」「青春校园」两处错字已修正（原「万朝争霸」「情春校园」）。
 */
const SEED_CATEGORIES: ReadonlyArray<SeedGroup> = [
  {
    channel: 'male',
    items: [
      {
        name: '玄幻',
        originId: 21,
        children: [
          { name: '东方玄幻', originId: 8 },
          { name: '异世大陆', originId: 73 },
          { name: '王朝争霸', originId: 58 },
          { name: '高武世界', originId: 78 }
        ]
      },
      {
        name: '奇幻',
        originId: 1,
        children: [
          { name: '现代魔法', originId: 38 },
          { name: '剑与魔法', originId: 62 },
          { name: '史诗奇幻', originId: 201 },
          { name: '神秘幻想', originId: 202 },
          { name: '历史神话', originId: 20092 },
          { name: '另类幻想', originId: 20093 }
        ]
      },
      {
        name: '武侠',
        originId: 2,
        children: [
          { name: '传统武侠', originId: 5 },
          { name: '武侠幻想', originId: 30 },
          { name: '国术无双', originId: 206 },
          { name: '古武未来', originId: 20099 },
          { name: '武侠同人', originId: 20100 }
        ]
      },
      {
        name: '仙侠',
        originId: 22,
        children: [
          { name: '修真文明', originId: 18 },
          { name: '幻想修仙', originId: 44 },
          { name: '现代修真', originId: 64 },
          { name: '神话修真', originId: 207 },
          { name: '古典仙侠', originId: 20101 }
        ]
      },
      {
        name: '都市',
        originId: 4,
        children: [
          { name: '都市生活', originId: 12 },
          { name: '都市异能', originId: 16 },
          { name: '异术超能', originId: 74 },
          { name: '青春校园', originId: 130 },
          { name: '娱乐明星', originId: 151 },
          { name: '商战职场', originId: 153 }
        ]
      },
      {
        name: '现实',
        originId: 15,
        children: [
          { name: '时代叙事', originId: 20106 },
          { name: '家庭伦理', originId: 6 },
          { name: '女性题材', originId: 20104 },
          { name: '青年故事', originId: 20108 },
          { name: '社会悬疑', originId: 20105 },
          { name: '人间百态', originId: 209 }
        ]
      },
      {
        name: '军事',
        originId: 6,
        children: [
          { name: '军旅生涯', originId: 54 },
          { name: '军事战争', originId: 65 },
          { name: '战争幻想', originId: 80 },
          { name: '抗战烽火', originId: 230 },
          { name: '谍战特工', originId: 231 }
        ]
      },
      {
        name: '历史',
        originId: 5,
        children: [
          { name: '架空历史', originId: 22 },
          { name: '秦汉三国', originId: 48 },
          { name: '上古先秦', originId: 220 },
          { name: '历史传记', originId: 32 },
          { name: '两晋隋唐', originId: 222 },
          { name: '五代十国', originId: 223 },
          { name: '两宋元明', originId: 224 },
          { name: '清史民国', originId: 225 },
          { name: '外国历史', originId: 226 },
          { name: '民间传说', originId: 20094 }
        ]
      },
      {
        name: '游戏',
        originId: 7,
        children: [
          { name: '电子竞技', originId: 7 },
          { name: '虚拟网游', originId: 70 },
          { name: '游戏异界', originId: 240 },
          { name: '游戏系统', originId: 20102 },
          { name: '游戏主播', originId: 20103 }
        ]
      },
      {
        name: '体育',
        originId: 8,
        children: [
          { name: '篮球运动', originId: 28 },
          { name: '体育赛事', originId: 55 },
          { name: '足球运动', originId: 82 }
        ]
      },
      {
        name: '科幻',
        originId: 9,
        children: [
          { name: '古武机甲', originId: 21 },
          { name: '未来世界', originId: 25 },
          { name: '星际文明', originId: 68 },
          { name: '超级科技', originId: 250 },
          { name: '时空穿梭', originId: 251 },
          { name: '进化变异', originId: 252 },
          { name: '末世危机', originId: 253 }
        ]
      },
      {
        name: '诸天无限',
        originId: 20109,
        children: [
          { name: '无限', originId: 20110 },
          { name: '诸天', originId: 20111 },
          { name: '综漫', originId: 20112 }
        ]
      },
      {
        name: '悬疑灵异',
        originId: 10,
        children: [
          { name: '诡异神秘', originId: 26 },
          { name: '规则怪谈', originId: 35 },
          { name: '侦探推理', originId: 57 },
          { name: '灵异民俗', originId: 260 },
          { name: '惊悚微恐', originId: 20095 }
        ]
      },
      {
        name: '轻小说',
        originId: 12,
        children: [
          { name: '原生幻想', originId: 60 },
          { name: '恋爱日常', originId: 66 },
          { name: '衍生同人', originId: 281 },
          { name: '搞笑吐槽', originId: 282 }
        ]
      },
      {
        name: '短篇',
        originId: 20076,
        children: [
          { name: '都市脑洞', originId: 20078 },
          { name: '民俗怪谈', originId: 20098 },
          { name: '多元科幻', originId: 20097 },
          { name: '古今奇谭', originId: 20096 },
          { name: '短故事', originId: 20113 }
        ]
      }
    ]
  },
  {
    channel: 'female',
    items: [
      {
        name: '古代言情',
        originId: 80,
        children: [
          { name: '古代情缘', originId: 801 },
          { name: '宫闱宅斗', originId: 802 },
          { name: '经商种田', originId: 803 },
          { name: '古典架空', originId: 804 },
          { name: '女尊王朝', originId: 805 },
          { name: '穿越奇情', originId: 806 },
          { name: '西方时空', originId: 30094 },
          { name: '清穿民国', originId: 30095 },
          { name: '上古蛮荒', originId: 30096 },
          { name: '热血江湖', originId: 30097 }
        ]
      },
      {
        name: '仙侠奇缘',
        originId: 81,
        children: [
          { name: '武侠情缘', originId: 810 },
          { name: '古典仙侠', originId: 811 },
          { name: '现代修真', originId: 812 },
          { name: '远古洪荒', originId: 813 },
          { name: '仙侣奇缘', originId: 30093 }
        ]
      },
      {
        name: '现代言情',
        originId: 82,
        children: [
          { name: '商战职场', originId: 821 },
          { name: '豪门世家', originId: 822 },
          { name: '都市生活', originId: 823 },
          { name: '婚恋情缘', originId: 824 },
          { name: '娱乐明星', originId: 825 },
          { name: '都市异能', originId: 827 },
          { name: '极道江湖', originId: 828 },
          { name: '民国情缘', originId: 829 },
          { name: '异国情缘', originId: 30098 }
        ]
      },
      {
        name: '浪漫青春',
        originId: 83,
        children: [
          { name: '青春校园', originId: 831 },
          { name: '青春疼痛', originId: 832 },
          { name: '叛逆成长', originId: 833 },
          { name: '青春纯爱', originId: 834 }
        ]
      },
      {
        name: '玄幻言情',
        originId: 84,
        children: [
          { name: '东方玄幻', originId: 841 },
          { name: '异世大陆', originId: 844 },
          { name: '西方奇幻', originId: 846 },
          { name: '远古神话', originId: 847 },
          { name: '异族恋情', originId: 848 },
          { name: '魔法幻情', originId: 849 },
          { name: '异能超术', originId: 30092 }
        ]
      },
      {
        name: '悬疑推理',
        originId: 85,
        children: [
          { name: '推理侦探', originId: 850 },
          { name: '诡秘惊险', originId: 851 },
          { name: '悬疑探险', originId: 852 },
          { name: '奇妙世界', originId: 853 },
          { name: '神秘文化', originId: 854 },
          { name: '幽情奇缘', originId: 30099 }
        ]
      },
      {
        name: '短篇',
        originId: 30083,
        children: [{ name: '短篇小说', originId: 30089 }]
      },
      {
        name: '科幻空间',
        originId: 86,
        children: [
          { name: '星际恋歌', originId: 864 },
          { name: '时空穿梭', originId: 866 },
          { name: '未来世界', originId: 862 },
          { name: '古武机甲', originId: 867 },
          { name: '超级科技', originId: 868 },
          { name: '进化变异', originId: 863 },
          { name: '末世危机', originId: 869 }
        ]
      },
      {
        name: '游戏竞技',
        originId: 88,
        children: [
          { name: '电子竞技', originId: 880 },
          { name: '网游情缘', originId: 881 },
          { name: '游戏异界', originId: 882 },
          { name: '体育竞技', originId: 883 }
        ]
      },
      {
        name: '轻小说',
        originId: 87,
        children: [
          { name: '同人衍生', originId: 30100 },
          { name: '唯美幻想', originId: 30101 },
          { name: '萌系变身', originId: 30102 },
          { name: '恋爱日常', originId: 30103 },
          { name: '搞笑吐槽', originId: 30104 },
          { name: '古典衍生', originId: 30105 },
          { name: '影视衍生', originId: 30106 },
          { name: '动漫衍生', originId: 30107 },
          { name: '其他衍生', originId: 30108 }
        ]
      },
      {
        name: '现实生活',
        originId: 30120,
        children: [
          { name: '家与情感', originId: 30121 },
          { name: '行业人生', originId: 30122 },
          { name: '探索科幻', originId: 30123 },
          { name: '人文博览', originId: 30124 }
        ]
      }
    ]
  },
  {
    channel: 'publish',
    items: [
      { name: '小说', originId: 13100 },
      { name: '青春文学', originId: 14300 },
      { name: '两性关系', originId: 13700 },
      { name: '文学', originId: 14100 },
      { name: '历史', originId: 14400 },
      { name: '传记', originId: 14500 },
      { name: '公版免费书', originId: 19100 }
    ]
  }
]

/** 数据库原始行：`is_custom` 为 0/1，`channel` 为原始文本。 */
interface CategoryDbRow {
  id: number
  originId: number | null
  channel: string | null
  parentId: number | null
  name: string
  sortOrder: number
  isCustom: number
}

/** 归一化频道：非法值归 null（等于自定义 / 未知频道）。 */
function coerceChannel(value: unknown): CategoryChannel | null {
  return CATEGORY_CHANNELS.includes(value as CategoryChannel) ? (value as CategoryChannel) : null
}

/** 数据库行 → 领域对象。 */
function toCategory(row: CategoryDbRow): CategoryRow {
  return {
    id: row.id,
    originId: row.originId,
    channel: coerceChannel(row.channel),
    parentId: row.parentId,
    name: row.name,
    sortOrder: row.sortOrder,
    isCustom: row.isCustom === 1
  }
}

/**
 * 列出全部分类（官方 + 自定义），按频道 / 父级 / 序号 / id 稳定排序。
 * 自定义分类 `channel IS NULL`，在 SQLite 中排最前。
 */
export function listCategories(): CategoryRow[] {
  const statement: Database.Statement<[], CategoryDbRow> = getDb().prepare(
    `SELECT id, origin_id AS originId, channel, parent_id AS parentId, name,
            sort_order AS sortOrder, is_custom AS isCustom
     FROM categories
     ORDER BY channel, parent_id, sort_order, id`
  )
  return statement.all().map(toCategory)
}

/**
 * 一次性灌入官方分类种子（幂等，由 settings 键 `categories:seed:v1` 守卫）。
 *
 * 灌入顺序：逐频道先插全部一级（`parent_id = NULL`），再插其二级
 * （`parent_id` = 刚插入的一级 `lastInsertRowid`）；`sort_order` 用数组下标保序。
 * 已置位则直接返回——重启应用、用户之后自定义分类都不会触发重灌。
 *
 * 调用点：`database/index.ts` 的 `getDb()`，在建表之后、`runDiagnostics()` 之前。
 */
export function seedCategoriesOnce(): void {
  if (getSetting(SEED_KEY) === '1') return

  const db = getDb()
  db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO categories (origin_id, channel, parent_id, name, sort_order, is_custom)
       VALUES (@originId, @channel, @parentId, @name, @sortOrder, 0)`
    )
    for (const group of SEED_CATEGORIES) {
      group.items.forEach((item, index) => {
        const result = insert.run({
          originId: item.originId,
          channel: group.channel,
          parentId: null,
          name: item.name,
          sortOrder: index
        })
        const parentId = Number(result.lastInsertRowid)
        item.children?.forEach((child, childIndex) => {
          insert.run({
            originId: child.originId,
            channel: group.channel,
            parentId,
            name: child.name,
            sortOrder: childIndex
          })
        })
      })
    }
    setSetting(SEED_KEY, '1')
  })()
}

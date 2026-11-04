/**
 * 写作页静态占位数据（阶段②起章节正文不再来自此文件——正文已接 paragraphs 表）；
 * 章节树见 `writer/chapters/`、大纲见 `writer/outline/`、剧情见 `writer/plot/`、
 * 设定档案四域（世界观 / 角色 / 势力 / 物品功法）见 `writer/dossier/`、伏笔见
 * `writer/foreshadow/`（均已接库）；
 * 本文件其余常量为「素材 / 笔记」等尚未接库的演示数据。
 * 文案逐条对齐 template/index.html 的写作视图（L986–1235），
 * 便于后续接入真实数据时按结构替换字段。
 */
import type { WriterModule } from '../../shell/activityBar'

/** 头像底色变体（对齐原型 `.list-avatar` 的 photo/loc/org/item/note 五档）。 */
export type AvatarVariant = 'photo' | 'loc' | 'org' | 'item' | 'note'

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

/* ---------- 章节树（卷 / 章）已迁至数据库 ----------
   卷 / 章数据真源为主进程章节域，渲染层经 `writer/chapters/useChapterTree.ts`
   加载、`writer/chapters/chapterTree.ts` 做分组与动态编号展示（见该模块）。
   此文件不再保留静态 `VOLUMES` / `DEFAULT_*` 章节树占位。 */

/* ---------- 中栏编辑区 ---------- */

export interface DocMeta {
  title: string
  meta: readonly string[]
}

export const CHAPTER_DOC: DocMeta = {
  title: '第二章 · 灯塔之下',
  meta: ['最后编辑 2 小时前', '· 第一卷 · 雾起南屿', '· 草稿']
}

export const OUTLINE_DOC: DocMeta = {
  title: '主线 · 寻找父亲',
  meta: ['贯穿全篇 · 已推进 42%', '· 关联 12 章']
}

export interface OutlineBlock {
  title: string
  paras: readonly string[]
}

export const OUTLINE_BLOCKS: readonly OutlineBlock[] = [
  {
    title: '梗概',
    paras: [
      '沈砚从北境回到故乡南屿，只为解开父亲三年前失踪的真相。一封最后的信将他引向废弃灯塔，而守塔人、渔家女、海鸦信局逐一登场，真相像海雾一样越裹越深。'
    ]
  },
  {
    title: '关键节点',
    paras: [
      '① 归屿 · 收到父亲遗信（已完成）',
      '② 灯塔之下 · 发现潮汐历法（进行中）',
      '③ 海鸦信局 · 找到父亲生前最后寄信记录',
      '④ 守塔人的秘密 · 知晓当年真相',
      '⑤ 长夜将尽 · 抉择与告别'
    ]
  }
]

export interface AssetCard {
  name: string
  meta: string
  doc?: boolean
}

export const ASSET_CARDS: readonly AssetCard[] = [
  { name: '东海渔村参考图', meta: '图片 · 2.4 MB' },
  { name: '灯塔结构剖面', meta: '图片 · 1.8 MB' },
  { name: '民国书信格式', meta: '文档 · 12 页', doc: true }
]

export interface NoteRow {
  avatar: string
  variant: AvatarVariant
  name: string
  sub: string
}

export const NOTE_ROWS: readonly NoteRow[] = [
  { avatar: '！', variant: 'item', name: '第二章修订要点', sub: '昨天 22:14' },
  { avatar: '？', variant: 'photo', name: '“雾”的象征意义', sub: '3 天前' }
]

export const NOTE_DOC: DocMeta = {
  title: '第二章修订要点',
  meta: ['创建于昨天 22:14']
}

export const NOTE_PARAGRAPHS: readonly string[] = [
  '1. 开篇海雾描写略长，压缩到 3 段以内；',
  '2. 沈砚拿信的动作重复了两次，删掉后者；',
  '3. “灯塔之下”这句台词的语气需要再冷一点，避免煽情；'
]

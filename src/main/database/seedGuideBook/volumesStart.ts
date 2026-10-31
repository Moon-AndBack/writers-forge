import type { SeedVolume } from '../seedBlocks'
import { seedBulletList, seedHeading, seedParagraph, seedRichParagraph } from '../seedBlocks'

/**
 * 卷一「开始使用」章节域载体（自 `volumes.ts` 拆出，§3 单文件 ≤500 行）。
 *
 * 按「卷 = 功能分区」粒度独立成文件；由 `volumes.ts` import 聚合进 `GUIDE_VOLUMES`，
 * 卷序不变。教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */

/** 卷一「开始使用」：应用总览、书架、首次启动引导。 */
export const VOLUME_START: SeedVolume = {
  kind: 'normal',
  title: '开始使用',
  chapters: [
    {
      title: "欢迎来到 Writer's Forge",
      paragraphs: [
        seedHeading("欢迎使用「Writer's Forge」"),
        seedRichParagraph([
          { text: "「Writer's Forge」是一款" },
          { text: '本地优先', bold: true },
          { text: '的桌面写作应用：书稿、大纲、设置全部保存在你自己的电脑上，无需注册登录。' }
        ]),
        seedParagraph('第一次打开会先请你起一个笔名，写好后它会出现在你的作品与界面上。'),
        seedParagraph(
          '本指南书只有一个作用：带你把每个功能都用一遍。左侧目录按功能分区，点开任何一章即可阅读；读完随时可以删掉这本书，不影响任何功能。'
        ),
        seedHeading('先记住三件事'),
        seedBulletList([
          '改了就存：正文停止输入约 1 秒后自动保存，也可以点标题栏的保存按钮立即落盘',
          '删了能找：删除的卷与章先进入回收站，确认不要了再彻底删除',
          '界面随你调：主题、排版、缩放都能在标题栏与底部状态栏调整'
        ])
      ]
    },
    {
      title: '书架',
      paragraphs: [
        seedHeading('书架：管理你的所有作品'),
        seedParagraph('书架是启动后的主页：每本书一张卡片，点击卡片即可进入写作页。'),
        seedHeading('新建一本书'),
        seedBulletList([
          '点标题栏右侧的「新建书籍」加号按钮（或书架工具栏的新建入口）',
          '填写书名（必填）、书籍简介',
          '选分类：先在基础字段选好频道（男频 / 女频 / 出版，可选「未设置」），再用「主分类」「子分类」下拉逐级选好，点「添加」加入已选（可加多条）',
          '分类规则：同一个主分类可加多个子分类；加了主分类本身就不能再加它的子类；已选分类在下方以标签展示（子分类显示为「主-子」，主分类显示主名），点标签的 × 可移除',
          '「主分类」下拉在未选频道时只列自定义分类（「我的分类」，管理入口在设置弹窗的「自定义分类」卡片）；切换频道会清空已选的官方分类，但保留「我的分类」里的选择',
          '选状态（连载中 / 已完结 / 草稿 / 暂停 / 太监 / 修订中）；状态 / 频道 / 篇幅都是下拉，频道与篇幅可选「未设置」',
          '挑一个封面渐变色，也可以上传本地图片作封面图',
          '点「创建」按钮，新卡片出现在书架上'
        ]),
        seedHeading('整理书架'),
        seedRichParagraph([
          { text: '顶部工具栏提供' },
          { text: '搜索', bold: true },
          { text: '（匹配书名）、状态' },
          { text: '筛选', bold: true },
          {
            text: '（全部 / 连载中 / 已完结 / 草稿 / 暂停 / 太监 / 修订中）与'
          },
          { text: '排序', bold: true },
          { text: '（最近编辑 / 字数最多 / 章节最多 / 书名）。' }
        ]),
        seedParagraph(
          '把鼠标移到卡片上，右上角会出现「编辑」与「删除」按钮：编辑可随时改书籍信息；删除会弹出确认框——书籍的章节与正文会一并永久删除，请谨慎操作。'
        ),
        seedHeading('状态栏统计'),
        seedParagraph('书架页底部状态栏实时显示：书籍总数、累计字数、今日写作字数与连续写作天数。')
      ]
    }
  ]
}

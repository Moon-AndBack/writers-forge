/**
 * 写作页「章节正文空态」励志古诗 / 历史名句库。
 *
 * 中文池取自**公有领域**的中国古典作品（先秦至清代，作者均已辞世逾百年），
 * 英文池取自**公有领域**的英文名句（莎士比亚、爱默生、梭罗、奥斯汀、狄更斯等，
 * 作者均已辞世逾百年 / 作品首发于 1929 年前）。主题偏「励志 / 坚持 / 勤学 / 求索」，
 * 用于正文为空时在光标处内联展示的装饰性占位提示
 * （见 chapters/ChaptersView.tsx、outline/OutlineEditor.tsx 与 styles/writer-editor-doc.css）。
 *
 * 口径：每条 `{ text, source }`；`text` 为诗句 / 名句正文，`source` 为出处
 * （中文为 `作者《篇名》`，先秦典籍无确证作者时以书名标注，如《荀子·劝学》；
 * 英文为 `Author, Work`）。
 *
 * 诗句属**内容型数据**（随语言切换的是数据池而非界面控件文案），故不放入 i18n
 * 资源，由调用方传入当前语言经 `getQuotePool()` 取池。
 */

/** 单条提示：诗句正文 + 作者 / 出处。 */
export interface WritingQuote {
  /** 诗句 / 名句正文。 */
  text: string
  /** 作者与出处，如 `李白《行路难·其一》`。 */
  source: string
}

/** 空态占位诗句 / 名句池（公有领域）。 */
export const WRITING_QUOTES: readonly WritingQuote[] = [
  { text: '长风破浪会有时，直挂云帆济沧海。', source: '李白《行路难·其一》' },
  { text: '会当凌绝顶，一览众山小。', source: '杜甫《望岳》' },
  { text: '千磨万击还坚劲，任尔东西南北风。', source: '郑燮《竹石》' },
  { text: '宝剑锋从磨砺出，梅花香自苦寒来。', source: '《警世贤文·勤奋篇》' },
  { text: '业精于勤，荒于嬉；行成于思，毁于随。', source: '韩愈《进学解》' },
  { text: '锲而不舍，金石可镂。', source: '《荀子·劝学》' },
  { text: '不积跬步，无以至千里；不积小流，无以成江海。', source: '《荀子·劝学》' },
  { text: '天生我材必有用，千金散尽还复来。', source: '李白《将进酒》' },
  { text: '路漫漫其修远兮，吾将上下而求索。', source: '屈原《离骚》' },
  { text: '天行健，君子以自强不息。', source: '《周易·乾卦》' },
  { text: '士不可以不弘毅，任重而道远。', source: '《论语·泰伯》' },
  { text: '生于忧患，死于安乐。', source: '《孟子·告子下》' },
  { text: '穷且益坚，不坠青云之志。', source: '王勃《滕王阁序》' },
  { text: '老骥伏枥，志在千里；烈士暮年，壮心不已。', source: '曹操《龟虽寿》' },
  { text: '黄沙百战穿金甲，不破楼兰终不还。', source: '王昌龄《从军行·其四》' },
  { text: '沉舟侧畔千帆过，病树前头万木春。', source: '刘禹锡《酬乐天扬州初逢席上见赠》' },
  { text: '山重水复疑无路，柳暗花明又一村。', source: '陆游《游山西村》' },
  { text: '纸上得来终觉浅，绝知此事要躬行。', source: '陆游《冬夜读书示子聿》' },
  { text: '千淘万漉虽辛苦，吹尽狂沙始到金。', source: '刘禹锡《浪淘沙·其八》' },
  { text: '有志者事竟成。', source: '《后汉书·耿弇传》' },
  { text: '精诚所至，金石为开。', source: '《后汉书·广陵思王荆传》' },
  { text: '莫愁前路无知己，天下谁人不识君。', source: '高适《别董大·其一》' }
]

/** 英文空态占位名句池（公有领域；作者均已辞世逾百年、作品首发于 1929 年前）。 */
export const EN_WRITING_QUOTES: readonly WritingQuote[] = [
  { text: 'Brevity is the soul of wit.', source: 'William Shakespeare, Hamlet' },
  {
    text: 'There is nothing either good or bad, but thinking makes it so.',
    source: 'William Shakespeare, Hamlet'
  },
  { text: "What's past is prologue.", source: 'William Shakespeare, The Tempest' },
  {
    text: 'We are such stuff as dreams are made on.',
    source: 'William Shakespeare, The Tempest'
  },
  {
    text: 'Our doubts are traitors, and make us lose the good we oft might win by fearing to attempt.',
    source: 'William Shakespeare, Measure for Measure'
  },
  {
    text: 'The fool doth think he is wise, but the wise man knows himself to be a fool.',
    source: 'William Shakespeare, As You Like It'
  },
  {
    text: 'Trust thyself: every heart vibrates to that iron string.',
    source: 'Ralph Waldo Emerson, Self-Reliance'
  },
  {
    text: 'Nothing is at last sacred but the integrity of your own mind.',
    source: 'Ralph Waldo Emerson, Self-Reliance'
  },
  {
    text: 'Nature always wears the colors of the spirit.',
    source: 'Ralph Waldo Emerson, Nature'
  },
  {
    text: 'I went to the woods because I wished to live deliberately.',
    source: 'Henry David Thoreau, Walden'
  },
  {
    text: 'Our life is frittered away by detail. Simplify, simplify.',
    source: 'Henry David Thoreau, Walden'
  },
  {
    text: 'The mass of men lead lives of quiet desperation.',
    source: 'Henry David Thoreau, Walden'
  },
  {
    text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
    source: 'Jane Austen, Pride and Prejudice'
  },
  {
    text: 'There is a stubbornness about me that never can bear to be frightened at the will of others.',
    source: 'Jane Austen, Pride and Prejudice'
  },
  {
    text: 'It was the best of times, it was the worst of times.',
    source: 'Charles Dickens, A Tale of Two Cities'
  },
  {
    text: 'Whether I shall turn out to be the hero of my own life, these pages must show.',
    source: 'Charles Dickens, David Copperfield'
  },
  {
    text: 'Procrastination is the thief of time.',
    source: 'Charles Dickens, David Copperfield'
  },
  {
    text: 'Reading maketh a full man; conference a ready man; and writing an exact man.',
    source: 'Francis Bacon, Of Studies'
  },
  {
    text: 'Some books are to be tasted, others to be swallowed, and some few to be chewed and digested.',
    source: 'Francis Bacon, Of Studies'
  },
  {
    text: 'True ease in writing comes from art, not chance, as those move easiest who have learned to dance.',
    source: 'Alexander Pope, An Essay on Criticism'
  },
  {
    text: 'What is written without effort is in general read without pleasure.',
    source: 'Samuel Johnson, Lives of the Poets'
  },
  {
    text: 'Either write things worth reading, or do things worth the writing.',
    source: "Benjamin Franklin, Poor Richard's Almanack"
  }
]

/**
 * 按界面语言取空态名句池：`en*`（en / en-US …）取英文池，其余（含 zh-CN）取中文池。
 * 语言由调用方传入（`i18n.language`），本模块不持有任何语言状态。
 */
export function getQuotePool(locale: string): readonly WritingQuote[] {
  return locale.startsWith('en') ? EN_WRITING_QUOTES : WRITING_QUOTES
}

/**
 * 随机取一条索引；传入 `previous` 时避免与上一条相同（池长度 > 1 时），
 * 让轮换观感上「确实换了一条」。`pool` 缺省为中文池，按池长度随机。
 */
export function randomQuoteIndex(
  previous = -1,
  pool: readonly WritingQuote[] = WRITING_QUOTES
): number {
  const total = pool.length
  if (total <= 1) return 0
  let next = Math.floor(Math.random() * total)
  if (next === previous) next = (next + 1) % total
  return next
}

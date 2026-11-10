/**
 * 内置违禁词元信息（生成于 2026-11-10）。
 *
 * 计数为最终去重后的入库词数（单归属：一个词只进一个类别）。
 */
export const BUILTIN_CLEAN_WORDS_META = {
  version: 2,
  generatedAt: '2026-11-10',
  sources: [
    {
      id: 'fwwdn',
      repository: 'https://github.com/fwwdn/sensitive-stop-words',
      commit: 'a7d06bb1c321e669943b6841570d9da6dad8ce2b',
      license: 'Apache-2.0',
      files: ['广告.txt', '色情类.txt', '涉枪涉爆违法信息关键词.txt'],
      words: 195
    },
    {
      id: 'houbb',
      repository: 'https://github.com/houbb/sensitive-word-data',
      commit: 'fe6fc2921836217b8c90619db81b24af8b22d80f',
      license: 'Apache-2.0',
      files: ['src/main/resources/sensitive_word_tags.txt'],
      words: 531
    },
    {
      id: 'manual',
      description: '项目自建：反诈 / 诱导未成年 / 极端暴力 / 改装武器 / 赌博毒品补充',
      license: 'MIT',
      words: 548
    }
  ],
  counts: {
    sexual: 320,
    minorSexual: 25,
    gambling: 120,
    drug: 104,
    fraud: 270,
    violence: 70,
    weapon: 260,
    minor: 105
  },
  total: 1274
} as const

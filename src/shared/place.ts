/**
 * 卷 / 章位置串（跨域共享，纯函数）。
 *
 * 展示口径（伏笔 / 实体首次登场 / 未来其它域共用）：
 * 「卷X 卷名 · 第X章 章名」——号与名之间空格、卷与章之间「 · 」；
 * 所属卷缺失 / 卷无编号（自定义卷、分组、未分卷）时退化为「第X章 章名」。
 *
 * 标签函数由调用方注入（渲染层 `useChapterLabels` 提供），本模块不依赖 React / 具体行类型，
 * 故落在 `src/shared`（主进程 / 预加载 / 渲染层均可引用，AGENTS §9）。
 */

/** 位置串所需的最小行结构：只读名称段。 */
export interface PlaceNamed {
  title: string
}

/**
 * 位置串格式化所需的最小标签函数集合（由 `useChapterLabels` 提供；纯函数侧不依赖 hook）。
 *
 * 只取「编号前缀段」而非整串：位置串要求「卷X 卷名 · 第X章 章名」——号与名之间用空格、
 * 卷与章之间用「 · 」；而整串 `volumeLabel` / `chapterLabel` 内部已用「 · 」连接号与名，
 * 直接拼接会得到四段式。故此处改用前缀 + 名段自行拼串；全局共用的整串口径保持不动。
 */
export interface PlaceLabels<C extends PlaceNamed, V extends PlaceNamed> {
  /** 卷编号前缀段（「卷X」；自定义卷 / 分组 / 编号非法时为空串）。 */
  volumePrefixLabel: (volume: V) => string
  /** 章前段（普通章「第X章」；特殊章为 `specialPrefix`，如「序章」）。 */
  chapterRowPrefixLabel: (chapter: C) => string
}

/** 前缀段 + 名段拼接：空格分隔，任一段为空则省略（两段皆空 → 空串）。 */
function joinPlaceParts(prefix: string, name: string): string {
  if (prefix === '') return name
  return name === '' ? prefix : `${prefix} ${name}`
}

/**
 * 章节位置串（伏笔列表卡 / 右栏只读块 / 正文标记悬停 / 实体首次登场共用，AGENTS §9）：
 * 「卷X 卷名 · 第X章 章名」——号与名之间空格、卷与章之间「 · 」；
 * 所属卷缺失 / 卷无编号（自定义卷、分组）时退化为「第X章 章名」。
 */
export function formatChapterPlace<C extends PlaceNamed, V extends PlaceNamed>(
  volume: V | null,
  chapter: C,
  labels: PlaceLabels<C, V>
): string {
  const chapterPart = joinPlaceParts(labels.chapterRowPrefixLabel(chapter), chapter.title)
  const volumePart =
    volume === null ? '' : joinPlaceParts(labels.volumePrefixLabel(volume), volume.title)
  // 任一段为空则省掉分隔符，避免出现「 · 第X章 章名」这类残串。
  return [volumePart, chapterPart].filter((part) => part !== '').join(' · ')
}

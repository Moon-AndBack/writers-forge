/**
 * preload 类型域 · 共享数据库行类型（书籍 / 段落 / 卷章 / 统计 / 搜索 / 回收站）。
 *
 * 本文件属 `src/preload/types/` 按域拆分产物（`index.d.ts` 超 §3 的 500 行上限）。
 *
 * **单一真源（§9 通用化约束）**：全部经 `import type` 从主进程数据层取用，
 * **不再逐字镜像**——W8 已实证「双份维护」会让渲染层拿不到行类型、只能自己再抄一份
 * （`chapterTree.ts` / `outlineTree.ts` / `plotTree.ts` 的镜像注释即其产物）。
 * 改主进程类型后本文件与 renderer 自动同步，不存在漂移面。
 *
 * ⚠️ **为何 `import type` 不污染 renderer**：`import type` 纯类型导入，编译期被完全擦除，
 * 不会产生 `require` / 副作用，故 `better-sqlite3` / `electron` 等 Node 依赖
 * **不会**被拖进 renderer bundle（`tsconfig.web.json` 无需改 include；
 * tsc 会把跨出 include 的被导入文件自动纳入本 program 做类型检查，已由
 * `npm run typecheck:web` + `npm run build` 实证）。
 */

import type { BookRow, CreateBookInput, UpdateBookPatch } from '../../main/database/books'
import type {
  ChapterPin,
  ChapterRow,
  ChapterStats,
  CreateChapterInput,
  CreateVolumeInput,
  RenameChapterPatch,
  VolumeRow
} from '../../main/database/chapters'
import type { ChapterStatus } from '../../main/database/chapterStatus'
import type { ParagraphRow } from '../../main/database/paragraphs'
import type { BookStats } from '../../main/database/stats'
import type {
  ChapterReplaceAllInput,
  ChapterReplaceAllResult,
  ChapterReplaceInput,
  ChapterReplaceResult,
  ChapterSearchInput,
  ChapterSearchPage
} from '../../main/database/chapterSearch'
import type { DeletedContent, PurgeCounts } from '../../main/database/chapterTrash'

export type {
  BookRow,
  CreateBookInput,
  UpdateBookPatch,
  BookStats,
  ParagraphRow,
  ChapterStatus,
  ChapterPin,
  ChapterRow,
  ChapterStats,
  CreateChapterInput,
  CreateVolumeInput,
  RenameChapterPatch,
  VolumeRow,
  ChapterSearchInput,
  ChapterSearchPage,
  ChapterReplaceInput,
  ChapterReplaceResult,
  ChapterReplaceAllInput,
  ChapterReplaceAllResult,
  DeletedContent,
  PurgeCounts
}

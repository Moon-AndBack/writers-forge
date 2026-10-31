/**
 * 书籍表单对外类型域：由 `BookFormDialog.tsx` re-export（保持既有导入路径不变），
 * `useBookForm` 与装配层从这里取用，避免 hook ↔ 装配层的类型循环依赖。
 *
 * `categories` / `status` / `channel` / `lengthType` 与主进程 `books` 域同构
 * （`import type` 单一真源，见 `../data.ts` 文件头说明）。
 */
import type { BookChannel, BookLength, BookStatus } from '../data'

export type { BookChannel, BookLength, BookStatus }

/** 表单模式：新建或编辑（影响标题 / 提交按钮文案，字段与校验一致）。 */
export type BookFormMode = 'create' | 'edit'

/** 编辑模式的初始字段值（来自数据库行）。 */
export interface BookFormInitialValues {
  intro: string
  /** 分类 ID 列表（`categories.id`） */
  categories: number[]
  status: BookStatus
  /** 频道（可空） */
  channel: BookChannel | null
  /** 篇幅（可空） */
  lengthType: BookLength | null
  coverColor: string
}

/** 上传的封面图载荷：提交时经 `books.cover.set` 落库。 */
export interface BookCoverFile {
  mime: string
  /** structured clone 跨 IPC 传输形式 */
  data: Uint8Array
}

/** 表单提交结果（已去空白 / 归一化）。 */
export interface BookFormValues {
  title: string
  intro: string
  /** 分类 ID 列表（`categories.id`） */
  categories: number[]
  status: BookStatus
  /** 频道（可空） */
  channel: BookChannel | null
  /** 篇幅（可空） */
  lengthType: BookLength | null
  coverColor: string
  /** 新上传的封面图；未改动为 null */
  coverFile: BookCoverFile | null
  /** 是否移除已有封面图 */
  removeCover: boolean
}

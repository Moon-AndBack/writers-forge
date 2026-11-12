import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve, sep } from 'node:path'
import { formatTimestamp } from './snapshot'
import { BACKUP_EXTENSION, MANUAL_BACKUP_PREFIX, PRE_RESTORE_PREFIX } from './types'
import type { BackupItem, BackupKind } from './types'

/**
 * 本地备份目录与文件路径规则。
 *
 * 目录结构：`<userData>/backups/`
 * 文件名：
 * - 手动备份：`writers-forge-<YYYYMMDD-HHmmss>.db`
 * - 恢复前安全副本：`pre-restore-<YYYYMMDD-HHmmss>.db`
 *
 * 安全边界：从备份列表恢复 / 删除时只接受**备份目录内**的纯文件名，
 * 拒绝 `..`、绝对路径、路径分隔符与非 `.db` 文件（见 `resolveBackupFilePath`）。
 */

/** 备份目录名（位于 userData 下）。 */
const BACKUP_DIR_NAME = 'backups'

/** 文件名内本地时间戳：`YYYYMMDD-HHmmss.db`。 */
const FILE_TIME_PATTERN = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/i

/** 备份目录绝对路径；目录不存在时自动创建。 */
export function getBackupDir(): string {
  const directory = join(app.getPath('userData'), BACKUP_DIR_NAME)
  mkdirSync(directory, { recursive: true })
  return directory
}

/** 按来源生成备份文件名（本地时间）。 */
export function buildBackupFileName(kind: BackupKind, now: Date = new Date()): string {
  const prefix = kind === 'pre-restore' ? PRE_RESTORE_PREFIX : MANUAL_BACKUP_PREFIX
  return `${prefix}${formatTimestamp(now)}${BACKUP_EXTENSION}`
}

/** 由文件名前缀判定来源。 */
export function classifyBackupKind(name: string): BackupKind {
  return name.startsWith(PRE_RESTORE_PREFIX) ? 'pre-restore' : 'manual'
}

/** 从文件名解析本地时间；格式不符或日期非法返回 null。 */
export function parseBackupTime(name: string): Date | null {
  const match = FILE_TIME_PATTERN.exec(name)
  if (!match) return null

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const date = new Date(year, month - 1, day, hour, minute, second)

  if (Number.isNaN(date.getTime())) return null
  // Date 会把 20261340 这类非法值自动进位；逐字段回读，避免把错误时间当作有效。
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null
  }
  return date
}

/** 组装列表项：`createdAt` 优先取文件名时间，否则回退文件 mtime。 */
export function toBackupItem(
  name: string,
  filePath: string,
  size: number,
  mtimeMs: number
): BackupItem {
  const parsed = parseBackupTime(name)
  return {
    name,
    path: filePath,
    size,
    createdAt: (parsed ?? new Date(mtimeMs)).toISOString(),
    kind: classifyBackupKind(name)
  }
}

/** 列出备份目录内全部 `.db` 文件（按 mtime 倒序）。 */
export async function listBackups(): Promise<BackupItem[]> {
  const directory = getBackupDir()
  const entries = await readdir(directory, { withFileTypes: true })
  const rows: Array<{ item: BackupItem; mtimeMs: number }> = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith(BACKUP_EXTENSION)) continue

    const filePath = join(directory, entry.name)
    try {
      const info = await stat(filePath)
      if (!info.isFile()) continue
      rows.push({
        item: toBackupItem(entry.name, filePath, info.size, info.mtimeMs),
        mtimeMs: info.mtimeMs
      })
    } catch {
      // 列表期间文件被删除 / 无权限：跳过该行，不影响其它备份。
    }
  }

  rows.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return rows.map((row) => row.item)
}

export type BackupPathResolution = { ok: true; path: string } | { ok: false; code: 'invalid_name' }

/**
 * 路径守卫：把备份列表里的文件名解析为备份目录内的绝对路径。
 *
 * 只接受纯文件名（不含 `/` / `\`、非绝对路径、非 `.` / `..`、以 `.db` 结尾）；
 * 再用 `resolve` 后前缀校验兜底，拒绝任何逃逸出备份目录的路径。
 */
export function resolveBackupFilePath(name: string): BackupPathResolution {
  if (typeof name !== 'string' || name.length === 0) {
    return { ok: false, code: 'invalid_name' }
  }
  if (name === '.' || name === '..') return { ok: false, code: 'invalid_name' }
  if (name.includes('/') || name.includes('\\')) return { ok: false, code: 'invalid_name' }
  if (isAbsolute(name)) return { ok: false, code: 'invalid_name' }
  if (basename(name) !== name) return { ok: false, code: 'invalid_name' }
  if (!name.toLowerCase().endsWith(BACKUP_EXTENSION)) {
    return { ok: false, code: 'invalid_name' }
  }

  const directory = resolve(getBackupDir())
  const target = resolve(directory, name)
  if (!target.startsWith(`${directory}${sep}`)) {
    return { ok: false, code: 'invalid_name' }
  }

  return { ok: true, path: target }
}

import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve, sep } from 'node:path'
import { formatTimestamp } from './snapshot'
import { BACKUP_EXTENSION, MANUAL_BACKUP_PREFIX } from './types'
import type { BackupItem, BackupMeta } from './types'

/**
 * 本地备份目录、文件夹命名与路径守卫。
 *
 * 目录结构：`<userData>/backups/<YYYYMMDD-HHmmss>[-<slug>]/`
 * - `snapshot.db` 整库在线快照；
 * - `meta.json`   名称 / 创建时间 / 来源 / 大小。
 *
 * 文件夹名由时间戳与用户名称组成；`meta.name` 保存**原始输入**，文件夹名里的
 * 名称部分只是便于在文件管理器中识别。旧版平铺 `writers-forge-*.db` 仍留在
 * 磁盘，但**不参与列表扫描**。
 *
 * 安全边界：从备份列表恢复 / 删除 / 重命名时只接受**备份目录内**的纯文件夹名，
 * 拒绝 `..`、绝对路径、路径分隔符（见 `resolveBackupFolder`）。
 */

/** 备份目录名（位于 userData 下）。 */
const BACKUP_DIR_NAME = 'backups'

/** 备份文件夹内的整库快照文件名。 */
export const SNAPSHOT_FILE_NAME = 'snapshot.db'

/** 备份文件夹内的元信息文件名。 */
export const META_FILE_NAME = 'meta.json'

/** 文件夹名时间戳前缀固定长度：`YYYYMMDD-HHmmss`。 */
const TIMESTAMP_LENGTH = 15

/** 文件夹名时间戳格式。 */
const TIMESTAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/

/** Windows 文件夹名非法字符。 */
const INVALID_FOLDER_CHARS = /[\\/:*?"<>|]/g

/** 名称部分最大字符数（按 Unicode 码点计）。 */
const FOLDER_NAME_LIMIT = 40

/** 备份目录绝对路径；目录不存在时自动创建。 */
export function getBackupDir(): string {
  const directory = join(app.getPath('userData'), BACKUP_DIR_NAME)
  mkdirSync(directory, { recursive: true })
  return directory
}

/** 整库导出的默认文件名（`writers-forge-<YYYYMMDD-HHmmss>.db`，本地时间）。 */
export function buildBackupFileName(now: Date = new Date()): string {
  return `${MANUAL_BACKUP_PREFIX}${formatTimestamp(now)}${BACKUP_EXTENSION}`
}

/** 把用户输入规整为文件夹名可用的 slug；为空返回空串。 */
function slugifyBackupName(name: string): string {
  const cleaned = name
    .replace(INVALID_FOLDER_CHARS, '')
    .replace(/\s+/g, '-')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  // 按码点截断，避免把 emoji 等代理对切一半；截断后可能留下尾部空格 / 点。
  return Array.from(cleaned)
    .slice(0, FOLDER_NAME_LIMIT)
    .join('')
    .replace(/^[\s.]+|[\s.]+$/g, '')
}

/**
 * 构建备份文件夹名：`<timestamp>`，名称非空时追加 `-<slug>`。
 * slug 为空（例如只输入非法字符）时回退纯时间戳。
 */
export function buildBackupFolderName(input: { timestamp: string; name: string }): string {
  const slug = slugifyBackupName(input.name)
  return slug === '' ? input.timestamp : `${input.timestamp}-${slug}`
}

/**
 * 从文件夹名解析时间戳前缀（固定 15 字符），日期非法返回 null。
 * 重命名时用它保留创建时间前缀，不允许用户改时间。
 */
export function parseFolderTimestamp(folder: string): string | null {
  const prefix = folder.slice(0, TIMESTAMP_LENGTH)
  if (prefix.length !== TIMESTAMP_LENGTH) return null

  const match = TIMESTAMP_PATTERN.exec(prefix)
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
  return prefix
}

/** 把任意 JSON 值规范为 `BackupMeta`；字段缺失 / 非法返回 null。 */
function normalizeBackupMeta(value: unknown): BackupMeta | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const { name, createdAt, kind, size } = record
  if (typeof name !== 'string' || typeof createdAt !== 'string') return null
  if (kind !== 'manual' && kind !== 'pre-restore') return null

  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null

  return {
    name,
    createdAt: created.toISOString(),
    kind,
    size: typeof size === 'number' && Number.isFinite(size) ? size : 0
  }
}

/** 读取备份文件夹的 `meta.json`；缺失 / 损坏返回 null（调用方跳过该目录）。 */
export function readBackupMeta(folderPath: string): BackupMeta | null {
  let raw: string
  try {
    raw = readFileSync(join(folderPath, META_FILE_NAME), 'utf8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  return normalizeBackupMeta(parsed)
}

/** 写入备份文件夹的 `meta.json`（失败抛给调用方决定错误码）。 */
export function writeBackupMeta(folderPath: string, meta: BackupMeta): void {
  writeFileSync(join(folderPath, META_FILE_NAME), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
}

/**
 * 列出备份目录内的备份文件夹。
 *
 * - 只扫描目录，忽略旧版平铺 `.db`；
 * - 目录必须同时存在 `snapshot.db` 与合法的 `meta.json`，否则跳过；
 * - `size` 以 `snapshot.db` 的 `stat.size` 为准；
 * - 按 `createdAt` 倒序，相同时间按文件夹名倒序。
 */
export async function listBackups(): Promise<BackupItem[]> {
  const directory = getBackupDir()
  const entries = await readdir(directory, { withFileTypes: true })
  const items: BackupItem[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const folderPath = join(directory, entry.name)
    try {
      const snapshotInfo = await stat(join(folderPath, SNAPSHOT_FILE_NAME))
      if (!snapshotInfo.isFile()) continue

      const meta = readBackupMeta(folderPath)
      if (!meta) continue

      items.push({
        folder: entry.name,
        name: meta.name,
        createdAt: meta.createdAt,
        size: snapshotInfo.size,
        kind: meta.kind
      })
    } catch {
      // 目录不完整 / 读取期间被删除 / 无权限：跳过该行，不影响其它备份。
    }
  }

  items.sort((a, b) => {
    const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (diff !== 0) return diff
    return a.folder < b.folder ? 1 : a.folder > b.folder ? -1 : 0
  })
  return items
}

export type BackupFolderResolution =
  { ok: true; path: string } | { ok: false; code: 'invalid_name' }

/**
 * 路径守卫：把备份列表里的文件夹名解析为备份目录内的绝对路径。
 *
 * 只接受纯文件夹名（不含 `/` / `\`、非绝对路径、非 `.` / `..`）；
 * 再用 `resolve` 后前缀校验兜底，拒绝任何逃逸出备份目录的路径。
 */
export function resolveBackupFolder(name: string): BackupFolderResolution {
  if (typeof name !== 'string' || name.length === 0) {
    return { ok: false, code: 'invalid_name' }
  }
  if (name === '.' || name === '..') return { ok: false, code: 'invalid_name' }
  if (name.includes('/') || name.includes('\\')) return { ok: false, code: 'invalid_name' }
  if (isAbsolute(name)) return { ok: false, code: 'invalid_name' }
  if (basename(name) !== name) return { ok: false, code: 'invalid_name' }

  const directory = resolve(getBackupDir())
  const target = resolve(directory, name)
  if (!target.startsWith(`${directory}${sep}`)) {
    return { ok: false, code: 'invalid_name' }
  }

  return { ok: true, path: target }
}

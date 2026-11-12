/**
 * 本地备份任务互斥（主进程单实例内）。
 *
 * 覆盖「立即备份 / 恢复 / 整库导出」三类会长时间占用数据库的操作：
 * - 同一时刻只允许一个任务；
 * - 创建与恢复必须互斥，避免恢复替换数据库时仍有快照在写；
 * - 导出只与恢复互斥（快照读与普通备份写可并存）。
 */

export type BackupJobKind = 'create' | 'restore' | 'export'

let activeJob: BackupJobKind | null = null

/** 是否有本地备份任务进行中。 */
export function isBackupJobRunning(): boolean {
  return activeJob !== null
}

/** 是否有恢复任务进行中。 */
export function isRestoreRunning(): boolean {
  return activeJob === 'restore'
}

/** 尝试占用任务槽位；已有任务时返回 false。 */
export function tryStartBackupJob(kind: BackupJobKind): boolean {
  if (activeJob !== null) return false
  activeJob = kind
  return true
}

/** 释放任务槽位（必须放在 finally）。 */
export function finishBackupJob(): void {
  activeJob = null
}

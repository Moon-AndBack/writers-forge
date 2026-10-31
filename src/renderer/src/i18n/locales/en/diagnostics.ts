/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 */
import type { ZhCNResources } from '../zh-CN'

const diagnostics = {
  dialog: {
    title: 'Data Health Check',
    summary: '{{n}} data issue(s) detected',
    checkedAt: 'Checked at: {{time}}',
    hint: 'These issues do not block startup, but may affect data integrity. Back up the app data directory first, then address them using the list below.',
    dismiss: 'Got it'
  },
  issue: {
    structure: {
      missingTable: {
        title: 'Missing table: {{table}}',
        detail:
          'The table "{{table}}" in the design schema does not exist; data for related features cannot be read.'
      },
      extraTable: {
        title: '{{n}} unexpected table(s) found',
        detail:
          'The following tables are not part of the design schema (possibly from an old version or an external tool): {{items}}'
      },
      missingColumn: {
        title: 'Table {{table}} is missing {{n}} column(s)',
        detail: 'Missing columns: {{items}}'
      },
      extraColumn: {
        title: 'Table {{table}} has {{n}} unexpected column(s)',
        detail:
          'Unexpected columns: {{items}} (may be leftovers from an old version, e.g. volumes.has_outline)'
      },
      missingIndex: {
        title: '{{n}} index(es) missing',
        detail: 'Missing indexes: {{items}}'
      },
      extraIndex: {
        title: '{{n}} unexpected index(es) found',
        detail: 'Unexpected indexes: {{items}}'
      }
    },
    foreignKey: {
      orphan: {
        title: '{{n}} dangling foreign key reference(s) (parent table {{parent}})',
        detail: 'These rows reference a parent row that does not exist: {{items}}'
      }
    },
    invariant: {
      volumeWithoutOutline: {
        title: '{{n}} volume(s) missing an outline',
        detail: 'Every volume should have one volume-level outline; missing for: {{items}}'
      },
      duplicateVolumeOutline: {
        title: '{{n}} volume(s) with duplicate outlines',
        detail:
          'Each volume may have at most one outline; the following exceed that (with duplicate counts): {{items}}'
      },
      chapterInGroupVolume: {
        title: '{{n}} chapter(s) placed under a group container volume',
        detail:
          'Group containers are outline-only and cannot hold chapters; the following are invalid: {{items}}'
      },
      specialChapterMissingPrefix: {
        title: '{{n}} special chapter(s) missing a prefix or name',
        detail:
          'A special chapter must have both a prefix (e.g. "Prologue") and a non-empty name; the following are invalid: {{items}}'
      },
      normalChapterPinned: {
        title: '{{n}} normal chapter(s) incorrectly pinned',
        detail:
          'Only special chapters can be pinned to top/bottom; the following are invalid: {{items}}'
      },
      specialChapterInCustomVolume: {
        title: '{{n}} special chapter(s) inside a custom volume',
        detail:
          'Special chapters are not allowed in custom volumes; the following are invalid: {{items}}'
      },
      outlineItemConsistency: {
        title: '{{n}} outline item(s) with inconsistent type/ownership',
        detail:
          'Item type (standalone/under-volume) must match its volume ownership; the following are invalid (format: id (type/scope/volume)): {{items}}'
      }
    },
    world: {
      orphanChild: {
        title: '{{n}} orphaned setting child row(s) found',
        detail: 'These child rows have no matching setting entity (format: table#rowid): {{items}}'
      },
      entityChildMismatch: {
        title: '{{n}} setting(s) whose type does not match their child rows',
        detail:
          'A setting type must have exactly one matching child row (character / power system); the following are invalid (format: id (type)): {{items}}'
      },
      selfRelation: {
        title: '{{n}} self-referencing relation(s) found',
        detail:
          'Both ends of a relation pointing to the same row is meaningless; the following are invalid (format: table#rowid): {{items}}'
      }
    },
    plot: {
      sceneEntityOrphan: {
        title: '{{n}} dangling plot scene setting link(s) found',
        detail:
          'These scene-setting links point to a scene or setting that does not exist (format: table#rowid): {{items}}'
      }
    },
    integrity: {
      corrupt: {
        title: 'Database file integrity check failed',
        detail:
          'SQLite reported the following; back up soon and consider restoring from a backup: {{items}}'
      }
    },
    diagnostics: {
      checkFailed: {
        title: 'Data self-check could not complete',
        detail:
          'It stopped after {{n}} check(s); results may be incomplete. See the app log for details.'
      },
      internalError: {
        title: 'Data self-check could not start',
        detail:
          'The self-check failed at the start; the database may be unavailable. See the app log for details.'
      }
    }
  }
} satisfies ZhCNResources['diagnostics']

export default diagnostics

/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * 说明：语言自称（简体中文 / English）保留原文，不随界面语言翻译。
 */
import type { ZhCNResources } from '../zh-CN'

const settings = {
  general: {
    title: 'Basic preferences',
    description: 'General behavior and startup preferences'
  },
  locale: {
    label: 'Language',
    description: 'Choose the display language of the app.',
    zhCN: '简体中文',
    en: 'English'
  },
  autoSave: {
    label: 'Auto save',
    description:
      'Save the document automatically while editing; when off, save manually (switching chapters or closing the window still saves)'
  },
  defaultView: {
    label: 'Default view',
    description: 'The page shown by default when the app starts',
    bookshelf: 'Bookshelf',
    chapter: 'Chapter editor',
    outline: 'Outline view'
  },
  appearance: {
    title: 'Appearance & theme',
    description: 'Theme and display preferences'
  },
  themeMode: {
    label: 'Theme mode',
    description: 'Follow the system or pick a light/dark preset theme'
  },
  data: {
    title: 'Data & backup',
    description: 'Local backup, restore and full-database export',
    create: {
      label: 'Back up now',
      description: 'Create a local snapshot of the whole database',
      action: 'Back up now',
      successToast: 'Backup created: {{name}}'
    },
    backups: {
      title: 'Backup list',
      count: '{{count}} backup(s)',
      loading: 'Reading local backups…',
      empty: 'No local backups yet',
      restoreFile: 'Restore from file…',
      restoreFileHint: 'Choose any .db file to restore the whole database',
      restoreAria: 'Restore backup “{{name}}”',
      renameAria: 'Rename backup “{{name}}”',
      renamePlaceholder: 'Backup name',
      deleteAria: 'Delete backup “{{name}}”',
      deleteConfirmTitle: 'Delete backup',
      deleteConfirmMessage: 'Delete the backup “{{name}}”? This cannot be undone.',
      delete: 'Delete',
      deletedToast: 'Deleted backup “{{name}}”',
      kindManual: 'Manual backup',
      kindPreRestore: 'Pre-restore safety copy'
    },
    export: {
      label: 'Export',
      description: 'Export the whole database file (.db)',
      action: 'Export database file',
      successToast: 'Database file exported'
    },
    location: {
      label: 'Data folder',
      description: 'Backups and app data are stored on this device',
      action: 'Open backup folder',
      successToast: 'Opened the backup folder'
    },
    restore: {
      title: 'Restore backup',
      confirm: 'Overwrite and restore',
      confirmCover: 'The backup “{{name}}” will overwrite all current data.',
      confirmCoverFile: 'The selected backup file will overwrite all current data.',
      confirmSafeCopy:
        'A safety copy will be created automatically before restoring, so the current data can be rolled back.',
      confirmRestart: 'The app will restart automatically after a successful restore.',
      confirmFlush: 'Unsaved edits will be saved first.',
      restarting: 'Restoring and restarting…',
      successToast: 'Restore complete, the app is about to restart'
    },
    error: {
      backup_in_progress: 'A backup or restore task is already running. Please try again later.',
      snapshot_failed: 'Failed to create a database snapshot. Please retry.',
      invalid_file: 'The selected file is not a valid backup file.',
      corrupt: 'The backup file is corrupted and cannot be restored.',
      copy_failed: 'Failed to copy the backup file. Check disk space and permissions.',
      safe_copy_failed: 'Failed to create the pre-restore safety copy. Restore was aborted.',
      restore_failed: 'Restore failed; current data was not replaced.',
      invalid_name: 'The backup folder name is invalid.',
      not_found: 'The backup does not exist; it may have been moved or deleted.',
      list_failed: 'Failed to read the backup list.',
      delete_failed: 'Failed to delete the backup. Please retry.',
      export_failed: 'Failed to export the database file.',
      open_failed: 'Failed to open the backup folder.',
      canceled: 'Operation canceled.',
      conflict: 'A backup with this name already exists. Choose another name.',
      rename_failed: 'Failed to rename the backup. Please retry.'
    }
  },
  categories: {
    title: 'Custom categories',
    description:
      'Create your own categories shared by all books; independent of the official “Male / Female / Publishing” channels',
    placeholder: 'Enter a new category name',
    add: 'Add',
    empty: 'No custom categories yet',
    rename: 'Rename',
    renameAria: 'Rename category “{{name}}”',
    delete: 'Delete',
    deleteAria: 'Delete category “{{name}}”',
    deleteConfirmTitle: 'Delete Category',
    deleteConfirmMessage: 'Delete the custom category “{{name}}”?',
    deletedToast: 'Deleted category “{{name}}”',
    duplicate: 'A category with the same name already exists (including official ones)',
    inUse: 'Used by {{count}} book(s), cannot be deleted',
    deleteFailed: 'Delete failed, please retry'
  }
} satisfies ZhCNResources['settings']

export default settings

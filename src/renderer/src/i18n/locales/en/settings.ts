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
    description: 'Theme mode'
  },
  themeMode: {
    label: 'Theme mode',
    description: 'Follow the system or pick a light/dark preset theme'
  },
  data: {
    title: 'Data & backup',
    description: 'Local data location and data export',
    location: {
      label: 'Local data storage',
      description: 'Current files are saved on your local disk',
      action: 'Open folder'
    },
    export: {
      label: 'Export all data',
      description: 'Export all manuscripts as Markdown',
      action: 'Export data'
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

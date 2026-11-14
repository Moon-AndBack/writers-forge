/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * 说明：品牌标识 OneDrive 保持原文。
 */
import type { ZhCNResources } from '../zh-CN'

const onedrive = {
  section: {
    title: 'Cloud backup'
  },
  provider: {
    label: 'Cloud provider',
    description:
      'Only OneDrive is currently supported. This provider choice is saved in local settings.',
    oneDrive: 'OneDrive'
  },
  account: {
    label: 'Account status',
    loading: 'Reading account status…',
    signedOut: 'Not signed in',
    signedInAs: 'Signed in as {{name}}',
    unknownName: 'Unknown account',
    signIn: 'Sign in to OneDrive',
    signingIn: 'Waiting for authorization in your browser…',
    cancelSignIn: 'Cancel sign-in',
    signOut: 'Sign out',
    signedInToast: 'Signed in to OneDrive',
    encryptionUnavailable:
      'Secure storage is unavailable on this system, so sign-in and backup are disabled. Check your system keychain / credential manager settings and restart the app.'
  },
  signOut: {
    confirmTitle: 'Sign out of OneDrive',
    confirmMessage:
      'You will need to sign in again to back up; the authorization credentials stored on this device will be removed.',
    confirmAction: 'Sign out',
    successToast: 'Signed out of OneDrive'
  },
  backup: {
    label: 'Manual backup',
    description: 'Creates a full-library snapshot and uploads it to OneDrive',
    action: 'Back up now',
    cancel: 'Cancel backup',
    phase: {
      snapshot: 'Creating snapshot…',
      upload: 'Uploading… {{percent}}%',
      download: 'Downloading… {{percent}}%',
      restore: 'Restoring the database…',
      done: 'Backup complete'
    },
    bytes: '{{sent}} / {{total}}',
    progressLabel: 'Backup progress',
    successToast: 'Backup complete: {{fileName}} ({{size}})'
  },
  notice: {
    signInCancelled: 'Sign-in cancelled',
    backupCancelled: 'Backup cancelled'
  },
  remote: {
    title: 'Cloud backups',
    refresh: 'Refresh',
    loading: 'Loading cloud backups…',
    empty: 'No cloud backups yet',
    restoreAria: 'Restore cloud backup "{{name}}"',
    deleteAria: 'Delete cloud backup "{{name}}"',
    confirm: {
      title: 'Restore from cloud backup',
      cover: 'This will overwrite all current data with cloud backup "{{name}}".',
      safeCopy:
        'A local safety copy (pre-restore) is created automatically before restoring, so the current data can be rolled back.',
      restart: 'The app will restart automatically after a successful restore.',
      flush: 'Unsaved edits will be saved first.',
      action: 'Overwrite and restore'
    },
    deleteConfirmTitle: 'Delete cloud backup',
    deleteConfirmMessage:
      'This removes cloud backup "{{name}}" from OneDrive. You can restore it from the OneDrive recycle bin afterwards.',
    delete: 'Delete',
    deletedToast: 'Deleted cloud backup "{{name}}"',
    phase: {
      download: 'Downloading… {{percent}}%',
      restore: 'Restoring the database… {{percent}}%'
    },
    progressLabel: 'Restore progress',
    cancel: 'Cancel restore',
    restarting: 'Restoring and restarting…',
    cancelled: 'Restore cancelled',
    failed: 'Restore failed; current data was not replaced. Please try again later.'
  },
  unsupported: 'OneDrive backup is not available in this environment',
  error: {
    not_configured: 'Not signed in to OneDrive',
    encryption_unavailable:
      'Secure storage is unavailable, so authorization credentials cannot be read or saved',
    credentials_corrupt:
      'Stored authorization credentials are corrupted; sign out and sign in again',
    auth_cancelled: 'Sign-in cancelled',
    auth_timeout: 'Sign-in timed out; please try again',
    auth_failed: 'Sign-in failed; please try again later',
    state_mismatch: 'Sign-in verification failed; please try again',
    reauth_required: 'Authorization expired; please sign in again',
    port_bind_failed:
      'Could not start the local callback service (port in use); close the conflicting program and retry',
    network: 'Network connection failed; check your network and retry',
    timeout: 'Request timed out; please try again later',
    aborted: 'Operation cancelled',
    unauthorized: 'Authorization is invalid or expired; please sign in again',
    forbidden: 'Access denied; check the permissions of your OneDrive account',
    not_found: 'The target file or folder was not found',
    rate_limited: 'Too many requests; please try again later',
    upstream: 'OneDrive service is temporarily unavailable; please try again later',
    upload_failed: 'Upload failed; check your network and retry',
    snapshot_failed: 'Failed to create the local snapshot; check disk space and retry',
    list_failed: 'Failed to load the cloud backup list; please try again later',
    download_failed: 'Failed to download the cloud backup; check your network and retry',
    delete_failed: 'Failed to delete the cloud backup; please try again later',
    remote_not_found: 'The cloud backup does not exist or has been deleted',
    backup_in_progress: 'A backup is already running; wait for it to finish and try again',
    unknown: 'An unknown error occurred; please try again later'
  }
} satisfies ZhCNResources['onedrive']

export default onedrive

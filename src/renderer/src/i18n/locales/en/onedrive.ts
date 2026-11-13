/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * 说明：品牌标识 OneDrive / clientId 保持原文。
 */
import type { ZhCNResources } from '../zh-CN'

const onedrive = {
  section: {
    title: 'OneDrive cloud backup',
    description: 'Upload a full-library snapshot to OneDrive as an off-site copy of your local data'
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
    description: 'Create a full-library snapshot now and upload it to OneDrive',
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
  clientId: {
    label: 'Application ID (clientId)',
    description:
      'Used for the OneDrive app registration; leave blank to use the built-in default application ID',
    placeholder: 'Leave blank to use the built-in default',
    save: 'Save',
    savedToast: 'Application ID saved'
  },
  unsupported: 'OneDrive backup is not available in this environment',
  error: {
    not_configured: 'OneDrive application ID is not configured',
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
    remote_not_found: 'The cloud backup does not exist or has been deleted',
    backup_in_progress: 'A backup is already running; wait for it to finish and try again',
    unknown: 'An unknown error occurred; please try again later'
  }
} satisfies ZhCNResources['onedrive']

export default onedrive

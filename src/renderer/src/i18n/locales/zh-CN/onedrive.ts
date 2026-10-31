/**
 * OneDrive 备份命名空间（`onedrive`）：设置页「OneDrive 云备份」分区的全部文案。
 *
 * 约定：
 * - `error.*` 与主进程 `OneDriveErrorCode` 的 21 个值一一对应，渲染层经
 *   `onedriveSectionSupport.ts` 的 `ERROR_KEYS` 静态映射取用，**不展示**主进程英文
 *   `message`；新增 / 删除错误码时 `satisfies Record<OneDriveErrorCode, string>`
 *   会触发 typecheck 失败，须同步双端本文件。
 * - `OneDrive` 为品牌标识，保持原文。
 */
const onedrive = {
  section: {
    title: 'OneDrive 云备份',
    description: '将整库快照上传到 OneDrive，作为本地数据之外的异地副本'
  },
  account: {
    label: '账户状态',
    loading: '正在读取账户状态…',
    signedOut: '未登录',
    signedInAs: '已登录：{{name}}',
    unknownName: '未知账户',
    signIn: '登录 OneDrive',
    signingIn: '正在等待浏览器授权…',
    cancelSignIn: '取消登录',
    signOut: '退出登录',
    signedInToast: '已登录 OneDrive',
    encryptionUnavailable:
      '当前系统无法使用安全存储，登录与备份已停用。请检查系统钥匙串 / 凭据管理器设置后重启应用。'
  },
  signOut: {
    confirmTitle: '退出 OneDrive',
    confirmMessage: '退出后需要重新登录才能备份，本机保存的授权凭据将被清除。',
    confirmAction: '退出登录',
    successToast: '已退出 OneDrive'
  },
  backup: {
    label: '手动备份',
    description: '立即生成一份整库快照并上传到 OneDrive',
    action: '立即备份',
    cancel: '取消备份',
    phase: {
      snapshot: '正在生成快照…',
      upload: '正在上传… {{percent}}%',
      done: '备份完成'
    },
    bytes: '{{sent}} / {{total}}',
    progressLabel: '备份进度',
    successToast: '备份完成：{{fileName}}（{{size}}）'
  },
  notice: {
    signInCancelled: '已取消登录',
    backupCancelled: '已取消备份'
  },
  clientId: {
    label: '应用 ID（clientId）',
    description: '用于 OneDrive 应用注册；留空则使用内置默认应用 ID',
    placeholder: '留空使用内置默认值',
    save: '保存',
    savedToast: '应用 ID 已保存'
  },
  unsupported: '当前环境不支持 OneDrive 备份',
  error: {
    not_configured: '尚未配置 OneDrive 应用 ID',
    encryption_unavailable: '系统安全存储不可用，无法读取或保存授权凭据',
    credentials_corrupt: '本地授权凭据已损坏，请退出登录后重新登录',
    auth_cancelled: '已取消登录',
    auth_timeout: '登录等待超时，请重新尝试',
    auth_failed: '登录失败，请稍后重试',
    state_mismatch: '登录校验失败，请重新尝试',
    reauth_required: '授权已过期，请重新登录',
    port_bind_failed: '无法启动本地回调服务（端口被占用），请关闭冲突程序后重试',
    network: '网络连接失败，请检查网络后重试',
    timeout: '请求超时，请稍后重试',
    aborted: '操作已取消',
    unauthorized: '授权无效或已过期，请重新登录',
    forbidden: '没有访问权限，请确认 OneDrive 账户权限',
    not_found: '未找到目标文件或文件夹',
    rate_limited: '请求过于频繁，请稍后再试',
    upstream: 'OneDrive 服务暂时不可用，请稍后重试',
    upload_failed: '上传失败，请检查网络后重试',
    snapshot_failed: '生成本地快照失败，请检查磁盘空间后重试',
    backup_in_progress: '已有备份正在进行，请等待完成后再试',
    unknown: '发生未知错误，请稍后重试'
  }
}

export default onedrive

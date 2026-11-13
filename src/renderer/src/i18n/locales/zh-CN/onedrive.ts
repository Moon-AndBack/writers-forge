/**
 * OneDrive 备份命名空间（`onedrive`）：设置页「OneDrive 云备份」分区的全部文案。
 *
 * 约定：
 * - `error.*` 与主进程 `OneDriveErrorCode` 的 24 个值一一对应，渲染层经
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
      download: '正在下载… {{percent}}%',
      restore: '正在恢复数据库…',
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
  remote: {
    title: '云端备份',
    refresh: '刷新',
    loading: '正在读取云端备份列表…',
    empty: '还没有云端备份',
    restoreAria: '恢复云端备份「{{name}}」',
    confirm: {
      title: '从云端备份恢复',
      cover: '将用云端备份「{{name}}」覆盖当前全部数据。',
      safeCopy: '恢复前会自动创建一份本地安全副本（pre-restore），当前数据可回退。',
      restart: '恢复成功后应用会自动重启。',
      flush: '未保存的编辑会先尝试保存。',
      action: '覆盖并恢复'
    },
    phase: {
      download: '正在下载… {{percent}}%',
      restore: '正在恢复数据库… {{percent}}%'
    },
    progressLabel: '恢复进度',
    cancel: '取消恢复',
    restarting: '正在恢复并重启…',
    cancelled: '已取消恢复',
    failed: '恢复失败，当前数据未被替换，请稍后重试'
  },
  unsupported: '当前环境不支持 OneDrive 备份',
  error: {
    not_configured: '尚未登录 OneDrive',
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
    list_failed: '获取云端备份列表失败，请稍后重试',
    download_failed: '下载云端备份失败，请检查网络后重试',
    remote_not_found: '云端备份不存在或已被删除',
    backup_in_progress: '已有备份正在进行，请等待完成后再试',
    unknown: '发生未知错误，请稍后重试'
  }
}

export default onedrive

/**
 * 图片 Blob 内存缓存（编辑器图片 / 书籍封面共用）：**容量淘汰 + 显式失效**，无 TTL。
 *
 * - 双上限：条目数 `LRU_MAX_ENTRIES` 或总字节 `LRU_MAX_BYTES`，任一超出即淘汰最久未用项；
 *   单张超过总预算的图片不入缓存（否则会挤空全部条目且仍然超额）。
 * - 命中即移到队尾（Map 插入序即 LRU 序）。
 * - 缓存的是 **Blob** 而非 objectURL：每个使用方自行 `createObjectURL` / 卸载 `revoke`，
 *   同一张图多处挂载（含 StrictMode 双挂载）各持各的 URL，互不吊销。
 * - key 由调用方约定：`image:<imageId>` / `cover:<bookId>`。
 */
const LRU_MAX_ENTRIES = 32
const LRU_MAX_BYTES = 24 * 1024 * 1024

const blobCache = new Map<string, Blob>()
/** 当前缓存总字节数，与 `blobCache` 同步维护，避免每次淘汰时重新遍历求和。 */
let cachedBytes = 0

/** LRU 读取：命中即移至队尾；未命中返回 `null`。 */
export function getCachedImage(key: string): Blob | null {
  const blob = blobCache.get(key)
  if (!blob) return null
  blobCache.delete(key)
  blobCache.set(key, blob)
  return blob
}

/** 写入并淘汰最久未用项；同一 key 覆盖时先扣减旧尺寸。 */
export function setCachedImage(key: string, blob: Blob): void {
  const previous = blobCache.get(key)
  if (previous) {
    blobCache.delete(key)
    cachedBytes -= previous.size
  }
  if (blob.size > LRU_MAX_BYTES) return
  blobCache.set(key, blob)
  cachedBytes += blob.size
  while (blobCache.size > LRU_MAX_ENTRIES || cachedBytes > LRU_MAX_BYTES) {
    const oldestKey = blobCache.keys().next().value
    if (oldestKey === undefined) break
    const oldest = blobCache.get(oldestKey)
    blobCache.delete(oldestKey)
    cachedBytes -= oldest?.size ?? 0
  }
}

/** 失效单条（封面被写入 / 删除后调用）：下次读取重新走 IPC。 */
export function invalidateCachedImage(key: string): void {
  const blob = blobCache.get(key)
  if (!blob) return
  blobCache.delete(key)
  cachedBytes -= blob.size
}

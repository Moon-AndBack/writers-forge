/**
 * 类名合成：过滤假值后以空格连接。
 *
 * 仅做字符串拼接，不解析、不去重、不处理冲突类名；与原各处本地实现行为一致。
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

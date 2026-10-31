import type { HTMLAttributes, ReactNode } from 'react'
import '../../styles/components/surface.css'

export type AvatarTone = 'brand' | 'ok' | 'warn' | 'danger' | 'neutral'
export type AvatarSize = 'sm' | 'md' | 'lg'
export type AvatarShape = 'rounded' | 'circle'

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** 图片地址，提供后渲染 img，否则渲染 children（如姓名首字） */
  src?: string
  /** 图片替代文本 */
  alt?: string
  /** 尺寸，默认 sm（28px） */
  size?: AvatarSize
  /** 色调，默认 brand */
  tone?: AvatarTone
  /** 形状，默认 rounded */
  shape?: AvatarShape
  children?: ReactNode
}

export function Avatar({
  src,
  alt,
  size = 'sm',
  tone = 'brand',
  shape = 'rounded',
  className,
  children,
  ...rest
}: AvatarProps) {
  const classes = [
    'wf-avatar',
    `wf-avatar--${size}`,
    `wf-avatar--${tone}`,
    shape === 'circle' ? 'wf-avatar--circle' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} {...rest}>
      {src ? <img className="wf-avatar__img" src={src} alt={alt ?? ''} /> : children}
    </span>
  )
}

Avatar.displayName = 'Avatar'

export default Avatar

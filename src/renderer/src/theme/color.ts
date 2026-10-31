/**
 * 轻量颜色工具：十六进制解析 / 序列化、相对亮度与线性混色。
 * 不引入第三方库，纯函数、无副作用。
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/** 解析 `#rgb` / `#rrggbb` / `#rrggbbaa`（`#` 可省略）为 RGB；非法返回 null。 */
export function parseHexColor(input: unknown): Rgb | null {
  if (typeof input !== 'string') return null
  let hex = input.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null

  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  } else if (hex.length === 8) {
    // RRGGBBAA：丢弃 alpha
    hex = hex.slice(0, 6)
  } else if (hex.length !== 6) {
    return null
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  }
}

/** 把 RGB 序列化为小写 `#rrggbb`。 */
export function toHexColor(rgb: Rgb): string {
  const part = (v: number): string => clampChannel(v).toString(16).padStart(2, '0')
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`
}

/** 相对亮度（sRGB 线性化后加权和），范围 0–1，用于判断强调色深浅。 */
export function relativeLuminance(rgb: Rgb): number {
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** 按比例把颜色向目标色线性混合，`ratio` 取 0–1。 */
export function mixColor(from: Rgb, to: Rgb, ratio: number): Rgb {
  const t = Math.max(0, Math.min(1, ratio))
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t
  }
}

/**
 * 由系统强调色派生 `--brand-2`（渐变第二色），做法保持一致：
 * - 深色强调色（相对亮度 ≤ 0.5）：向白混合 32%，得到更亮相邻色；
 * - 亮色强调色：向黑混合 28%，避免渐变两端过近发灰。
 * 解析失败时原样返回。
 */
export function deriveBrand2(hex: string): string {
  const rgb = parseHexColor(hex)
  if (!rgb) return hex
  const bright = relativeLuminance(rgb) > 0.5
  const target: Rgb = bright ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 }
  return toHexColor(mixColor(rgb, target, bright ? 0.28 : 0.32))
}

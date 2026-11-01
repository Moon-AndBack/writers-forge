#!/usr/bin/env node
/**
 * 应用图标生成器（零依赖，纯 Node）。
 *
 * 背景：仓库内无 Pillow / ImageMagick / sharp 等栅格化工具，故本脚本自行完成
 * 「解析几何 → 超采样栅格化 → PNG / ICO 编码」，无需联网或安装依赖。
 *
 * 设计（「Classic Nib」方案）：
 * - 圆角方形底座（圆角 27%）+ 148° 线性渐变 #0078d4 → #005a9e；
 * - 居中白色「笔尖」字形：尖底笔尖轮廓 + 笔缝竖线 + 笔孔圆点，一律描边
 *   （fill:none / stroke:#fff / 圆头圆角），字形按品牌字形配置 brandGlyph.json 的 scale（当前 0.82）缩放居中
 *   —— 与标题栏 .tb-brand-mark 内的品牌字形一致；
 * - 字形几何与描边宽度唯一来源于 src/renderer/src/shell/brandGlyph.json
 *   （渲染层标题栏 BrandIcon 读取同一份），禁止在两侧各自写死数值。
 *
 * 产出：
 * - build/icon.svg（源文件，便于人工检视 / 二次编辑）
 * - build/icon.png（4096×4096，4K，供 Linux 打包与窗口图标）
 * - build/icon.ico（16/24/32/48/64/128/256，Windows 应用 / 窗口图标）
 *
 * 小尺寸（≤32px）描边按最小 1.3px 物理宽度补偿，避免 16px 下笔画湮没 / 笔缝与笔尖糊连。
 *
 * 用法：node scripts/generate-icon.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD_DIR = join(ROOT, 'build')

/** 品牌字形几何唯一真源（渲染层 `BrandIcon` 与图标生成共用同一份）。 */
const GLYPH = JSON.parse(readFileSync(join(ROOT, 'src/renderer/src/shell/brandGlyph.json'), 'utf8'))

// ---------------------------------------------------------------- 设计常量

/** 设计稿坐标系边长（与应用图标底座的 viewBox 一致）。 */
const VIEW = GLYPH.view
/** 底座圆角半径 / 边长（与应用图标底座对齐：圆角 27%）。 */
const CORNER_RATIO = 0.27
/** 渐变起止色。 */
const BG_FROM = [0x00, 0x78, 0xd4]
const BG_TO = [0x00, 0x5a, 0x9e]
/** 渐变角度（CSS 约定：0deg 朝上，顺时针；与应用图标底座对齐：148°）。 */
const BG_ANGLE_DEG = 148

/** 字形缩放（由 brandGlyph.json 的 scale: 0.82 驱动）与居中偏移。 */
const GLYPH_SCALE = GLYPH.scale
const GLYPH_OFFSET = (VIEW - VIEW * GLYPH_SCALE) / 2
/** 字形描边宽度（设计稿坐标）。 */
const GLYPH_STROKE = GLYPH.stroke
/** 小尺寸描边物理宽度下限（px）。 */
const MIN_STROKE_PX = 1.3

/** 笔尖轮廓：四段三次贝塞尔（闭合）。 */
const DROPLET_CUBICS = GLYPH.dropletCubics
/** 笔缝（竖线，圆头描边）。 */
const SLIT = GLYPH.slit
/** 笔孔（圆，描边）。 */
const DOT = GLYPH.dot
/** 每段贝塞尔的展平段数。 */
const BEZIER_STEPS = 24
/** 超采样倍率（抗锯齿）：常规尺寸用 4×。 */
const SS = 4
/**
 * 大尺寸超采样倍率：4096 输出若仍用 4× 会放大到 16384²（约 2.7 亿采样/掩码，单掩码 268MB），
 * 内存与耗时不可接受，故大尺寸降为 2×（8192²，单掩码约 67MB）。
 */
const SS_LARGE = 2
/** 启用大尺寸降采样的输出边长阈值。 */
const SS_LARGE_FROM = 2048

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
/** 4K PNG 输出边长（供 Linux 打包与窗口图标）。 */
const PNG_SIZE = 4096

/** SVG 路径字符串（与栅格化几何一致，取自同一共享源）。 */
const DROPLET_D = GLYPH.dropletD
const SLIT_D = GLYPH.slitD

/** 渐变方向单位向量（屏幕坐标，y 向下）与渐变线长度系数。 */
const ANGLE_RAD = (BG_ANGLE_DEG * Math.PI) / 180
const GRAD_DIR = [Math.sin(ANGLE_RAD), -Math.cos(ANGLE_RAD)]
const GRAD_LEN = Math.abs(GRAD_DIR[0]) + Math.abs(GRAD_DIR[1])
/** 归一化到 objectBoundingBox 的渐变端点。 */
const GRAD_XY = {
  x1: 0.5 - (GRAD_DIR[0] * GRAD_LEN) / 2,
  y1: 0.5 - (GRAD_DIR[1] * GRAD_LEN) / 2,
  x2: 0.5 + (GRAD_DIR[0] * GRAD_LEN) / 2,
  y2: 0.5 + (GRAD_DIR[1] * GRAD_LEN) / 2
}

// ---------------------------------------------------------------- SVG 源文件

/** RGB 三元组 → CSS hex，确保 SVG 渐变与栅格渐变同源（BG_FROM / BG_TO）。 */
const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`

function buildSvg() {
  const rx = (CORNER_RATIO * VIEW).toFixed(2)
  const { x1, y1, x2, y2 } = GRAD_XY
  const n = (v) => Number(v.toFixed(4))
  const offset = n(GLYPH_OFFSET)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="512" height="512" role="img" aria-label="Writer's Forge">
  <!-- Writer's Forge 应用图标源文件（由 scripts/generate-icon.mjs 生成，勿手工改动几何） -->
  <defs>
    <linearGradient id="wf-bg" gradientUnits="objectBoundingBox" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">
      <stop offset="0" stop-color="${toHex(BG_FROM)}" />
      <stop offset="1" stop-color="${toHex(BG_TO)}" />
    </linearGradient>
  </defs>
  <rect width="${VIEW}" height="${VIEW}" rx="${rx}" fill="url(#wf-bg)" />
  <g transform="translate(${offset} ${offset}) scale(${GLYPH_SCALE})" fill="none" stroke="#fff" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <path d="${DROPLET_D}" />
    <path d="${SLIT_D}" />
    <circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" />
  </g>
</svg>
`
}

// ---------------------------------------------------------------- 几何工具

/** 三次贝塞尔在参数 t 处的取值。 */
function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]
  ]
}

/** 设计稿坐标 → 超采样像素坐标。 */
function toPixel(p, scale) {
  return [(p[0] * GLYPH_SCALE + GLYPH_OFFSET) * scale, (p[1] * GLYPH_SCALE + GLYPH_OFFSET) * scale]
}

/** 笔尖轮廓展平为闭合折线（超采样像素坐标）。 */
function dropletPolyline(scale) {
  const pts = []
  for (const [p0, p1, p2, p3] of DROPLET_CUBICS) {
    for (let i = 0; i < BEZIER_STEPS; i++) {
      pts.push(toPixel(cubicAt(p0, p1, p2, p3, i / BEZIER_STEPS), scale))
    }
  }
  return pts
}

/** 点到线段距离的平方。 */
function distToSeg2(px, py, e) {
  const dx = e.x2 - e.x1
  const dy = e.y2 - e.y1
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - e.x1) * dx + (py - e.y1) * dy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = e.x1 + t * dx - px
  const cy = e.y1 + t * dy - py
  return cx * cx + cy * cy
}

/** 圆角方形命中判定。 */
function insideRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x > size || y > size) return false
  const cx = Math.min(Math.max(x, radius), size - radius)
  const cy = Math.min(Math.max(y, radius), size - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

/** 渐变取色（t 由 148° 渐变线投影决定，越界截断）。 */
function gradientAt(x, y, size) {
  const t0 = 0.5 + ((x - size / 2) * GRAD_DIR[0] + (y - size / 2) * GRAD_DIR[1]) / (GRAD_LEN * size)
  const t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0
  return [
    BG_FROM[0] + (BG_TO[0] - BG_FROM[0]) * t,
    BG_FROM[1] + (BG_TO[1] - BG_FROM[1]) * t,
    BG_FROM[2] + (BG_TO[2] - BG_FROM[2]) * t
  ]
}

// ---------------------------------------------------------------- 描边栅格化

/** 折线描边（闭合）→ 命中掩码。 */
function strokePolylineMask(points, width, half) {
  const mask = new Uint8Array(width * width)
  const edges = []
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    edges.push({ x1, y1, x2, y2, ymin: Math.min(y1, y2), ymax: Math.max(y1, y2) })
  }
  for (let j = 0; j < width; j++) {
    const yc = j + 0.5
    const near = edges.filter((e) => yc >= e.ymin - half && yc <= e.ymax + half)
    if (near.length === 0) continue
    let xmin = Infinity
    let xmax = -Infinity
    for (const e of near) {
      if (e.x1 < xmin) xmin = e.x1
      if (e.x2 < xmin) xmin = e.x2
      if (e.x1 > xmax) xmax = e.x1
      if (e.x2 > xmax) xmax = e.x2
    }
    const from = Math.max(0, Math.floor(xmin - half - 0.5))
    const to = Math.min(width - 1, Math.ceil(xmax + half - 0.5))
    const rowBase = j * width
    for (let x = from; x <= to; x++) {
      const xc = x + 0.5
      for (const e of near) {
        if (distToSeg2(xc, yc, e) <= half * half) {
          mask[rowBase + x] = 1
          break
        }
      }
    }
  }
  return mask
}

/** 线段描边（圆头）→ 命中掩码。 */
function strokeSegmentMask(seg, width, half) {
  const mask = new Uint8Array(width * width)
  const xmin = Math.min(seg.x1, seg.x2) - half
  const xmax = Math.max(seg.x1, seg.x2) + half
  const ymin = Math.min(seg.y1, seg.y2) - half
  const ymax = Math.max(seg.y1, seg.y2) + half
  for (let j = Math.max(0, Math.floor(ymin)); j < Math.min(width, Math.ceil(ymax)); j++) {
    const yc = j + 0.5
    for (let x = Math.max(0, Math.floor(xmin)); x < Math.min(width, Math.ceil(xmax)); x++) {
      if (distToSeg2(x + 0.5, yc, seg) <= half * half) mask[j * width + x] = 1
    }
  }
  return mask
}

/** 圆环描边 → 命中掩码。 */
function strokeCircleMask(circle, width, half) {
  const mask = new Uint8Array(width * width)
  const outer = circle.r + half
  for (
    let j = Math.max(0, Math.floor(circle.cy - outer));
    j < Math.min(width, Math.ceil(circle.cy + outer));
    j++
  ) {
    const dy = j + 0.5 - circle.cy
    for (
      let x = Math.max(0, Math.floor(circle.cx - outer));
      x < Math.min(width, Math.ceil(circle.cx + outer));
      x++
    ) {
      const dx = x + 0.5 - circle.cx
      if (Math.abs(Math.hypot(dx, dy) - circle.r) <= half) mask[j * width + x] = 1
    }
  }
  return mask
}

// ---------------------------------------------------------------- 渲染

/**
 * 渲染指定边长（像素）的 RGBA 位图：超采样后盒式降采样，得到平滑边缘。
 * @returns {{width:number,height:number,data:Uint8ClampedArray}}
 */
function render(size) {
  const ss = size >= SS_LARGE_FROM ? SS_LARGE : SS
  const w = size * ss
  const scale = w / VIEW
  // 小尺寸补偿：描边物理宽度不低于 MIN_STROKE_PX。
  const strokeWidth = Math.max(GLYPH_STROKE * GLYPH_SCALE, (MIN_STROKE_PX * VIEW) / size)
  const half = (strokeWidth * scale) / 2

  const droplet = strokePolylineMask(dropletPolyline(scale), w, half)
  const slit = strokeSegmentMask(
    {
      x1: (SLIT.x * GLYPH_SCALE + GLYPH_OFFSET) * scale,
      y1: (SLIT.y1 * GLYPH_SCALE + GLYPH_OFFSET) * scale,
      x2: (SLIT.x * GLYPH_SCALE + GLYPH_OFFSET) * scale,
      y2: (SLIT.y2 * GLYPH_SCALE + GLYPH_OFFSET) * scale
    },
    w,
    half
  )
  const dot = strokeCircleMask(
    {
      cx: (DOT.cx * GLYPH_SCALE + GLYPH_OFFSET) * scale,
      cy: (DOT.cy * GLYPH_SCALE + GLYPH_OFFSET) * scale,
      r: DOT.r * GLYPH_SCALE * scale
    },
    w,
    half
  )

  const radius = CORNER_RATIO * w
  const samples = ss * ss
  // 累加缓冲用 Float32：累加上限 = samples×255（≤4080），远低于 Float32 可精确表示的整数上限 2²⁴；
  // 4096² 下每个缓冲 Float32 约 67MB（Float64 约 134MB），四缓冲合计省约 268MB。
  const accR = new Float32Array(size * size)
  const accG = new Float32Array(size * size)
  const accB = new Float32Array(size * size)
  const accA = new Float32Array(size * size)

  for (let j = 0; j < w; j++) {
    const py = j + 0.5
    const outRow = ((j / ss) | 0) * size
    const sampleRow = j * w
    for (let i = 0; i < w; i++) {
      const px = i + 0.5
      if (!insideRoundedRect(px, py, w, radius)) continue

      const k = sampleRow + i
      const [r, g, b] =
        droplet[k] === 1 || slit[k] === 1 || dot[k] === 1 ? [255, 255, 255] : gradientAt(px, py, w)

      const o = outRow + ((i / ss) | 0)
      accR[o] += r
      accG[o] += g
      accB[o] += b
      accA[o] += 1
    }
  }

  const data = new Uint8ClampedArray(size * size * 4)
  for (let p = 0; p < size * size; p++) {
    const a = accA[p]
    if (a === 0) continue
    const o = p * 4
    data[o] = Math.round(accR[p] / a)
    data[o + 1] = Math.round(accG[p] / a)
    data[o + 2] = Math.round(accB[p] / a)
    data[o + 3] = Math.round((a / samples) * 255)
  }
  return { width: size, height: size, data }
}

// ---------------------------------------------------------------- PNG 编码

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** 8bit RGBA → PNG。 */
function encodePng({ width, height, data }) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: None
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// ---------------------------------------------------------------- ICO 编码

/** RGBA 位图 → 32bit BMP（DIB）条目：BITMAPINFOHEADER + 自下而上 BGRA + AND 掩码。 */
function encodeDib({ width, height, data }) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(width, 4)
  header.writeInt32LE(height * 2, 8) // XOR + AND 两段高度
  header.writeUInt16LE(1, 12) // planes
  header.writeUInt16LE(32, 14) // bpp
  header.writeUInt32LE(0, 16) // BI_RGB

  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4
    for (let x = 0; x < width; x++) {
      const s = src + x * 4
      const d = (y * width + x) * 4
      pixels[d] = data[s + 2] // B
      pixels[d + 1] = data[s + 1] // G
      pixels[d + 2] = data[s] // R
      pixels[d + 3] = data[s + 3] // A
    }
  }

  const maskStride = Math.ceil(width / 32) * 4
  const mask = Buffer.alloc(maskStride * height) // 32bit 图标由 alpha 决定透明，掩码留空
  return Buffer.concat([header, pixels, mask])
}

/** 多尺寸 DIB 条目 → .ico 容器。 */
function encodeIco(images) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2)
  dir.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = []
  for (const img of images) {
    const dib = encodeDib(img)
    const entry = Buffer.alloc(16)
    entry[0] = img.width >= 256 ? 0 : img.width
    entry[1] = img.height >= 256 ? 0 : img.height
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(dib.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push({ entry, dib })
    offset += dib.length
  }
  return Buffer.concat([dir, ...entries.map((e) => e.entry), ...entries.map((e) => e.dib)])
}

// ---------------------------------------------------------------- 入口

function main() {
  mkdirSync(BUILD_DIR, { recursive: true })

  const svg = buildSvg()
  writeFileSync(join(BUILD_DIR, 'icon.svg'), svg, 'utf8')

  const png = encodePng(render(PNG_SIZE))
  writeFileSync(join(BUILD_DIR, 'icon.png'), png)

  const ico = encodeIco(ICO_SIZES.map((size) => render(size)))
  writeFileSync(join(BUILD_DIR, 'icon.ico'), ico)

  console.log(`icon.svg  ${svg.length} B`)
  console.log(`icon.png  ${png.length} B (${PNG_SIZE}x${PNG_SIZE})`)
  console.log(`icon.ico  ${ico.length} B (${ICO_SIZES.join('/')})`)
}

main()

/**
 * 品牌图标（标题栏 `.tb-brand-mark` 使用）：尖底笔尖造型。
 *
 * 几何 / 描边宽度唯一来源于 `./brandGlyph.json`（`scripts/generate-icon.mjs`
 * 读取同一文件生成 build/icon.svg|png|ico），即「Classic Nib」方案：
 * 尖底笔尖轮廓 + 笔缝竖线 + 笔孔圆点，一律白色描边
 * （fill:none / stroke:#fff / 圆头圆角），与生成的应用图标同形。
 * 字形按 `glyph.scale` 内缩居中（同 build/icon.svg 的
 * `translate(4.32 4.32) scale(0.82)`）；底座圆角与渐变见 `.tb-brand-mark`
 * （应用图标固定渐变 #0078d4 → #005a9e）；改几何请改 JSON，勿在此写死。
 */
import glyph from './brandGlyph.json'

/** 字形缩放与居中偏移（与 scripts/generate-icon.mjs 的 GLYPH_SCALE / GLYPH_OFFSET 同式，
 *  偏移保留 4 位小数，与 build/icon.svg 的 translate 值逐字对齐）。 */
const SCALE = glyph.scale
const OFFSET = Number(((glyph.view - glyph.view * SCALE) / 2).toFixed(4))
/** 缩放组内的描边宽度：生成器在「未缩放的外层坐标」下使用 glyph.stroke
 *  （24px 时经最小 1.3px 物理宽度补偿后为 2.6），故需除以 SCALE 抵消组缩放，
 *  保证 24px 下描边物理宽度与 ICO 24px 条目一致（1.3px）。 */
const STROKE = Number((glyph.stroke / SCALE).toFixed(4))

export function BrandIcon() {
  return (
    <svg viewBox={`0 0 ${glyph.view} ${glyph.view}`} aria-hidden="true">
      <g
        transform={`translate(${OFFSET} ${OFFSET}) scale(${SCALE})`}
        fill="none"
        stroke="#fff"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={glyph.dropletD} />
        <path d={glyph.slitD} />
        <circle cx={glyph.dot.cx} cy={glyph.dot.cy} r={glyph.dot.r} />
      </g>
    </svg>
  )
}

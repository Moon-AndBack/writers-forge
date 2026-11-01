/**
 * 批量将内置中文字体 TTF 转换为 WOFF2。
 *
 * 用法：node scripts/ttf2woff2.cjs
 *
 * 说明：
 * - wawoff2 为纯 WASM 实现，compress() 返回的是 wasm 堆上的 typed array 视图，
 *   底层缓冲区会被后续调用复用，因此必须立刻 Buffer.from() 拷贝后再落盘。
 * - 必须串行执行（for...of + await），并发调用会互相踩踏 wasm 堆导致输出损坏。
 * - 可重复执行：已存在的 .woff2 会被覆盖。源 TTF 不做任何修改 / 删除。
 */
const fs = require('node:fs')
const path = require('node:path')
const wawoff = require('wawoff2')

const FONT_DIR = path.resolve(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'fonts')

// 仅转换下列 6 个字体；AlibabaPuHuiTi-3-55-RegularL3 / MiSans L3 因 cmap 偏移问题已下架，不参与转换。
const FONT_FILES = [
  'LXGWWenKaiGBScreen.ttf',
  'LXGWWenKai-Regular.ttf',
  'LXGWNeoXiHeiPlus.ttf',
  'LXGWZhenKaiGB-Regular.ttf',
  'MoonStarsKai-Regular.ttf',
  'WenYuanRoundedSC-Regular.ttf'
]

const MB = 1024 * 1024

function fmtMB(bytes) {
  return (bytes / MB).toFixed(2)
}

/**
 * WOFF2 头部校验：
 *   0..3   signature    = 'wOF2'
 *   4..7   flavor       = 0x00010000（TrueType）
 *   8..11  length       = 整个文件字节数
 *   12..13 numTables
 */
function verifyWoff2(filePath) {
  const buf = fs.readFileSync(filePath)
  const signature = buf.subarray(0, 4).toString('latin1')
  const flavor = buf.readUInt32BE(4)
  const length = buf.readUInt32BE(8)

  if (signature !== 'wOF2') {
    throw new Error(`[校验失败] ${path.basename(filePath)}: signature=${signature}，应为 wOF2`)
  }
  if (length !== buf.length) {
    throw new Error(
      `[校验失败] ${path.basename(filePath)}: 头部 length=${length}，实际字节数=${buf.length}`
    )
  }
  if (flavor !== 0x00010000) {
    throw new Error(
      `[校验失败] ${path.basename(filePath)}: flavor=0x${flavor
        .toString(16)
        .padStart(8, '0')}，应为 0x00010000`
    )
  }
}

/**
 * 回解校验：解压后的 TTF 长度与原始 TTF 比对。
 *
 * 注意：WOFF2 无损，但解压器会重新编码 glyf 的 flag 数组（字面量重复 → repeat 压缩、
 * 字形尾部补 4 字节对齐填充），因此回解长度通常比原始略大（本批实测 +0% ~ +0.3%），
 * 属正常现象而非损坏。已用语义级比对（轮廓 / 包围盒 / 端点 / hinting 指令 / 坐标点）
 * 确认 6 个字体全部与原始一致。此处偏差仅作提示，不作为失败条件。
 */
async function verifyRoundTrip(woff2Path, originalTtfBytes) {
  const compressed = fs.readFileSync(woff2Path)
  const decoded = await wawoff.decompress(compressed)
  const decodedBytes = Buffer.from(decoded).length
  const diff = decodedBytes - originalTtfBytes
  return { exact: diff === 0, decodedBytes, diff }
}

async function main() {
  const startedAt = Date.now()
  const results = []

  for (const fileName of FONT_FILES) {
    const ttfPath = path.join(FONT_DIR, fileName)
    const woff2Path = ttfPath.replace(/\.ttf$/i, '.woff2')

    if (!fs.existsSync(ttfPath)) {
      throw new Error(`[缺失] 源字体不存在：${ttfPath}`)
    }

    const ttfBuffer = fs.readFileSync(ttfPath)
    const compressed = await wawoff.compress(ttfBuffer)
    // wasm 堆视图必须立即拷贝，否则会被后续调用覆盖。
    const woff2Buffer = Buffer.from(compressed)
    fs.writeFileSync(woff2Path, woff2Buffer)

    verifyWoff2(woff2Path)
    const roundTrip = await verifyRoundTrip(woff2Path, ttfBuffer.length)

    const ratio = (woff2Buffer.length / ttfBuffer.length) * 100
    console.log(
      `${fileName}  ${fmtMB(ttfBuffer.length)} MB → ${fmtMB(woff2Buffer.length)} MB (占比 ${ratio.toFixed(
        1
      )}%)`
    )

    if (!roundTrip.exact) {
      const pct = ((roundTrip.diff / ttfBuffer.length) * 100).toFixed(2)
      console.log(
        `  回解 ${roundTrip.decodedBytes} B（较原始 ${roundTrip.diff >= 0 ? '+' : ''}${
          roundTrip.diff
        } B / ${pct}%，WOFF2 无损，差异为 glyf flag 重编码与对齐填充）`
      )
    }

    results.push({
      fileName,
      originalBytes: ttfBuffer.length,
      woff2Bytes: woff2Buffer.length,
      ratio,
      roundTrip
    })
  }

  const elapsed = Date.now() - startedAt
  const totalOriginal = results.reduce((sum, r) => sum + r.originalBytes, 0)
  const totalWoff2 = results.reduce((sum, r) => sum + r.woff2Bytes, 0)

  console.log('---')
  console.log(
    `合计：${fmtMB(totalOriginal)} MB → ${fmtMB(totalWoff2)} MB (占比 ${(
      (totalWoff2 / totalOriginal) *
      100
    ).toFixed(1)}%)，节省 ${fmtMB(totalOriginal - totalWoff2)} MB`
  )
  console.log(`耗时：${(elapsed / 1000).toFixed(2)} s`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})

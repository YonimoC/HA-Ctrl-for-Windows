// Generates the tray and app icons (PNG, no image dependencies).
// Usage: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources')
mkdirSync(outDir, { recursive: true })

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // color type RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// --- shapes in unit space (0..1, y down) -------------------------------------

function inRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false
  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius || (x >= left + radius && x <= right - radius) || (y >= top + radius && y <= bottom - radius)
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function inHouse(x, y) {
  // roof
  const roof = inTriangle(x, y, 0.5, 0.15, 0.13, 0.47, 0.87, 0.47)
  // body
  const body = inRoundedRect(x, y, 0.22, 0.44, 0.78, 0.85, 0.05)
  if (!roof && !body) return false
  // door cut-out
  const door = inRoundedRect(x, y, 0.43, 0.6, 0.57, 0.85, 0.035)
  return !door
}

function inChimney(x, y) {
  return x >= 0.66 && x <= 0.75 && y >= 0.24 && y <= 0.43
}

// --- rendering ---------------------------------------------------------------

const SAMPLES = 4

function render(size, options) {
  const { padding = 0, radius = 0.24, gradient = true, house = true } = options
  const rgba = Buffer.alloc(size * size * 4)
  const inner = 1 - padding * 2

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let coverage = 0
      let houseCoverage = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size
          const y = (py + (sy + 0.5) / SAMPLES) / size
          if (!inRoundedRect(x, y, padding, padding, 1 - padding, 1 - padding, radius * inner)) continue
          coverage += 1
          const ux = (x - padding) / inner
          const uy = (y - padding) / inner
          if (house && (inHouse(ux, uy) || inChimney(ux, uy))) houseCoverage += 1
        }
      }

      const total = SAMPLES * SAMPLES
      const alpha = coverage / total
      const idx = (py * size + px) * 4
      if (alpha === 0) continue

      const gx = px / size
      const gy = py / size
      let r
      let g
      let b
      if (gradient) {
        r = Math.round(74 + (10 - 74) * gx * 0.55 + (10 - 74) * gy * 0.45)
        g = Math.round(158 + (108 - 158) * gx * 0.55 + (108 - 158) * gy * 0.45)
        b = Math.round(255 + (255 - 255) * gx)
        r = Math.round(64 - 44 * gy)
        g = Math.round(150 - 70 * gy)
        b = 255
      } else {
        r = 255
        g = 255
        b = 255
      }

      const h = houseCoverage / total
      if (h > 0) {
        r = Math.round(r * (1 - h) + 255 * h)
        g = Math.round(g * (1 - h) + 255 * h)
        b = Math.round(b * (1 - h) + 255 * h)
      }

      rgba[idx] = r
      rgba[idx + 1] = g
      rgba[idx + 2] = b
      rgba[idx + 3] = Math.round(alpha * 255)
    }
  }

  return encodePng(size, size, rgba)
}

const tray = render(32, { padding: 0, radius: 0.2 })
const trayLarge = render(64, { padding: 0, radius: 0.2 })
const appIcon = render(256, { padding: 0.02, radius: 0.22 })

writeFileSync(join(outDir, 'tray.png'), tray)
writeFileSync(join(outDir, 'tray@2x.png'), trayLarge)
writeFileSync(join(outDir, 'icon.png'), appIcon)

console.log('wrote resources/tray.png, resources/tray@2x.png, resources/icon.png')

/* 视频资源加载 + 金色光晕 sprite 预渲染 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..')
export const ASSETS_DIR = path.join(PLUGIN_ROOT, 'assets')

/* 注册中文字体（Yunzai 部署环境若无 msyh.ttc 会自动 fallback） */
let fontReady = false
export function ensureFonts() {
  if (fontReady) return
  fontReady = true
  const candidates = [
    'C:\\Windows\\Fonts\\msyh.ttc',
    'C:\\Windows\\Fonts\\msyhbd.ttc',
    '/System/Library/Fonts/PingFang.ttc',
    '/usr/share/fonts/opentype/source-han-sans/SourceHanSansCN-Regular.otf',
  ]
  for (const p of candidates) {
    try { GlobalFonts.registerFromPath(p, 'YaHei') } catch {}
  }
}

export const BG_LIST = [
  'ancient_0', 'anubis_0', 'baggage_0', 'dust2_0', 'inferno_0',
  'mission_0', 'nuke_0', 'office_0', 'overpass_0', 'warehouse_0',
]

export function pickGoldImage(caseObj, assets) {
  const n = (caseObj && caseObj.name) || ''
  if (n.includes('画廊')) return assets.gold2
  if (n.includes('狂牙')) return assets.gold1
  return assets.gold
}

async function safeLoad(p) {
  try { return await loadImage(p) } catch { return null }
}

export async function loadAssets(caseObj, drop, stripItems, introItems) {
  const bgName = BG_LIST[Math.floor(Math.random() * BG_LIST.length)]
  const [bg, itemBg, gold, gold1, gold2, dropImg, caseImg] = await Promise.all([
    safeLoad(path.join(ASSETS_DIR, 'bg', `${bgName}.jpg`)),
    safeLoad(path.join(ASSETS_DIR, 'img', 'item_bg.png')),
    safeLoad(path.join(ASSETS_DIR, 'img', 'gold.jpg')),
    safeLoad(path.join(ASSETS_DIR, 'img', 'gold1.jpg')),
    safeLoad(path.join(ASSETS_DIR, 'img', 'gold2.jpg')),
    drop?.image ? safeLoad(drop.image) : Promise.resolve(null),
    caseObj?.image ? safeLoad(caseObj.image) : Promise.resolve(null),
  ])
  const stripImgs = await Promise.all(stripItems.map(it => it.image ? safeLoad(it.image) : null))
  const introImgs = await Promise.all(introItems.map(it => it.image ? safeLoad(it.image) : null))
  return { bg, itemBg, gold, gold1, gold2, dropImg, caseImg, stripImgs, introImgs, bgName }
}

/* 金色光晕（conic gradient + 径向 mask）预渲染为 1024x1024 sprite */
export function buildGoldHaloSprite() {
  const size = 1024
  const c = createCanvas(size, size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const cx = size / 2, cy = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      const r = Math.sqrt(dx*dx + dy*dy)
      const rn = r / (size / 2)
      let ang = Math.atan2(dy, dx) * 180 / Math.PI
      if (ang < 0) ang += 360
      function lerpAlpha(stops) {
        for (let i = 0; i < stops.length - 1; i++) {
          const [a1, v1] = stops[i], [a2, v2] = stops[i + 1]
          if (ang >= a1 && ang <= a2) {
            const t = (ang - a1) / (a2 - a1 || 1)
            return v1 * (1 - t) + v2 * t
          }
        }
        return 0
      }
      const a = lerpAlpha([
        [0, 0], [40, 0.5], [80, 0], [160, 0.32], [200, 0], [280, 0.4], [320, 0], [360, 0],
      ])
      let mask
      if (rn <= 0.28) mask = 0
      else if (rn <= 0.55) mask = (rn - 0.28) / (0.55 - 0.28) * 0.7
      else if (rn <= 0.82) mask = 0.7 + (rn - 0.55) / (0.82 - 0.55) * 0.3
      else mask = 1
      const alpha = a * (1 - mask)
      const idx = (y * size + x) * 4
      img.data[idx]     = 255
      img.data[idx + 1] = 215
      img.data[idx + 2] = 0
      img.data[idx + 3] = Math.round(alpha * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/* 开箱视频生成入口
 *
 *   await renderOpenVideo(drop, caseObj, outPath, { fps, introMs, revealMs, noAudio })
 *
 *   drop:    rollDrop() 的产物（含 image 绝对路径）
 *   caseObj: data.js 的箱子对象（含 image 绝对路径、presentTiers、skinsByNum 等）
 *   outPath: mp4 输出绝对路径
 */

import { createCanvas } from '@napi-rs/canvas'
import { rollRarityNumForCase } from '../rarity.js'
import Config from '../config.js'
import { EASE_SPIN } from './easing.js'
import { ensureFonts, loadAssets, buildGoldHaloSprite } from './assets.js'
import { drawBackground, drawStrip, drawLetterboxAndPointer, drawIntro, drawReveal } from './scenes.js'
import { encodeMP4 } from './encode.js'

const TOTAL_ITEMS  = 30
const WINNER_INDEX = 26

function buildLayout(W, H, INTRO_MS, REVEAL_MS) {
  const TRANSITION_MS    = 350
  const SPIN_DURATION_MS = 6000
  const SPIN_START_MS    = INTRO_MS + TRANSITION_MS
  const REVEAL_START_MS  = SPIN_START_MS + SPIN_DURATION_MS + 50
  const TOTAL_MS         = REVEAL_START_MS + REVEAL_MS

  const SPIN_ITEM_H      = 294
  const SPIN_ITEM_W      = Math.round(SPIN_ITEM_H / 0.733)  // 401
  const SPIN_ITEM_MARGIN = 38
  const STRIDE           = SPIN_ITEM_W + SPIN_ITEM_MARGIN
  const STRIP_Y          = Math.round(H / 2 - SPIN_ITEM_H / 2)
  const LETTERBOX_H      = Math.round(H * 0.22)
  const POINTER_X        = Math.round(W / 2)
  const VIEW_PAD_X       = 23
  const DROP_ITEM_W      = 192
  const DROP_ITEM_H      = Math.round(DROP_ITEM_W * 0.74)
  const DROP_GRID_COLS   = Math.max(1, Math.floor((W - VIEW_PAD_X*2 + 12) / (DROP_ITEM_W + 12)))
  const DROP_CELL_W      = Math.floor((W - VIEW_PAD_X*2 - (DROP_GRID_COLS-1)*12) / DROP_GRID_COLS)

  return {
    W, H, INTRO_MS, TRANSITION_MS, SPIN_DURATION_MS, SPIN_START_MS, REVEAL_START_MS, REVEAL_MS, TOTAL_MS,
    SPIN_ITEM_W, SPIN_ITEM_H, SPIN_ITEM_MARGIN, STRIDE, STRIP_Y,
    LETTERBOX_H, POINTER_X, TOTAL_ITEMS, WINNER_INDEX,
    VIEW_PAD_X, DROP_ITEM_W, DROP_ITEM_H, DROP_GRID_COLS, DROP_CELL_W,
  }
}

function buildIntroItems(caseObj) {
  const items = []
  for (let n = 1; n <= 6; n++) {
    for (const s of (caseObj.skinsByNum[n] || [])) items.push({ ...s, rarityNum: n, isGoldSummary: false })
  }
  const rareCount = (caseObj.skinsByNum[7] || []).length
  if (rareCount > 0 && caseObj.hasRare) {
    items.push({
      name: '★ 罕见特殊物品', weapon: '★ 罕见特殊物品',
      paint: `${rareCount} 种刀/手套`,
      rarityNum: 7, image: null, isGoldSummary: true,
    })
  }
  return items
}

function buildStripItems(caseObj, drop) {
  const items = []
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    if (i === WINNER_INDEX) {
      items.push({ ...drop, isWinner: true })
    } else {
      const num = rollRarityNumForCase(caseObj, null, true)
      let pool = caseObj.skinsByNum[num]
      if (!pool || !pool.length) {
        for (let j = num - 1; j >= 1; j--) if (caseObj.skinsByNum[j]?.length) { pool = caseObj.skinsByNum[j]; break }
      }
      if (!pool || !pool.length) for (let j = num + 1; j <= 6; j++) if (caseObj.skinsByNum[j]?.length) { pool = caseObj.skinsByNum[j]; break }
      const s = pool[Math.floor(Math.random() * pool.length)]
      items.push({ ...s, rarityNum: num })
    }
  }
  // 中奖位金色显示金球占位（神秘感）
  if (drop.rarityNum === 7) items[WINNER_INDEX] = { ...drop, rarityNum: 7, image: null }
  return items
}

export async function renderOpenVideo(drop, caseObj, outPath, opts = {}) {
  ensureFonts()
  const cfg = Config.get().video || {}
  const fps     = opts.fps      ?? cfg.fps      ?? 60
  const W       = opts.width    ?? cfg.width    ?? 1280
  const H       = opts.height   ?? cfg.height   ?? 720
  const INTRO_MS  = opts.introMs  ?? cfg.introMs  ?? 2000
  const REVEAL_MS = opts.revealMs ?? cfg.revealMs ?? 5500

  const layout = buildLayout(W, H, INTRO_MS, REVEAL_MS)
  const TOTAL_FRAMES = Math.round(layout.TOTAL_MS / 1000 * fps)

  const stripItems = buildStripItems(caseObj, drop)
  const introItems = buildIntroItems(caseObj)
  const assets = await loadAssets(caseObj, drop, stripItems, introItems)
  const goldSprite = buildGoldHaloSprite()
  const jitter = (Math.random() - 0.5) * (layout.SPIN_ITEM_W * 0.65)
  const state = { caseObj, drop, stripItems, introItems, assets, goldSprite, jitter }

  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  function renderFrame(tMs) {
    drawBackground(ctx, assets.bg, W, H)
    if (tMs < layout.INTRO_MS) {
      drawIntro(ctx, layout, tMs, state)
    } else if (tMs < layout.SPIN_START_MS) {
      drawIntro(ctx, layout, tMs, state)
      drawLetterboxAndPointer(ctx, layout, tMs - layout.INTRO_MS)
    } else if (tMs < layout.REVEAL_START_MS) {
      const spinT = Math.min(1, (tMs - layout.SPIN_START_MS) / layout.SPIN_DURATION_MS)
      const eased = EASE_SPIN(spinT)
      const viewportCenter = W / 2
      const winnerCenter = WINNER_INDEX * layout.STRIDE + layout.SPIN_ITEM_W / 2
      const endX = -(winnerCenter - viewportCenter + jitter)
      const currentX = 2000 + (endX - 2000) * eased
      drawStrip(ctx, layout, currentX, stripItems, assets, caseObj)
      drawLetterboxAndPointer(ctx, layout, 600)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, layout.LETTERBOX_H)
      ctx.fillRect(0, H - layout.LETTERBOX_H, W, layout.LETTERBOX_H)
      drawReveal(ctx, layout, tMs - layout.REVEAL_START_MS, drop, assets, caseObj, goldSprite)
    }
  }

  async function* frameSource() {
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const tMs = (f / fps) * 1000
      renderFrame(tMs)
      const rgba = ctx.getImageData(0, 0, W, H).data
      yield Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength)
    }
  }

  await encodeMP4({
    width: W, height: H, fps,
    totalMs: layout.TOTAL_MS,
    introMs: layout.INTRO_MS,
    transitionMs: layout.TRANSITION_MS,
    spinDurMs: layout.SPIN_DURATION_MS,
    drop,
    outPath,
    frameSource: frameSource(),
    noAudio: !!opts.noAudio,
  })

  return outPath
}

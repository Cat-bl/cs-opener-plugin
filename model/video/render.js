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

/* 金色光晕是纯函数确定输出（无参数），永久缓存避免每次开箱重新生成 1024×1024 ImageData（~4MB + ~200ms） */
let _goldSprite = null
function getGoldSprite() {
  if (!_goldSprite) _goldSprite = buildGoldHaloSprite()
  return _goldSprite
}
import { drawBackground, drawStrip, drawLetterboxAndPointer, drawIntro, drawReveal, drawWatermark } from './scenes.js'
import { encodeMP4 } from './encode.js'

const TOTAL_ITEMS  = 30
const WINNER_INDEX = 26

function buildLayout(W, H, REVEAL_MS, introItemCount, baseIntroMs = 2000) {
  const TRANSITION_MS    = 350
  const SPIN_DURATION_MS = 6000

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
  const DROP_CELL_IMG_H  = Math.round(DROP_CELL_W * 0.5)
  const DROP_CELL_H      = DROP_CELL_IMG_H + 30
  const DROP_CELL_GAP    = 8
  const GRID_START_Y     = 274
  const GRID_BOTTOM_PAD  = 8

  // 算 intro grid 滚动距离
  const totalRows  = Math.ceil(Math.max(0, introItemCount) / DROP_GRID_COLS)
  const contentH   = totalRows > 0 ? totalRows * (DROP_CELL_H + DROP_CELL_GAP) - DROP_CELL_GAP : 0
  const visibleH   = H - GRID_START_Y - GRID_BOTTOM_PAD
  const INTRO_SCROLL = Math.max(0, contentH - visibleH)

  // 需要滚动时拉长 intro：停留 1s + 滚动 2s + 停留 1s
  const INTRO_STAY_BEFORE = 1000
  const INTRO_SCROLL_DUR  = 2000
  const INTRO_STAY_AFTER  = 1000
  const INTRO_MS = INTRO_SCROLL > 0
    ? INTRO_STAY_BEFORE + INTRO_SCROLL_DUR + INTRO_STAY_AFTER
    : baseIntroMs

  const SPIN_START_MS    = INTRO_MS + TRANSITION_MS
  const REVEAL_START_MS  = SPIN_START_MS + SPIN_DURATION_MS + 50
  const TOTAL_MS         = REVEAL_START_MS + REVEAL_MS

  return {
    W, H, INTRO_MS, TRANSITION_MS, SPIN_DURATION_MS, SPIN_START_MS, REVEAL_START_MS, REVEAL_MS, TOTAL_MS,
    INTRO_STAY_BEFORE, INTRO_SCROLL_DUR, INTRO_STAY_AFTER, INTRO_SCROLL,
    SPIN_ITEM_W, SPIN_ITEM_H, SPIN_ITEM_MARGIN, STRIDE, STRIP_Y,
    LETTERBOX_H, POINTER_X, TOTAL_ITEMS, WINNER_INDEX,
    VIEW_PAD_X, DROP_ITEM_W, DROP_ITEM_H, DROP_GRID_COLS, DROP_CELL_W,
    DROP_CELL_IMG_H, DROP_CELL_H, DROP_CELL_GAP, GRID_START_Y, GRID_BOTTOM_PAD,
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
  const baseIntroMs = opts.introMs  ?? cfg.introMs  ?? 2000
  const REVEAL_MS   = opts.revealMs ?? cfg.revealMs ?? 5500

  const stripItems = buildStripItems(caseObj, drop)
  const introItems = buildIntroItems(caseObj)
  const layout = buildLayout(W, H, REVEAL_MS, introItems.length, baseIntroMs)
  const TOTAL_FRAMES = Math.round(layout.TOTAL_MS / 1000 * fps)

  const assets = await loadAssets(caseObj, drop, stripItems, introItems)
  const goldSprite = getGoldSprite()
  const jitter = (Math.random() - 0.5) * (layout.SPIN_ITEM_W * 0.65)
  const userName = opts.userName || ''
  const state = { caseObj, drop, stripItems, introItems, assets, goldSprite, jitter, userName }

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
      const revealT = tMs - layout.REVEAL_START_MS
      // letterbox 出场：与进场镜像对称 —— 进场用 EASE_OUT(t) 从屏外滑入，
      // 出场用 EASE_OUT(1-t) 从位置滑回屏外（顶部向上、底部向下），700ms 完成
      const LBH = layout.LETTERBOX_H
      const dur = 700
      if (revealT < dur) {
        const inv = 1 - revealT / dur            // 1 → 0
        const lbEase = EASE_OUT(inv)             // 1 → 0
        ctx.fillStyle = '#000'
        // 顶部：进场 y = -LBH*(1-ease)；出场反着播放仍是这个公式
        ctx.fillRect(0, -LBH * (1 - lbEase), W, LBH)
        // 底部：进场 y = H-LBH + LBH*(1-ease)
        ctx.fillRect(0, H - LBH + LBH * (1 - lbEase), W, LBH)
      }
      drawReveal(ctx, layout, revealT, state)
    }
    // 右上角全局水印（盖在所有元素之上）
    drawWatermark(ctx, W, H, userName)
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

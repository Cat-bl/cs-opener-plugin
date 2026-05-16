/* 视频帧绘制：背景 / strip / letterbox / intro / reveal */

import { EASE_OUT } from './easing.js'
import { pickGoldImage } from './assets.js'

const RARITY_COLOR = {
  1: 'rgb(176,195,217)', 2: 'rgb(94,152,217)', 3: 'rgb(75,105,255)',
  4: 'rgb(126,71,255)',  5: 'rgb(211,44,230)', 6: 'rgb(235,75,75)', 7: 'rgb(255,215,0)',
}

export function drawBackground(ctx, bg, W, H) {
  if (bg) {
    ctx.save()
    ctx.filter = 'blur(8px)'
    ctx.drawImage(bg, -20, -20, W + 40, H + 40)
    ctx.restore()
  } else {
    ctx.fillStyle = '#0a0d11'
    ctx.fillRect(0, 0, W, H)
  }
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,.55)')
  g.addColorStop(0.5, 'rgba(0,0,0,.35)')
  g.addColorStop(1, 'rgba(0,0,0,.7)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function drawItemCell(ctx, x, y, w, h, item, img, assets, caseObj) {
  if (item.rarityNum === 7) {
    const gi = pickGoldImage(caseObj, assets)
    if (gi) ctx.drawImage(gi, x, y, w, h)
  } else {
    if (assets.itemBg) ctx.drawImage(assets.itemBg, x, y, w, h)
    else {
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, '#3a4250'); g.addColorStop(1, '#1a2029')
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h)
    }
  }
  if (item.rarityNum !== 7 && img) {
    const maxW = w * 0.96, maxH = h * 0.96
    const ar = img.width / img.height
    let iw = maxW, ih = iw / ar
    if (ih > maxH) { ih = maxH; iw = ih * ar }
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
  }
  const barH = 8
  ctx.fillStyle = RARITY_COLOR[item.rarityNum] || RARITY_COLOR[3]
  ctx.fillRect(x, y + h - barH, w, barH)
}

export function drawStrip(ctx, layout, currentX, stripItems, assets, caseObj) {
  const { W, STRIDE, SPIN_ITEM_W, SPIN_ITEM_H, STRIP_Y, TOTAL_ITEMS } = layout
  const startIdx = Math.max(0, Math.floor((-currentX) / STRIDE) - 1)
  const endIdx   = Math.min(TOTAL_ITEMS - 1, startIdx + Math.ceil(W / STRIDE) + 2)
  for (let i = startIdx; i <= endIdx; i++) {
    const x = i * STRIDE + currentX
    if (x + SPIN_ITEM_W < 0 || x > W) continue
    drawItemCell(ctx, x, STRIP_Y, SPIN_ITEM_W, SPIN_ITEM_H, stripItems[i], assets.stripImgs[i], assets, caseObj)
  }
}

export function drawLetterboxAndPointer(ctx, layout, tMs) {
  const { W, H, LETTERBOX_H, POINTER_X } = layout
  const lbT = Math.min(1, tMs / 550)
  const lbEase = EASE_OUT(lbT)
  const lbY = -LETTERBOX_H * (1 - lbEase)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, lbY, W, LETTERBOX_H)
  ctx.fillRect(0, H - LETTERBOX_H + (LETTERBOX_H * (1 - lbEase)), W, LETTERBOX_H)

  const pT = Math.max(0, Math.min(1, (tMs - 250) / 300))
  if (pT > 0) {
    const ease = EASE_OUT(pT)
    ctx.save()
    ctx.globalAlpha = 0.8 * ease
    ctx.fillStyle = 'rgb(180,169,52)'
    const ph = (H - LETTERBOX_H * 2) * ease
    const py = LETTERBOX_H + (H - LETTERBOX_H * 2 - ph) / 2
    ctx.fillRect(POINTER_X - 2, py, 4, ph)
    ctx.restore()
  }
}

/* ---------- 预览页 intro ---------- */

function truncateText(ctx, s, maxW) {
  if (!s) return ''
  if (ctx.measureText(s).width <= maxW) return s
  let t = s
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

function drawIntroCell(ctx, x, y, w, h, item, img, assets, caseObj) {
  if (item.rarityNum === 7) {
    const gi = pickGoldImage(caseObj, assets)
    if (gi) ctx.drawImage(gi, x, y, w, h)
  } else {
    if (assets.itemBg) ctx.drawImage(assets.itemBg, x, y, w, h)
    else {
      const g = ctx.createLinearGradient(0, y, 0, y + h)
      g.addColorStop(0, '#3a4250'); g.addColorStop(1, '#1a2029')
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h)
    }
  }
  if (item.rarityNum !== 7 && img) {
    const maxW = w * 0.96, maxH = h * 0.96
    const ar = img.width / img.height
    let iw = maxW, ih = iw / ar
    if (ih > maxH) { ih = maxH; iw = ih * ar }
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
  }
  const barH = 4
  ctx.fillStyle = RARITY_COLOR[item.rarityNum] || RARITY_COLOR[3]
  ctx.fillRect(x, y + h - barH, w, barH)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  if (item.isGoldSummary) {
    ctx.fillStyle = 'rgb(255,215,0)'
    ctx.font = '700 12px "YaHei",sans-serif'
    ctx.fillText(truncateText(ctx, item.weapon, w), x, y + h + 4)
    ctx.fillStyle = '#fff'
    ctx.font = '11px "YaHei",sans-serif'
    ctx.fillText(truncateText(ctx, item.paint, w), x, y + h + 20)
  } else {
    ctx.fillStyle = '#fff'
    ctx.font = '700 12px "YaHei",sans-serif'
    ctx.fillText(truncateText(ctx, item.weapon, w), x, y + h + 4)
    ctx.font = '11px "YaHei",sans-serif'
    ctx.fillText(truncateText(ctx, item.paint || '原版', w), x, y + h + 20)
  }
}

export function drawIntro(ctx, layout, tMs, state) {
  const {
    W, H, INTRO_MS, TRANSITION_MS,
    VIEW_PAD_X, DROP_CELL_W, DROP_GRID_COLS,
    DROP_CELL_IMG_H, DROP_CELL_H, DROP_CELL_GAP, GRID_START_Y, GRID_BOTTOM_PAD,
    INTRO_SCROLL, INTRO_STAY_BEFORE, INTRO_SCROLL_DUR,
  } = layout
  const { caseObj, assets, introItems } = state

  let dropOffsetY = 0, alpha = 1
  if (tMs >= INTRO_MS) {
    const t = Math.min(1, (tMs - INTRO_MS) / TRANSITION_MS)
    const eased = EASE_OUT(t)
    dropOffsetY = 600 * eased
    alpha = 1 - eased
  }
  if (alpha <= 0) return

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(0, dropOffsetY)

  ctx.fillStyle = 'rgb(218,219,224)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = '300 31px "YaHei",sans-serif'
  ctx.shadowColor = 'rgba(0,0,0,.7)'
  ctx.shadowOffsetY = 2; ctx.shadowBlur = 8
  const title = (caseObj.category === 'weapon_case') ? '开 箱' : (caseObj.categoryLabel || '开 箱')
  ctx.fillText(title, W / 2, 20)

  ctx.fillStyle = 'rgb(205,205,205)'
  ctx.font = '300 18px "YaHei",sans-serif'
  const sub1 = '解锁 '
  const sub1W = ctx.measureText(sub1).width
  ctx.font = '700 18px "YaHei",sans-serif'
  const sub2W = ctx.measureText(caseObj.name).width
  const subY = 60
  ctx.font = '300 18px "YaHei",sans-serif'
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgb(205,205,205)'
  ctx.fillText(sub1, W / 2 - (sub1W + sub2W) / 2, subY)
  ctx.font = '700 18px "YaHei",sans-serif'
  ctx.fillStyle = 'rgb(235,235,240)'
  ctx.fillText(caseObj.name, W / 2 - (sub1W + sub2W) / 2 + sub1W, subY)
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0

  if (assets.caseImg) {
    const caseH = 140
    const ar = assets.caseImg.width / assets.caseImg.height
    const caseW = caseH * ar
    const floatY = Math.sin(tMs / 4000 * Math.PI * 2) * 6
    const cy = 90 + caseH / 2 + floatY
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.7)'
    ctx.shadowOffsetY = 6; ctx.shadowBlur = 16
    ctx.drawImage(assets.caseImg, W / 2 - caseW / 2, cy - caseH / 2, caseW, caseH)
    ctx.restore()
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgb(236,235,240)'
  ctx.font = '13px "YaHei",sans-serif'
  ctx.fillText('这个箱子里可能有以下物品：', VIEW_PAD_X, 248)
  ctx.fillStyle = 'rgba(255,255,255,.15)'
  ctx.fillRect(VIEW_PAD_X, 266, W - VIEW_PAD_X * 2, 1)

  // grid：装得下时静态展示；装不下时滚动（停 1s → 滚 2s → 停 1s）
  const gridStartY = GRID_START_Y
  const cellImgH = DROP_CELL_IMG_H
  const cellH = DROP_CELL_H
  const visibleH = H - gridStartY - GRID_BOTTOM_PAD

  let scrollY = 0
  if (INTRO_SCROLL > 0) {
    if (tMs < INTRO_STAY_BEFORE) {
      scrollY = 0
    } else if (tMs < INTRO_STAY_BEFORE + INTRO_SCROLL_DUR) {
      scrollY = INTRO_SCROLL * (tMs - INTRO_STAY_BEFORE) / INTRO_SCROLL_DUR
    } else {
      scrollY = INTRO_SCROLL
    }
  }

  // clip 限制 grid 区域，超出部分自动裁掉（避免滚动时上下溢出影响标题/箱图）
  ctx.save()
  ctx.beginPath()
  ctx.rect(VIEW_PAD_X, gridStartY, W - VIEW_PAD_X * 2, visibleH)
  ctx.clip()

  for (let i = 0; i < introItems.length; i++) {
    const r = Math.floor(i / DROP_GRID_COLS)
    const c = i % DROP_GRID_COLS
    const x = VIEW_PAD_X + c * (DROP_CELL_W + 12)
    const y = gridStartY + r * (cellH + DROP_CELL_GAP) - scrollY
    // 粗略剔除（cell 完全在 clip 外才跳过）
    if (y + cellH + 24 < gridStartY || y > gridStartY + visibleH) continue
    drawIntroCell(ctx, x, y, DROP_CELL_W, cellImgH, introItems[i], assets.introImgs[i], assets, caseObj)
  }
  ctx.restore()

  ctx.restore()
}

/* ---------- Reveal ---------- */

export function drawReveal(ctx, layout, tMs, drop, assets, caseObj, goldSprite) {
  const { W, H } = layout
  if (drop.rarityNum === 7) {
    const rot = (tMs / 6000) * Math.PI * 2
    const pulseT = (tMs / 2400) * Math.PI * 2
    const pulseAlpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(pulseT))
    const haloSize = Math.max(W, H) * 1.4
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate(rot)
    ctx.globalAlpha = pulseAlpha
    ctx.drawImage(goldSprite, -haloSize/2, -haloSize/2, haloSize, haloSize)
    ctx.restore()
  }

  const t = Math.min(1, tMs / 600)
  const ease = EASE_OUT(t)
  const scale = 0.4 + 0.6 * ease + (t < 0.7 ? 0.06 * Math.sin(t * Math.PI) : 0)
  const alpha = ease

  ctx.save()
  ctx.globalAlpha = alpha

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = '700 30px "YaHei",sans-serif'
  ctx.shadowColor = 'rgba(0,0,0,.8)'
  ctx.shadowOffsetY = 2; ctx.shadowBlur = 8
  const nameLine =
    `${drop.weapon}${drop.paint ? ' | ' + drop.paint : ''}${drop.isStatTrak ? ' (StatTrak™)' : ''}`
  ctx.fillText(nameLine, W / 2, H * 0.12)
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  ctx.fillStyle = drop.rarityColor || RARITY_COLOR[drop.rarityNum] || '#fff'
  ctx.fillRect(W / 2 - 40, H * 0.12 + 42, 80, 3)

  if (assets.dropImg) {
    const maxW = W * 0.7, maxH = H * 0.6
    const ar = assets.dropImg.width / assets.dropImg.height
    let iw = maxW, ih = iw / ar
    if (ih > maxH) { ih = maxH; iw = ih * ar }
    iw *= scale; ih *= scale
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.8)'
    ctx.shadowOffsetY = 14; ctx.shadowBlur = 30
    ctx.drawImage(assets.dropImg, W / 2 - iw / 2, H / 2 - ih / 2, iw, ih)
    ctx.restore()
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.font = '14px "YaHei",sans-serif'
  const lines = []
  if (drop.wear != null) lines.push(`磨损: ${drop.wear.toFixed(13)}`)
  if (drop.pattern != null) lines.push(`图案模板: ${drop.pattern}`)
  lines.push(`箱: ${caseObj.name}`)
  ctx.shadowColor = 'rgba(0,0,0,.8)'
  ctx.shadowBlur = 6
  let ly = H - 24
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillStyle = '#fff'
    ctx.fillText(lines[i], 24, ly)
    ly -= 22
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,.6)'
  ctx.font = '13px "YaHei",sans-serif'
  ctx.fillText('开箱完成', W - 24, H - 24)
  ctx.restore()
}

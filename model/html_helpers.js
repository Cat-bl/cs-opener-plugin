/* HTML 拼接公共工具：转义 / 用户名 / 时间格式化 / 物品卡 / 箱卡 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RARITY } from './rarity.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* 图片绝对路径转 file:// URL（puppeteer 加载本地图片用） */
export function fileUrl(absPath) {
  if (!absPath) return ''
  if (typeof absPath !== 'string') return ''
  if (absPath.startsWith('http')) return absPath
  if (absPath.startsWith('file://')) return absPath
  const norm = absPath.replace(/\\/g, '/')
  return 'file:///' + norm
}

export function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getMonth()+1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function rarityColor(num) {
  return RARITY[num]?.color || '#888'
}
export function rarityName(num) {
  return RARITY[num]?.name || '-'
}

/* shop card */
export function renderCaseCard(c) {
  return `
    <div class="case-card">
      <div class="case-img-wrap">
        <img src="${fileUrl(c.image)}" alt="${escapeHtml(c.name)}">
      </div>
      <div class="case-name">${escapeHtml(c.name)}</div>
      <div class="case-meta">
        <span class="case-price">¥${c.price}</span>
        <span class="case-cta">→</span>
      </div>
    </div>`
}

/* 仓库 card */
export function renderInventoryCard(it) {
  const color = rarityColor(it.rarityNum)
  const stTag = it.isStatTrak ? `<div class="st-tag">StatTrak™</div>` : ''
  return `
    <div class="inv-card" style="--rc:${color}">
      <div class="inv-img">
        ${stTag}
        <img src="${fileUrl(it.image)}" alt="${escapeHtml(it.weapon)}">
        <div class="inv-bar" style="background:${color}"></div>
      </div>
      <div class="inv-weapon">${escapeHtml(it.weapon)}</div>
      <div class="inv-name">${escapeHtml(it.paint || '原版')}</div>
      <div class="inv-meta">
        <span class="inv-tier">${escapeHtml(it.wearTier || '-')}</span>
        <span>${(it.uid || '').slice(0, 6)}</span>
      </div>
    </div>`
}

/* 详情页物品 cell */
export function renderDetailItem(s, isGold = false, goldImg = null) {
  if (isGold) {
    return `
      <li>
        <div class="item-a gold-cell">
          <div class="color7 bar"></div>
          <img src="${fileUrl(goldImg)}">
        </div>
        <div class="media-body">
          <b style="color:rgb(255,215,0);">★ 罕见特殊物品</b>
          <p>${s.paint || ''}</p>
        </div>
      </li>`
  }
  return `
    <li>
      <div class="item-a">
        <div class="color${s.rarityNum} bar"></div>
        <img src="${fileUrl(s.image)}">
      </div>
      <div class="media-body">
        <b>${escapeHtml(s.weapon)}</b>
        <p>${escapeHtml(s.paint || '原版')}</p>
      </div>
    </li>`
}

/* 史记 row */
export function renderHistRow(it) {
  return `
    <div class="hist-row">
      <div class="hist-time">${formatTime(it.obtainedAt)}</div>
      <div class="hist-name">
        <div class="hist-dot" style="background:${rarityColor(it.rarityNum)}"></div>
        <span>${escapeHtml(it.weapon)}${it.paint ? ' | ' + escapeHtml(it.paint) : ''}</span>
      </div>
      <div class="hist-case">${escapeHtml(it.caseName || '-')}</div>
      <div class="hist-wear">${it.wear != null ? it.wear.toFixed(3) : '-'}</div>
      <div>${it.isStatTrak ? '<span class="stattrakcolor">ST</span>' : '-'}</div>
    </div>`
}

/* 获取用户昵称（Yunzai 环境 e.sender.card 或 nickname；本地 fallback uid） */
export function userNickname(e) {
  return e?.sender?.card || e?.sender?.nickname || e?.member?.card || String(e?.user_id || 'user')
}

/* 随机 cs 地图背景（用于 case-detail 背景） */
const CS_BG = ['ancient_0', 'anubis_0', 'baggage_0', 'dust2_0', 'inferno_0',
               'mission_0', 'nuke_0', 'office_0', 'overpass_0', 'warehouse_0']
export function randomBgUrl() {
  const name = CS_BG[Math.floor(Math.random() * CS_BG.length)]
  return fileUrl(path.join(PLUGIN_ROOT, 'assets', 'bg', `${name}.jpg`))
}

export function pickGoldImageUrl(caseObj) {
  const n = (caseObj && caseObj.name) || ''
  if (n.includes('画廊')) return fileUrl(path.join(PLUGIN_ROOT, 'assets', 'img', 'gold2.jpg'))
  if (n.includes('狂牙')) return fileUrl(path.join(PLUGIN_ROOT, 'assets', 'img', 'gold1.jpg'))
  return fileUrl(path.join(PLUGIN_ROOT, 'assets', 'img', 'gold.jpg'))
}

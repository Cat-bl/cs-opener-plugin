/* 箱子数据：从 assets/data/crates.json 加载并预处理为内部 CASES 数组
 *
 * Node 端简化版（去掉网页版的 localStorage 缓存 + 远程兜底）
 * 与网页版 js/data.js 共用 hashUrl / rewriteToLocal 算法
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const CRATES_JSON = path.join(PLUGIN_ROOT, 'assets', 'data', 'crates.json')
const SKINS_DIR   = path.join(PLUGIN_ROOT, 'assets', 'skins')

/* FNV-1a 64-bit hash, 16-hex 零填充, 与 tools/download_skins.mjs 一致 */
export function hashUrl(url) {
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask  = 0xffffffffffffffffn
  for (let i = 0; i < url.length; i++) {
    h ^= BigInt(url.charCodeAt(i))
    h = (h * prime) & mask
  }
  return h.toString(16).padStart(16, '0')
}

export function rewriteToLocal(url, kind /* 'crate' | 'item' */) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return url
  return path.join(SKINS_DIR, kind === 'crate' ? 'crates' : 'items', `${hashUrl(url)}.png`)
}

const RARITY_NUM_MAP = {
  'rarity_common_weapon':    1,
  'rarity_uncommon_weapon':  2,
  'rarity_rare_weapon':      3,
  'rarity_mythical_weapon':  4,
  'rarity_legendary_weapon': 5,
  'rarity_ancient_weapon':   6,
  'rarity_rare':             3,
  'rarity_mythical':         4,
  'rarity_legendary':        5,
  'rarity_ancient':          6,
  'rarity_rare_character':       3,
  'rarity_mythical_character':   4,
  'rarity_legendary_character':  5,
  'rarity_ancient_character':    6,
  'rarity_contraband':       7,
  'rarity_immortal':         7,
}

const CATEGORY_MAP = {
  'Case':                'weapon_case',
  'Souvenir':            'souvenir',
  'Souvenir Highlight':  'highlight',
  'Sticker Capsule':     'sticker',
  'Autograph Capsule':   'autograph',
  'Patch Capsule':       'patch',
  'Pins':                'pin',
  'Graffiti':            'graffiti',
  'Music Kit Box':       'musickit',
}

export const CATEGORIES = [
  { key: 'weapon_case',  label: '武器箱',       priceLabel: '钥匙 ¥17',  price: 17, hasWear: true,  hasStatTrak: true,  hasPattern: true  },
  { key: 'souvenir',     label: '纪念包',       priceLabel: '¥17',       price: 17, hasWear: true,  hasStatTrak: false, hasPattern: true  },
  { key: 'highlight',    label: '高光纪念包',   priceLabel: '¥17',       price: 17, hasWear: true,  hasStatTrak: false, hasPattern: true  },
  { key: 'sticker',      label: '印花胶囊',     priceLabel: '¥7',        price: 7,  hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'autograph',    label: '签名胶囊',     priceLabel: '¥15',       price: 15, hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'patch',        label: '布章包',       priceLabel: '¥7',        price: 7,  hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'pin',          label: '胸章胶囊',     priceLabel: '¥7',        price: 7,  hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'graffiti',     label: '涂鸦箱',       priceLabel: '¥3',        price: 3,  hasWear: false, hasStatTrak: false, hasPattern: false },
  { key: 'musickit',     label: '音乐盒集',     priceLabel: '¥17',       price: 17, hasWear: false, hasStatTrak: true,  hasPattern: false },
]
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))

function toSkin(s) {
  const raw = s.name == null ? '' : String(s.name)
  const parts = raw.split('|').map(x => x.trim())
  return {
    id: s.id,
    name: raw,
    weapon: parts[0] || raw,
    paint: parts.slice(1).join(' | ') || '',
    image: rewriteToLocal(s.image, 'item'),
  }
}

function processCrates(raw) {
  return raw
    .filter(c => c && c.type && CATEGORY_MAP[c.type] && Array.isArray(c.contains) && c.contains.length > 0)
    .map(c => {
      const category = CATEGORY_MAP[c.type]
      const meta = CATEGORY_BY_KEY[category]
      const byNum = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }
      for (const s of c.contains) {
        const num = RARITY_NUM_MAP[s.rarity?.id] || 3
        byNum[num].push(toSkin(s))
      }
      let hasRare = false
      if (Array.isArray(c.contains_rare) && c.contains_rare.length > 0) {
        for (const s of c.contains_rare) byNum[7].push(toSkin(s))
        hasRare = true
      }
      const presentTiers = []
      for (let n = 1; n <= 7; n++) if (byNum[n].length > 0) presentTiers.push(n)

      return {
        id: c.id,
        name: c.name,
        image: rewriteToLocal(c.image, 'crate'),
        firstSaleDate: c.first_sale_date,
        marketName: c.market_hash_name,
        category,
        categoryLabel: meta.label,
        hasWear: meta.hasWear,
        hasStatTrak: meta.hasStatTrak,
        hasPattern: meta.hasPattern,
        hasRare,
        price: meta.price,
        skinsByNum: byNum,
        presentTiers,
      }
    })
    .filter(c => c.presentTiers.length > 0)
    .sort((a, b) => {
      const ca = CATEGORIES.findIndex(x => x.key === a.category)
      const cb = CATEGORIES.findIndex(x => x.key === b.category)
      if (ca !== cb) return ca - cb
      return (b.firstSaleDate || '').localeCompare(a.firstSaleDate || '')
    })
}

let CASES = []
let loaded = false
let loadingPromise = null

export async function loadCases() {
  if (loaded) return CASES
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const raw = JSON.parse(await fs.readFile(CRATES_JSON, 'utf8'))
    CASES = processCrates(raw)
    loaded = true
    return CASES
  })()
  return loadingPromise
}

/* 重新从磁盘读 crates.json，丢弃旧 CASES，返回新箱数量 */
export async function reloadCases() {
  loaded = false
  loadingPromise = null
  await loadCases()
  return CASES.length
}

export function getCases() { return CASES }
export function getCase(id) { return CASES.find(c => c.id === id) }
export function getCasesByCategory(key) { return CASES.filter(c => c.category === key) }

/* 按用户输入（精确名 或 包含匹配）查找箱子 */
export function findCaseByName(name) {
  if (!name) return null
  const trimmed = name.trim()
  return CASES.find(c => c.name === trimmed)
      || CASES.find(c => c.name.includes(trimmed))
      || null
}

export function getCategoryByKey(key) {
  return CATEGORY_BY_KEY[key]
}

export function findCategoryByLabel(label) {
  if (!label) return null
  const t = label.trim()
  return CATEGORIES.find(c => c.label === t)
      || CATEGORIES.find(c => c.label.includes(t))
      || null
}
